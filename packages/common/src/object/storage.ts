import { type StorageBackend, resolveStorage } from "./storage/backend.js";
import {
  CURRENT_STORAGE_MARKER,
  STORAGE_RECORD_MARKER,
  type StorageRecord,
  normalizeExpired,
  parseStorageRecord,
  serializeStorageRecord,
  toExpiresAt,
} from "./storage/record.js";

/**
 * Web Storage 可用的存储类型。
 * `local` 持久到浏览器清除站点数据，`session` 只在当前标签页会话内有效。
 */
export type StorageType = "local" | "session";

/**
 * 缓存 key 处理函数。
 * 调用时收到的参数已经包含 `prefix`，返回值参与构造底层存储 key。
 */
export type StorageKeyHandler = (key: string) => string;

/** 通用缓存配置；浏览器端额外支持 `type`。 */
export interface StorageOptions {
  /** 默认过期时间，单位为秒；小于等于 0 表示不过期。 */
  expired?: number;
  /** 缓存命名空间前缀，默认是空字符串。 */
  prefix?: string;
  /** key 处理函数；未提供时直接使用 `prefix + key`。 */
  key?: StorageKeyHandler;
  /** 浏览器存储类型，默认使用 `localStorage`。 */
  type?: StorageType;
}

/** v2 私有物理键的固定前缀，用于区分受本库管理的命名空间键与普通业务键。 */
const CURRENT_STORAGE_KEY_PREFIX = `${CURRENT_STORAGE_MARKER}/`;

/**
 * 通用缓存工具。
 *
 * 浏览器优先使用 `localStorage`/`sessionStorage`；在 Node 或 Web Storage 不可用时，
 * 实例创建时自动降级到进程内 Map。缓存值通过 JSON 编解码，因此不支持循环引用、BigInt、
 * 非有限数字、`undefined`、函数和 Symbol。
 * `Key` 可指定业务 key 的字符串联合类型，默认接受任意字符串；仅提供静态提示与约束。
 */
export class StorageUtils<Key extends string = string> {
  declare private readonly expired: number;
  declare private readonly prefix: string;
  declare private readonly keyHandler: StorageKeyHandler | undefined;
  declare private readonly storage: StorageBackend;
  declare private readonly keyCache: Map<string, string> | undefined;

  constructor(options: StorageOptions = {}) {
    this.expired = normalizeExpired(options.expired);
    this.prefix = options.prefix ?? "";
    this.keyHandler = options.key;
    this.storage = resolveStorage(options.type === undefined ? "local" : options.type);
    this.keyCache = this.keyHandler === undefined ? undefined : new Map();
  }

  /**
   * 写入缓存。
   * `expired` 未传时使用构造函数配置；小于等于 0 表示不过期。
   * 新键写入成功即生效，清理同一业务键的旧格式记录失败时仍视为写入成功。
   * 缓存值不能包含非有限数字、`undefined`、函数或 Symbol，否则会抛出 `TypeError`；
   * 过期时间计算结果超出安全时间范围时抛出 `RangeError`。
   */
  set<T = unknown>(key: Key, value: T, expired?: number): void {
    const record: StorageRecord = {
      data: value,
      expiresAt: toExpiresAt(expired === undefined ? this.expired : expired),
      marker: CURRENT_STORAGE_MARKER,
      prefix: this.prefix,
    };

    const [current, legacy] = this.getKeys(key);
    const serialized = serializeStorageRecord(record);
    // v2 私有物理键上的损坏内容允许直接覆盖恢复；若已被其他合法记录占用则拒绝覆写。
    const previous = this.storage.getItem(current);
    if (previous !== null) {
      const existing = parseStorageRecord(previous);
      if (
        existing !== null &&
        (existing.marker !== CURRENT_STORAGE_MARKER || existing.prefix !== this.prefix)
      ) {
        throw new Error("缓存键已被其他数据占用");
      }
    }
    // 新键写入成功即提交。若写入失败，原有的新旧记录都仍在原位。
    this.storage.setItem(current, serialized);
    try {
      this.removeOwned(legacy, STORAGE_RECORD_MARKER);
    } catch {
      // 读取优先使用已提交的新键。旧键清理失败可留到下次写入、删除或过期时重试。
    }
  }

  /** 将命名空间与转换后的键分别编码，保留同一前缀内的自定义键别名。 */
  private getKeys(key: Key): [string, string] {
    const legacy = this.getStorageKey(key);
    return [`${CURRENT_STORAGE_KEY_PREFIX}${JSON.stringify([this.prefix, legacy])}`, legacy];
  }

