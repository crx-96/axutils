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

interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface GlobalStorageObjects {
  localStorage?: unknown;
  sessionStorage?: unknown;
}

const STORAGE_RECORD_MARKER = "@axutils/common/storage";
let storageProbeSequence = 0;

interface StorageRecord {
  marker: typeof STORAGE_RECORD_MARKER;
  prefix: string;
  expiresAt: number;
  data: unknown;
}

/**
 * 无 Web Storage 环境下的轻量适配器。
 * 这里保留字符串存储语义，使 Node 降级路径与浏览器 JSON 存储路径一致。
 */
class MapStorage implements StorageLike {
  private declare readonly values: Map<string, string>;

  constructor() {
    this.values = new Map();
  }

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

// 每种 Web Storage 类型使用独立降级空间，避免 session 与 local 相互污染。
const fallbackStorages: Record<StorageType, StorageLike> = {
  local: new MapStorage(),
  session: new MapStorage(),
};

const isStorageLike = (value: unknown): value is StorageLike => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StorageLike>;
  return (
    typeof candidate.length === "number" &&
    typeof candidate.getItem === "function" &&
    typeof candidate.key === "function" &&
    typeof candidate.removeItem === "function" &&
    typeof candidate.setItem === "function"
  );
};

/**
 * 探测 Web Storage 是否真正可读写。
 * 仅检查对象形状无法覆盖隐私模式、禁用存储或配额限制等运行时异常，因此实例创建时会执行一次临时读写。
 */
const canUseStorage = (storage: StorageLike): boolean => {
  storageProbeSequence += 1;
  const probeKey = `${STORAGE_RECORD_MARKER}/probe/${Date.now()}/${storageProbeSequence}`;
  let shouldCleanup = false;

  try {
    storage.setItem(probeKey, probeKey);
    shouldCleanup = true;
    if (storage.getItem(probeKey) !== probeKey) {
      return false;
    }
    storage.removeItem(probeKey);
    if (storage.getItem(probeKey) !== null) {
      return false;
    }
    shouldCleanup = false;
    return true;
  } catch {
    return false;
  } finally {
    if (shouldCleanup) {
      try {
        storage.removeItem(probeKey);
      } catch {
        // 探测失败后只能尽力清理；实例会固定降级到内存存储，不再继续使用该对象。
      }
    }
  }
};

/**
 * 读取浏览器存储对象。
 * 除属性访问外还执行一次临时读写探测，确保返回的对象在当前环境中真正可用。
 */
const resolveStorage = (type: StorageType): StorageLike => {
  const property = type === "session" ? "sessionStorage" : "localStorage";

  try {
    const globals = globalThis as unknown as GlobalStorageObjects;
    const storage = globals[property];
    if (isStorageLike(storage) && canUseStorage(storage)) {
      return storage;
    }
  } catch {
    // 访问受限时使用内存实现，保证通用 API 在 Node/隐私模式下仍可调用。
  }

  return fallbackStorages[type];
};

const normalizeExpired = (expired: number | undefined): number => {
  if (expired === undefined) {
    return 0;
  }
  if (!Number.isFinite(expired)) {
    throw new TypeError("expired 必须是有限数字");
  }
  return expired;
};

const toExpiresAt = (expired: number | undefined): number => {
  const normalized = normalizeExpired(expired);
  if (normalized <= 0) {
    return 0;
  }

  const expiresAt = Math.floor(Date.now() + normalized * 1000);
  if (!Number.isFinite(expiresAt) || !Number.isSafeInteger(expiresAt)) {
    throw new RangeError("expired 计算结果超出安全时间范围");
  }
  return expiresAt;
};

const parseStorageRecord = (value: string): StorageRecord | null => {
  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Partial<StorageRecord>;
    if (
      record.marker !== STORAGE_RECORD_MARKER ||
      typeof record.prefix !== "string" ||
      typeof record.expiresAt !== "number"
    ) {
      return null;
    }

    return record as StorageRecord;
  } catch {
    // 被破坏的缓存只视为缓存未命中；下一次写入可以覆盖它。
    return null;
  }
};

/**
 * 将缓存记录序列化为 JSON。
 * 原生 JSON 会静默忽略 `undefined`、函数和 Symbol；缓存写入必须拒绝这些值，避免 set 成功后读取结果失真。
 */
const serializeStorageRecord = (record: StorageRecord): string => {
  const serialized = JSON.stringify(record, (_key, value: unknown) => {
    const valueType = typeof value;
    if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
      throw new TypeError("缓存值不能包含 undefined、函数或 Symbol");
    }
    return value;
  });

  if (serialized === undefined) {
    throw new TypeError("缓存值无法序列化为 JSON");
  }
  return serialized;
};

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
  private declare readonly storage: StorageLike;
  private declare readonly keyCache: Map<string, string>;

  constructor(options: StorageOptions = {}) {
    this.expired = normalizeExpired(options.expired);
    this.prefix = options.prefix ?? "";
    this.keyHandler = options.key;
    this.storage = resolveStorage(options.type ?? "local");
    this.keyCache = new Map();
  }

  /**
   * 写入缓存。
   * `expired` 未传时使用构造函数配置；小于等于 0 表示不过期。
   * 缓存值不能包含 `undefined`、函数或 Symbol，否则会抛出 `TypeError`；
   * 过期时间计算结果超出安全时间范围时抛出 `RangeError`。
   */
  set<T = unknown>(key: string, value: T, expired?: number): void {
    const record: StorageRecord = {
      marker: STORAGE_RECORD_MARKER,
      prefix: this.prefix,
      expiresAt: toExpiresAt(expired === undefined ? this.expired : expired),
      data: value,
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
    const keys: string[] = [];

    // 先复制 key，再执行删除，避免 localStorage 删除后索引移动导致漏删。
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key !== null) {
        keys.push(key);
      }
    }

    for (const key of keys) {
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
   * 生成底层 key，并缓存处理结果。
   * key 处理函数收到的是 `prefix + key`，与附件中的 MD5 用法保持一致。
   */
  private getStorageKey(key: string): string {
    const cached = this.keyCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const rawKey = this.prefix + key;
    const storageKey = this.keyHandler === undefined ? rawKey : this.keyHandler(rawKey);
    this.keyCache.set(key, storageKey);
    return storageKey;
  }
}
