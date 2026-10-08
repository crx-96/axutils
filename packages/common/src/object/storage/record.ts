/** 通用 JSON 缓存的记录标记，用于排除同一存储空间中的其他业务数据。 */
export const STORAGE_RECORD_MARKER = "@axutils/common/storage";

/** 记录携带命名空间，使经过 key 处理的条目仍能准确归属和清理。 */
export interface StorageRecord {
  /** 固定格式标记；不同缓存实现不能混读记录。 */
  marker: typeof STORAGE_RECORD_MARKER;
  /** 原始命名空间，即使底层 key 经处理仍用于归属判断。 */
  prefix: string;
  /** 到期时刻的安全整数毫秒时间戳；0 表示永久有效。 */
  expiresAt: number;
  /** 经过 JSON 序列化的业务值；字段必须存在，允许其值为 null。 */
  data: unknown;
}

/** 过期时间允许非正值表示永久保存，但拒绝非有限数字。 */
export const normalizeExpired = (expired: number | undefined): number => {
  // 未设置过期值时采用永久缓存；显式输入必须能参与可靠的时间计算。
  if (expired === undefined) return 0;
  if (!Number.isFinite(expired)) throw new TypeError("expired 必须是有限数字");
  return expired;
};

/** 将秒数换算为安全整数毫秒，避免超大过期值丢失精度。 */
export const toExpiresAt = (expired: number | undefined): number => {
  const normalized = normalizeExpired(expired);
  // 非正数保留永久缓存语义，不读取当前时间。
  if (normalized <= 0) return 0;
  // 将秒数变为绝对毫秒时间戳，再校验序列化后仍可精确比较。
  const expiresAt = Math.floor(Date.now() + normalized * 1000);
  if (!Number.isFinite(expiresAt) || !Number.isSafeInteger(expiresAt)) {
    throw new RangeError("expired 计算结果超出安全时间范围");
  }
  return expiresAt;
};

/** 只接受本工具的记录标记和元数据；损坏或其他业务的 JSON 视为未命中。 */
export const parseStorageRecord = (value: string): StorageRecord | null => {
  try {
    // JSON 文本本身合法不代表它是完整缓存记录；不信任外部写入或损坏的元数据。
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<StorageRecord>;
    // 本工具写入的四个字段都必须是自有属性，避免缺失 data 时返回 undefined，
    // 也避免外部原型属性伪装成一条完整记录。
    if (
      !["marker", "prefix", "expiresAt", "data"].every(
        (key) => Object.getOwnPropertyDescriptor(record, key) !== undefined,
      )
    ) {
      return null;
    }
    // JSON.parse 能将 1e999 解析为 Infinity；安全整数检查同时拒绝此类非有限值和小数。
    if (
      record.marker !== STORAGE_RECORD_MARKER ||
      typeof record.prefix !== "string" ||
      !Number.isSafeInteger(record.expiresAt)
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
  // 在 JSON 的唯一一次遍历中检查实际写出的值；不预读 getter 或重复执行 toJSON。
  const serialized = JSON.stringify(record, (_key, value: unknown) => {
    const valueType = typeof value;
    if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
      throw new TypeError("缓存值不能包含 undefined、函数或 Symbol");
    }
    return value;
  });
  // 保留明确失败通道，调用方的 setSafe 可将序列化异常转换为 false。
  if (serialized === undefined) throw new TypeError("缓存值无法序列化为 JSON");
  return serialized;
};
