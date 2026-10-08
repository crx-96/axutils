import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "../constant.js";
import type { DurationFields } from "../types.js";
import { assertFinite, assertInteger, invalid } from "./validation.js";

/** 将有限整数时长字段换算为毫秒；未显式允许时拒绝非零年月，防止假定固定月长。 */
export function durationMilliseconds(duration: DurationFields, allowCalendar = false): number {
  // 按公开字段读取一次，包含继承或非枚举字段；后续只使用快照，避免 getter 在校验后变值。
  // biome-ignore assist/source/useSortedKeys: 按年月到毫秒的单位顺序读取并校验，保留首个无效字段的报告顺序。
  const fields = {
    years: duration.years,
    months: duration.months,
    days: duration.days,
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    milliseconds: duration.milliseconds,
  };
  // 在乘以各单位之前检查同一份值，避免小数在 Date 构造中被静默截断。
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) {
      assertInteger(value, name);
    }
  }
  if (!allowCalendar && ((fields.years ?? 0) !== 0 || (fields.months ?? 0) !== 0)) {
    invalid("纯时间点运算不支持 years 或 months");
  }
  const milliseconds =
    (fields.days ?? 0) * MS_PER_DAY +
    (fields.hours ?? 0) * MS_PER_HOUR +
    (fields.minutes ?? 0) * MS_PER_MINUTE +
    (fields.seconds ?? 0) * MS_PER_SECOND +
    (fields.milliseconds ?? 0);
  // 各字段有限并不保证乘加后仍有限，拒绝溢出后再交由调用方检查时间点范围。
  return assertInteger(milliseconds, "duration 毫秒");
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
