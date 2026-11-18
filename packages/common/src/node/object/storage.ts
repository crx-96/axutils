import { normalizeExpired, toExpiresAt } from "../../object/storage/record.js";

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

/** Node 记录直接持有业务值。 */
interface StorageRecord {
  /** 毫秒时间戳，0 表示永不过期。 */
  expiresAt: number;
  /** 调用方传入的原引用。 */
  data: unknown;
}

/** 同一前缀的实例共享数据和清理进度。 */
interface Namespace {
  /** 以转换后的键查找记录。 */
  records: Map<string, StorageRecord>;
  /** 将一次到期清理分摊到连续写入，避免大命名空间在单次 set 中被完整扫描。 */
  sweep?: IterableIterator<[string, StorageRecord]>;
  /** 最早可能到期的时间，无待清理记录时为 Infinity。 */
  nextExpiry: number;
}

/** 非空命名空间的进程级索引。 */
const memoryStorage = new Map<string, Namespace>();

/**
 * Node 端高性能进程内缓存。
 * 直接保存值引用，不做 JSON 编解码，因此读写开销低，并支持循环对象等 Node 内存值。
 * `Key` 可指定业务 key 的字符串联合类型，默认接受任意字符串；仅提供静态提示与约束。
 */
export class StorageUtils<Key extends string = string> {
  private declare readonly expired: number;
  private declare readonly prefix: string;
  private declare readonly keyHandler: StorageKeyHandler | undefined;
  private declare readonly keyCache: Map<string, string> | undefined;

  constructor(options: StorageOptions = {}) {
    this.expired = normalizeExpired(options.expired);
    this.prefix = options.prefix ?? "";
    this.keyHandler = options.key;
    this.keyCache = this.keyHandler === undefined ? undefined : new Map();
  }

  /**
   * 写入缓存。
   * `expired` 单位为秒，小于等于 0 表示不过期；计算结果超出安全时间范围时抛出 `RangeError`。
   */
  set<T = unknown>(key: Key, value: T, expired?: number): void {
    const storageKey = this.getStorageKey(key);
    const expiresAt = toExpiresAt(expired === undefined ? this.expired : expired);
    let namespace = memoryStorage.get(this.prefix);
    if (!namespace) {
      namespace = { nextExpiry: Infinity, records: new Map() };
      memoryStorage.set(this.prefix, namespace);
    }
    const now = Date.now();
    if (!namespace.sweep && namespace.nextExpiry <= now) {
      namespace.sweep = namespace.records.entries();
      namespace.nextExpiry = Infinity;
    }
    // 每次写入最多检查八条，比新键增长得快，同时限制单次调用的清理成本。
    for (let remaining = 8; namespace.sweep && remaining > 0; remaining--) {
      const next = namespace.sweep.next();
      if (next.done) {
        delete namespace.sweep;
        break;
      }
      const [storedKey, record] = next.value;
      if (record.expiresAt === 0) continue;
      if (record.expiresAt <= now) namespace.records.delete(storedKey);
      else namespace.nextExpiry = Math.min(namespace.nextExpiry, record.expiresAt);
    }
    namespace.records.set(storageKey, { data: value, expiresAt });
    if (expiresAt !== 0) namespace.nextExpiry = Math.min(namespace.nextExpiry, expiresAt);
  }

  /** 读取原引用并惰性删除已经到期的记录。 */
  get<T = unknown>(key: Key): T | null {
    const storageKey = this.getStorageKey(key);
    const record = memoryStorage.get(this.prefix)?.records.get(storageKey);
    if (!record) return null;
    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      this.remove(key);
      return null;
    }
    return record.data as T;
  }

  /** 删除条目，并释放已经清空的命名空间。 */
  remove(key: Key): void {
    const storageKey = this.getStorageKey(key);
    const namespace = memoryStorage.get(this.prefix);
    namespace?.records.delete(storageKey);
    if (namespace?.records.size === 0) memoryStorage.delete(this.prefix);
  }

  /** 只清空当前 prefix 命名空间，不影响其他缓存实例。 */
  clear(): void {
    memoryStorage.delete(this.prefix);
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

  /** 转换结果在当前命名空间内定位记录，并在实例生命周期内复用。 */
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
