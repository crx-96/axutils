import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "../constant.js";
import type { DurationFields } from "../types.js";
import { assertFinite, assertInteger, invalid } from "./validation.js";

/** BigInt 版毫秒换算常量，供大跨度差值与大安全整数求和复用。 */
const BIG_MS_PER_SECOND = BigInt(MS_PER_SECOND);
const BIG_MS_PER_MINUTE = BigInt(MS_PER_MINUTE);
const BIG_MS_PER_HOUR = BigInt(MS_PER_HOUR);
const BIG_MS_PER_DAY = BigInt(MS_PER_DAY);

/** 按日历单位从大到小读取，包含继承及非枚举的公开字段。 */
export const DURATION_UNITS = [
  "years",
  "months",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
] as const;

/** 校验时长容器为非数组对象，供 Duration 与各命名空间加减入口共用。 */
export function assertDurationObject(fields: DurationFields): void {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) {
    invalid("Duration 必须由字段对象构造");
  }
}

/** 只读取当前运算需要的单位一次。仅 undefined 表示零，显式 null 与其他非整数均报错。 */
export function durationValue(fields: DurationFields, unit: keyof DurationFields): number {
  const value = fields[unit];
  return value === undefined ? 0 : assertInteger(value, unit);
}

/** 仅快照已给值的支持字段，校验与使用同一次 getter 的结果。 */
export function readDuration(fields: DurationFields): DurationFields {
  assertDurationObject(fields);
  const snapshot: DurationFields = {};
  for (const unit of DURATION_UNITS) {
    const value = fields[unit];
    if (value !== undefined) snapshot[unit] = assertInteger(value, unit);
  }
  return snapshot;
}

/** 将日及以下单位汇总为有限毫秒；全安全整数时用 BigInt 精确求和，非零日历年月直接报错。 */
export function totalDurationMilliseconds(duration: DurationFields): number {
  const fields = readDuration(duration);
  if ((fields.years ?? 0) !== 0 || (fields.months ?? 0) !== 0) {
    invalid("无法将 years 或 months 精确换算为毫秒");
  }
  const days = fields.days ?? 0;
  const hours = fields.hours ?? 0;
  const minutes = fields.minutes ?? 0;
  const seconds = fields.seconds ?? 0;
  const milliseconds = fields.milliseconds ?? 0;
  if (
    Number.isSafeInteger(days) &&
    Number.isSafeInteger(hours) &&
    Number.isSafeInteger(minutes) &&
    Number.isSafeInteger(seconds) &&
    Number.isSafeInteger(milliseconds)
  ) {
    // 全部为安全整数时走 BigInt 精确求和，避免中间项超 2^53 产生舍入误差。
    const total =
      BigInt(days) * BIG_MS_PER_DAY +
      BigInt(hours) * BIG_MS_PER_HOUR +
      BigInt(minutes) * BIG_MS_PER_MINUTE +
      BigInt(seconds) * BIG_MS_PER_SECOND +
      BigInt(milliseconds);
    const numeric = Number(total);
    return assertFinite(numeric === 0 ? 0 : numeric, "duration 毫秒");
  }
  // 存在非安全大整数时经有限性校验，拒绝溢出导致的 Infinity 或 NaN。
  const numeric =
    days * MS_PER_DAY +
    hours * MS_PER_HOUR +
    minutes * MS_PER_MINUTE +
    seconds * MS_PER_SECOND +
    milliseconds;
  return assertFinite(numeric === 0 ? 0 : numeric, "duration 毫秒");
}

/** 时间点算术还要求汇总结果为有限整数，以免溢出值进入 Date 构造或一天内取模。 */
export function durationMilliseconds(duration: DurationFields): number {
  return assertInteger(totalDurationMilliseconds(duration), "duration 毫秒");
}

/** 将非负分量施加符号并归一化零值，避免负数拆解时对零字段产生 -0。 */
function applySign(value: number, sign: 1 | -1): number {
  return value === 0 ? 0 : value * sign;
}

/** 将毫秒差按天到毫秒拆解；纯时间差省略 days，保留既有逐字段符号和截断语义。 */
export function millisecondsToDuration(milliseconds: number, includeDays = true): DurationFields {
  assertFinite(milliseconds, "milliseconds");
  // 按绝对值从大单位依次取整和扣除，最后再恢复原始差值的符号并消除 -0。
  const sign: 1 | -1 = milliseconds < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(milliseconds));
  const days = includeDays ? Math.floor(remaining / MS_PER_DAY) : 0;
  remaining -= days * MS_PER_DAY;
  const hours = Math.floor(remaining / MS_PER_HOUR);
  remaining -= hours * MS_PER_HOUR;
  const minutes = Math.floor(remaining / MS_PER_MINUTE);
  remaining -= minutes * MS_PER_MINUTE;
  const seconds = Math.floor(remaining / MS_PER_SECOND);
  const ms = remaining - seconds * MS_PER_SECOND;
  // biome-ignore assist/source/useSortedKeys: 保留公开时长结果从大到小的字段枚举顺序。
  return {
    ...(includeDays ? { days: applySign(days, sign) } : {}),
    hours: applySign(hours, sign),
    minutes: applySign(minutes, sign),
    seconds: applySign(seconds, sign),
    milliseconds: applySign(ms, sign),
  };
}

/** 用 BigInt 精确计算两个整数 epoch 毫秒的差值并按天至毫秒拆解，避免跨度超 2^53 丢精度或产生 -0。 */
export function epochDifferenceToDuration(
  first: number,
  second: number,
  includeDays = true,
): DurationFields {
  let remaining = BigInt(first) - BigInt(second);
  const days = includeDays ? remaining / BIG_MS_PER_DAY : 0n;
  remaining -= days * BIG_MS_PER_DAY;
  const hours = remaining / BIG_MS_PER_HOUR;
  remaining -= hours * BIG_MS_PER_HOUR;
  const minutes = remaining / BIG_MS_PER_MINUTE;
  remaining -= minutes * BIG_MS_PER_MINUTE;
  const seconds = remaining / BIG_MS_PER_SECOND;
  const ms = remaining - seconds * BIG_MS_PER_SECOND;
  // BigInt 向零截断且无 -0n，转回 Number 后各零值字段均为 +0。
  // biome-ignore assist/source/useSortedKeys: 保留公开时长结果从大到小的字段枚举顺序。
  return {
    ...(includeDays ? { days: Number(days) } : {}),
    hours: Number(hours),
    minutes: Number(minutes),
    seconds: Number(seconds),
    milliseconds: Number(ms),
  };
}
