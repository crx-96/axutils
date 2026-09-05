import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "../constant.js";
import type { DurationFields } from "../types.js";
import { assertFinite, invalid } from "./validation.js";

export function durationMilliseconds(duration: DurationFields, allowCalendar = false): number {
  for (const [name, value] of Object.entries(duration)) {
    if (value !== undefined) {
      assertFinite(value, name);
    }
  }
  if (!allowCalendar && ((duration.years ?? 0) !== 0 || (duration.months ?? 0) !== 0)) {
    invalid("纯时间点运算不支持 years 或 months");
  }
  return (
    (duration.days ?? 0) * MS_PER_DAY +
    (duration.hours ?? 0) * MS_PER_HOUR +
    (duration.minutes ?? 0) * MS_PER_MINUTE +
    (duration.seconds ?? 0) * MS_PER_SECOND +
    (duration.milliseconds ?? 0)
  );
}

export function millisecondsToDuration(milliseconds: number, includeDays = true): DurationFields {
  assertFinite(milliseconds, "milliseconds");
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
