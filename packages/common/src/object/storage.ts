import { type StorageBackend, resolveStorage } from "./storage/backend.js";
import {
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
 * 调用时收到的参数已经包含 `prefix`，返回值会直接作为底层存储 key。
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

/**
 * 通用缓存工具。
 *
 * 浏览器优先使用 `localStorage`/`sessionStorage`；在 Node 或 Web Storage 不可用时，
 * 实例创建时自动降级到进程内 Map。缓存值通过 JSON 编解码，因此不支持循环引用、BigInt、
 * `undefined`、函数和 Symbol。
 */
export class StorageUtils {
  private declare readonly expired: number;
  private declare readonly prefix: string;
  private declare readonly keyHandler: StorageKeyHandler | undefined;
  private declare readonly storage: StorageBackend;
  private declare readonly keyCache: Map<string, string> | undefined;

  constructor(options: StorageOptions = {}) {
    this.expired = normalizeExpired(options.expired);
    this.prefix = options.prefix ?? "";
    this.keyHandler = options.key;
    this.storage = resolveStorage(options.type ?? "local");
    this.keyCache = this.keyHandler === undefined ? undefined : new Map();
  }

  /**
   * 写入缓存。
   * `expired` 未传时使用构造函数配置；小于等于 0 表示不过期。
   * 缓存值不能包含 `undefined`、函数或 Symbol，否则会抛出 `TypeError`；
   * 过期时间计算结果超出安全时间范围时抛出 `RangeError`。
   */
  set<T = unknown>(key: string, value: T, expired?: number): void {
    const record: StorageRecord = {
      data: value,
      expiresAt: toExpiresAt(expired === undefined ? this.expired : expired),
      marker: STORAGE_RECORD_MARKER,
      prefix: this.prefix,
    };

    this.storage.setItem(this.getStorageKey(key), serializeStorageRecord(record));
  }

  /** 读取缓存；不存在、过期或数据损坏时返回 `null`。 */
  get<T = unknown>(key: string): T | null {
    const storageKey = this.getStorageKey(key);
    const value = this.storage.getItem(storageKey);

    if (value === null) {
      return null;
    }

    const record = parseStorageRecord(value);
    if (record === null || record.prefix !== this.prefix) {
      return null;
    }
    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      this.storage.removeItem(storageKey);
      return null;
    }

    return record.data as T;
  }

  /** 删除一个缓存条目。 */
  remove(key: string): void {
    this.storage.removeItem(this.getStorageKey(key));
  }

  /**
   * 清空当前实例的命名空间。
   * 通过记录标记和 prefix 识别条目，不调用底层 `Storage.clear()`，避免删除其他业务数据。
   */
  clear(): void {
    // 后端只生成一次键快照；Map 无需为每一个索引重新展开全部键。
    for (const key of this.storage.keys()) {
      const value = this.storage.getItem(key);
      if (value === null) {
        continue;
      }

      const record = parseStorageRecord(value);
      if (record?.prefix === this.prefix) {
        this.storage.removeItem(key);
      }
    }
  }

  /** 读取安全版本：任意异常都返回 `null`。 */
  getSafe<T = unknown>(key: string): T | null {
    try {
      return this.get<T>(key);
    } catch {
      return null;
    }
  }

  /** 写入安全版本：成功返回 `true`，任意异常返回 `false`。 */
  setSafe<T = unknown>(key: string, value: T, expired?: number): boolean {
    try {
      this.set(key, value, expired);
      return true;
    } catch {
      return false;
    }
  }

  /** 删除安全版本：成功返回 `true`，任意异常返回 `false`。 */
  removeSafe(key: string): boolean {
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
  private getStorageKey(key: string): string {
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
