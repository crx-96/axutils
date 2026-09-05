export const STORAGE_RECORD_MARKER = "@axutils/common/storage";

/** 记录携带命名空间，使经过 key 处理的条目仍能准确归属和清理。 */
export interface StorageRecord {
  marker: typeof STORAGE_RECORD_MARKER;
  prefix: string;
  expiresAt: number;
  data: unknown;
}

/** 过期时间允许非正值表示永久保存，但拒绝非有限数字。 */
export const normalizeExpired = (expired: number | undefined): number => {
  if (expired === undefined) return 0;
  if (!Number.isFinite(expired)) throw new TypeError("expired 必须是有限数字");
  return expired;
};

/** 将秒数换算为安全整数毫秒，避免超大过期值丢失精度。 */
export const toExpiresAt = (expired: number | undefined): number => {
  const normalized = normalizeExpired(expired);
  if (normalized <= 0) return 0;
  const expiresAt = Math.floor(Date.now() + normalized * 1000);
  if (!Number.isFinite(expiresAt) || !Number.isSafeInteger(expiresAt)) {
    throw new RangeError("expired 计算结果超出安全时间范围");
  }
  return expiresAt;
};

/** 只接受本工具的记录标记和元数据；损坏或其他业务的 JSON 视为未命中。 */
export const parseStorageRecord = (value: string): StorageRecord | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
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

/** 拒绝原生 JSON 会静默丢弃的值，避免 set 成功后读取结果失真。 */
export const serializeStorageRecord = (record: StorageRecord): string => {
  const serialized = JSON.stringify(record, (_key, value: unknown) => {
    const valueType = typeof value;
    if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
      throw new TypeError("缓存值不能包含 undefined、函数或 Symbol");
    }
    return value;
  });
  if (serialized === undefined) throw new TypeError("缓存值无法序列化为 JSON");
  return serialized;
};
