import { Md5 } from "../../crypto/md5.js";
import { jsonStringify } from "../../object/json.js";

/**
 * 判断值是否属于可以安全用于自动去重的 JSON 子集。
 *
 * Map、Set、FormData、流、类实例和循环引用都刻意排除；这些对象即使能被某些 JSON 实现转成字符串，
 * 也可能丢失实际请求语义。调用方可通过 dedupeKey 显式声明它们的去重身份。
 */
const isStableJsonValue = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => isStableJsonValue(item, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;

    return Object.keys(value).every((key) =>
      isStableJsonValue((value as Record<string, unknown>)[key], ancestors),
    );
  } finally {
    ancestors.delete(value);
  }
};

/**
 * 仅共享身份序列化；调用方决定参与去重的字段，以及不稳定字段使用显式 key 时的身份。
 * 使用现有 MD5 和 JSON 适配器，需要安装 spark-md5 与 safe-stable-stringify。
 */
export function serializeRequestIdentity(
  identity: object,
  explicitKey: string | undefined,
  explicitIdentity: () => object,
): string | undefined {
  try {
    let serializableIdentity = identity;
    if (!isStableJsonValue(identity)) {
      if (explicitKey === undefined) return undefined;
      serializableIdentity = explicitIdentity();
    }
    const serialized = jsonStringify(serializableIdentity, { onCycle: "throw", sortKeys: true });
    if (serialized === undefined) return undefined;
    const prefix = explicitKey === undefined ? "auto" : "explicit";
    return `${prefix}:${new Md5().update(serialized).toHex()}`;
  } catch {
    // 无法证明身份稳定时独立执行，避免合并语义未知的请求。
    return undefined;
  }
}
