import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "../constant.js";
import type { DurationFields } from "../types.js";
import { assertFinite, assertInteger, invalid } from "./validation.js";

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

/** 只读取当前运算需要的单位一次。仅 undefined 表示零，显式 null 与其他非整数均报错。 */
export function durationValue(fields: DurationFields, unit: keyof DurationFields): number {
  const value = fields[unit];
  return value === undefined ? 0 : assertInteger(value, unit);
}

/** 仅快照已给值的支持字段，校验与使用同一次 getter 的结果。 */
export function readDuration(fields: DurationFields): DurationFields {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields))
    invalid("Duration 必须由字段对象构造");
  const snapshot: DurationFields = {};
  for (const unit of DURATION_UNITS) {
    const value = fields[unit];
    if (value !== undefined) snapshot[unit] = assertInteger(value, unit);
  }
  return snapshot;
}

/** 将日及以下单位按 Number 算术汇总，非零日历年月不能直接换算。 */
export function totalDurationMilliseconds(duration: DurationFields): number {
  const fields = readDuration(duration);
  if ((fields.years ?? 0) !== 0 || (fields.months ?? 0) !== 0) {
    invalid("无法将 years 或 months 精确换算为毫秒");
  }
  return (
    (fields.days ?? 0) * MS_PER_DAY +
    (fields.hours ?? 0) * MS_PER_HOUR +
    (fields.minutes ?? 0) * MS_PER_MINUTE +
    (fields.seconds ?? 0) * MS_PER_SECOND +
    (fields.milliseconds ?? 0)
  );
}

/** 时间点算术还要求汇总结果为有限整数，以免溢出值进入 Date 构造或一天内取模。 */
export function durationMilliseconds(duration: DurationFields): number {
  return assertInteger(totalDurationMilliseconds(duration), "duration 毫秒");
}

/** 将毫秒差按天到毫秒拆解；纯时间差省略 days，保留既有逐字段符号和截断语义。 */
export function millisecondsToDuration(milliseconds: number, includeDays = true): DurationFields {
  assertFinite(milliseconds, "milliseconds");
  // 按绝对值从大单位依次取整和扣除，最后再恢复原始差值的符号。
  const sign = milliseconds < 0 ? -1 : 1;
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
    ...(includeDays ? { days: days * sign } : {}),
    hours: hours * sign,
    minutes: minutes * sign,
    seconds: seconds * sign,
    milliseconds: ms * sign,
  };
}