  /** 判断物理键是否为当前命名空间的 v2 私有键，用于在记录损坏时仍能按归属清理。 */
  private isOwnedCurrentKey(storageKey: string): boolean {
    if (!storageKey.startsWith(CURRENT_STORAGE_KEY_PREFIX)) return false;
    try {
      const parsed: unknown = JSON.parse(storageKey.slice(CURRENT_STORAGE_KEY_PREFIX.length));
      return (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        parsed[0] === this.prefix &&
        typeof parsed[1] === "string"
      );
    } catch {
      return false;
    }
  }

  /** 识别给定版本与命名空间的有效记录，其他格式按未命中处理。 */
  private ownedRecord(value: string | null, marker: StorageRecord["marker"]): StorageRecord | null {
    const record = value === null ? null : parseStorageRecord(value);
    return record?.marker === marker && record.prefix === this.prefix ? record : null;
  }

  /** 删除前重新检查所有权，保留占用同一物理键的业务数据。 */
  private removeOwned(key: string, marker: StorageRecord["marker"]): void {
    if (this.ownedRecord(this.storage.getItem(key), marker)) this.storage.removeItem(key);
  }

  /** 删除当前业务键的 v2 私有键：允许清理本命名空间记录与损坏内容，保留其他合法记录。 */
  private removeCurrent(key: string): void {
    const value = this.storage.getItem(key);
    if (value === null) return;
    const record = parseStorageRecord(value);
    if (
      record === null ||
      (record.marker === CURRENT_STORAGE_MARKER && record.prefix === this.prefix)
    ) {
      this.storage.removeItem(key);
    }
  }

  /** 优先读取新键，再兼容所属旧记录；过期时同时清理两种格式。 */
  get<T = unknown>(key: Key): T | null {
    const [current, legacy] = this.getKeys(key);
    const record =
      this.ownedRecord(this.storage.getItem(current), CURRENT_STORAGE_MARKER) ??
      this.ownedRecord(this.storage.getItem(legacy), STORAGE_RECORD_MARKER);
    if (!record) return null;
    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      this.remove(key);
      return null;
    }
    return record.data as T;
  }

  /** 删除当前业务键所属的新旧记录；先处理旧键以免旧值重新可见。 */
  remove(key: Key): void {
    const [current, legacy] = this.getKeys(key);
    this.removeOwned(legacy, STORAGE_RECORD_MARKER);
    this.removeCurrent(current);
  }

  /**
   * 清空当前实例的命名空间。
   * 通过记录标记和 prefix 识别条目，不调用底层 `Storage.clear()`，避免删除其他业务数据。
   */
  clear(): void {
    // 新物理键包含完整编码的旧键，长度一定更长。先清短键，部分清理失败时旧值仍被新键遮住。
    const keys = this.storage.keys().sort((a, b) => a.length - b.length);
    for (const key of keys) {
      const value = this.storage.getItem(key);
      if (value === null) {
        continue;
      }

      const record = parseStorageRecord(value);
      // 合法记录按 prefix 归属清理；损坏内容仅在属于当前命名空间的 v2 私有键时清理。
      if (record !== null ? record.prefix === this.prefix : this.isOwnedCurrentKey(key)) {
        this.storage.removeItem(key);
      }
    }
  }

  /** 读取安全版本：任意异常都返回 `null`。 */
  getSafe<T = unknown>(key: Key): T | null {
    try {
      return this.get<T>(key);
    } catch {
      return null;
    }
  }

  /** 写入安全版本：成功返回 `true`，任意异常返回 `false`。 */
  setSafe<T = unknown>(key: Key, value: T, expired?: number): boolean {
    try {
      this.set(key, value, expired);
      return true;
    } catch {
      return false;
    }
  }

  /** 删除安全版本：成功返回 `true`，任意异常返回 `false`。 */
  removeSafe(key: Key): boolean {
    try {
      this.remove(key);
      return true;
    } catch {
      return false;
    }
  }

  /** 清空安全版本：成功返回 `true`，任意异常返回 `false`。 */
  clearSafe(): boolean {
    try {
      this.clear();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 未配置处理函数时直接拼接；配置后在实例生命周期内复用首次处理结果。
   * key 处理函数收到的是 `prefix + key`，保持有状态处理函数的映射稳定。
   */
  private getStorageKey(key: Key): string {
    if (this.keyHandler === undefined || this.keyCache === undefined) {
      return this.prefix + key;
    }
    const cached = this.keyCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const storageKey = this.keyHandler(this.prefix + key);
    this.keyCache.set(key, storageKey);
    return storageKey;
  }
}
