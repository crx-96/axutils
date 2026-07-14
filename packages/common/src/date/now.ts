import { formatInTimeZone } from "date-fns-tz";
import type { Timezone } from "./format";
import { createUtcDate, getTimezone } from "./internal";
import type { ZonedDateTimeValue } from "./types";

function currentParts(timezone?: Timezone) {
  const zone = getTimezone(timezone);
  const text = formatInTimeZone(new Date(), zone, "yyyy-MM-dd-HH-mm-ss-SSS");
  const [
    year = NaN,
    month = NaN,
    day = NaN,
    hour = NaN,
    minute = NaN,
    second = NaN,
    millisecond = NaN,
  ] = text.split("-").map(Number);
  return { zone, date: createUtcDate(year, month, day, hour, minute, second, millisecond) };
}

/** 当前时间命名空间；纯值方法返回 UTC 对齐的 Date，避免调用方机器时区影响字段读取。 */
export const Now = {
  /** 获取目标时区的当前日期，并以 UTC 对齐 Date 返回。 */
  plainDateISO(timezone?: Timezone): Date {
    const { date } = currentParts(timezone);
    return createUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  },

  /** 获取目标时区的当前时间（含毫秒），并以 1970-01-01 UTC 对齐 Date 返回。 */
  plainTimeISO(timezone?: Timezone): Date {
    const { date } = currentParts(timezone);
    return createUtcDate(
      1970,
      1,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    );
  },

  /** 获取目标时区的当前日期时间，并以 UTC 对齐 Date 返回。 */
  plainDateTimeISO(timezone?: Timezone): Date {
    return currentParts(timezone).date;
  },

  /** 获取当前绝对时间点及其关联时区。 */
  zonedDateTimeISO(timezone?: Timezone): ZonedDateTimeValue {
    return { epochMs: Date.now(), timezone: getTimezone(timezone) };
  },

  /** 获取当前 epoch 毫秒。 */
  instant(): number {
    return Date.now();
  },
};
