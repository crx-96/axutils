/** Node 端缓存 key 处理函数。 */
export type StorageKeyHandler = (key: string) => string;

/** Node 端缓存配置；不包含浏览器的 `type` 参数。 */
export interface StorageOptions {
  /** 默认过期时间，单位为秒；小于等于 0 表示不过期。 */
  expired?: number;
  /** 缓存命名空间前缀，默认是空字符串。 */
  prefix?: string;
  /** key 处理函数；未提供时直接使用 `prefix + key`。 */
  key?: StorageKeyHandler;
}

const STORAGE_RECORD_MARKER = "@axutils/common/node-storage";

interface StorageRecord {
  marker: typeof STORAGE_RECORD_MARKER;
  prefix: string;
  expiresAt: number;
  data: unknown;
}

// 所有 Node StorageUtils 实例共享同一个进程内 Map，行为接近同一进程中的缓存服务。
const memoryStorage = new Map<string, StorageRecord>();

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

/**
 * Node 端高性能进程内缓存。
 * 直接保存值引用，不做 JSON 编解码，因此读写开销低，并支持循环对象等 Node 内存值。
 */
export class StorageUtils {
  private declare readonly expired: number;
  private declare readonly prefix: string;
  private declare readonly keyHandler: StorageKeyHandler | undefined;
  private declare readonly keyCache: Map<string, string>;

  constructor(options: StorageOptions = {}) {
    this.expired = normalizeExpired(options.expired);
    this.prefix = options.prefix ?? "";
    this.keyHandler = options.key;
    this.keyCache = new Map();
  }

  /**
   * 写入缓存。
   * `expired` 单位为秒，小于等于 0 表示不过期；计算结果超出安全时间范围时抛出 `RangeError`。
   */
  set<T = unknown>(key: string, value: T, expired?: number): void {
    memoryStorage.set(this.getStorageKey(key), {
      marker: STORAGE_RECORD_MARKER,
      prefix: this.prefix,
      expiresAt: toExpiresAt(expired === undefined ? this.expired : expired),
      data: value,
    });
  }

  /** 读取缓存；不存在或过期时返回 `null`。 */
  get<T = unknown>(key: string): T | null {
    const storageKey = this.getStorageKey(key);
    const record = memoryStorage.get(storageKey);

    if (record === undefined || record.marker !== STORAGE_RECORD_MARKER) {
      return null;
    }
    if (record.prefix !== this.prefix) {
      return null;
    }
    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      memoryStorage.delete(storageKey);
      return null;
    }

    return record.data as T;
  }

  /** 删除一个缓存条目。 */
  remove(key: string): void {
    memoryStorage.delete(this.getStorageKey(key));
  }

  /** 只清空当前 prefix 命名空间，不影响其他缓存实例。 */
  clear(): void {
    for (const [key, record] of memoryStorage) {
      if (record.marker === STORAGE_RECORD_MARKER && record.prefix === this.prefix) {
        memoryStorage.delete(key);
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

  /** 生成并缓存底层 key；处理函数收到的是 `prefix + key`。 */
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
