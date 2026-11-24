import type { StorageType } from "../storage.js";
import { STORAGE_RECORD_MARKER } from "./record.js";

/** 字符串存储后端；键快照将枚举成本限制为一次完整遍历。 */
export interface StorageBackend {
  getItem(key: string): string | null;
  keys(): string[];
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface WebStorageLike {
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

/** 内存降级仍保存 JSON 字符串，避免因运行环境改变值的复制语义。 */
class MapStorage implements StorageBackend {
  private declare readonly values: Map<string, string>;

  constructor() {
    this.values = new Map();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  keys(): string[] {
    return [...this.values.keys()];
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Web Storage 先取得完整键快照，再删除条目，避免索引移动导致漏删。 */
class WebStorage implements StorageBackend {
  private declare readonly storage: WebStorageLike;

  constructor(storage: WebStorageLike) {
    this.storage = storage;
  }

  getItem(key: string): string | null {
    return this.storage.getItem(key);
  }

  keys(): string[] {
    const keys: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key !== null) keys.push(key);
    }
    return keys;
  }

  removeItem(key: string): void {
    this.storage.removeItem(key);
  }

  setItem(key: string, value: string): void {
    this.storage.setItem(key, value);
  }
}

// 每种 Web Storage 类型使用独立降级空间，避免 session 与 local 相互污染。
const fallbackStorages: Record<StorageType, StorageBackend> = {
  local: new MapStorage(),
  session: new MapStorage(),
};
let storageProbeSequence = 0;

/** 这里只判断 Storage 接口形状；实际读写能力由后续探测验证。 */
const isStorageLike = (value: unknown): value is WebStorageLike => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WebStorageLike>;
  return (
    typeof candidate.length === "number" &&
    typeof candidate.getItem === "function" &&
    typeof candidate.key === "function" &&
    typeof candidate.removeItem === "function" &&
    typeof candidate.setItem === "function"
  );
};

/** 识别主流及旧版浏览器 Web Storage 配额耗尽异常，避免误降级到内存空间。 */
const isQuotaExceededError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.name === "QUOTA_EXCEEDED_ERR" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
};

/** 临时读写覆盖隐私模式、禁用存储和配额异常；探测失败后尽力清理临时键。 */
const canUseStorage = (storage: WebStorageLike): boolean => {
  storageProbeSequence += 1;
  let probeKey = `${STORAGE_RECORD_MARKER}/probe/${Date.now()}/${storageProbeSequence}`;
  let shouldCleanup = false;
  try {
    // 既有业务键不能用于探测，否则清理探测值时会删除原值。
    while (storage.getItem(probeKey) !== null) probeKey += "_";
    storage.setItem(probeKey, probeKey);
    shouldCleanup = true;
    if (storage.getItem(probeKey) !== probeKey) return false;
    storage.removeItem(probeKey);
    if (storage.getItem(probeKey) !== null) return false;
    shouldCleanup = false;
    return true;
  } catch (error) {
    // 配额耗尽时保留可读后端，让后续写入直接报告真实配额错误。
    if (isQuotaExceededError(error)) {
      const existing = storage.key(0);
      return existing !== null && storage.getItem(existing) !== null;
    }
    return false;
  } finally {
    if (shouldCleanup) {
      try {
        storage.removeItem(probeKey);
      } catch {
        // 探测失败后只能尽力清理；实例固定降级到内存，不再使用该对象。
      }
    }
  }
};

/** 实例创建时探测 Web Storage；属性访问或读写受限时固定使用对应内存空间。 */
export const resolveStorage = (type: StorageType): StorageBackend => {
  if (type !== "local" && type !== "session") {
    throw new TypeError('type 必须是 "local" 或 "session"');
  }
  const property = type === "session" ? "sessionStorage" : "localStorage";
  try {
    const globals = globalThis as unknown as GlobalStorageObjects;
    const storage = globals[property];
    if (isStorageLike(storage) && canUseStorage(storage)) return new WebStorage(storage);
  } catch {
    // 保留无 Web Storage 或受限环境中的通用 API。
  }
  return fallbackStorages[type];
};
