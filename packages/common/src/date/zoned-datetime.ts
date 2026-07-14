import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  createLocalDate,
  createUtcDate,
  durationMilliseconds,
  formatOptions,
  getTimezone,
  invalid,
  millisecondsToDuration,
  parseDateTimeString,
} from "./internal";
import type {
  DateFormatOptions,
  DurationFields,
  ZonedDateTimeInput,
  ZonedDateTimeValue,
} from "./types";

interface ZonedDateTimeOptions {
  timezone?: string;
}

function fromInput(
  input: ZonedDateTimeInput,
  options: ZonedDateTimeOptions = {},
): ZonedDateTimeValue {
  const defaultTimezone = getTimezone(options.timezone);
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) {
      invalid("Date 必须是有效日期");
    }
    return { epochMs: input.getTime(), timezone: defaultTimezone };
  }
  if (typeof input !== "string") {
    invalid("ZonedDateTime 输入无效");
  }
  const parsed = parseDateTimeString(input);
  const timezone = getTimezone(
    parsed.timezone ?? options.timezone ?? (parsed.offsetMinutes !== undefined ? "UTC" : undefined),
  );
  const epochMs =
    parsed.timezone || parsed.offsetMinutes === undefined
      ? fromZonedTime(
          createLocalDate(
            parsed.year,
            parsed.month,
            parsed.day,
            parsed.hour,
            parsed.minute,
            parsed.second,
            parsed.millisecond,
          ),
          timezone,
        ).getTime()
      : createUtcDate(
          parsed.year,
          parsed.month,
          parsed.day,
          parsed.hour,
          parsed.minute,
          parsed.second,
          parsed.millisecond,
        ).getTime() -
        parsed.offsetMinutes * 60_000;
  return { epochMs, timezone };
}

function toLocalDate(zdt: ZonedDateTimeValue): Date {
  const text = formatInTimeZone(new Date(zdt.epochMs), zdt.timezone, "yyyy-MM-dd-HH-mm-ss-SSS");
  const [
    year = NaN,
    month = NaN,
    day = NaN,
    hour = NaN,
    minute = NaN,
    second = NaN,
    millisecond = NaN,
  ] = text.split("-").map(Number);
  return createUtcDate(year, month, day, hour, minute, second, millisecond);
}

function compareEpoch(first: ZonedDateTimeValue, second: ZonedDateTimeValue): -1 | 0 | 1 {
  const difference = first.epochMs - second.epochMs;
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

function addMilliseconds(duration: DurationFields): number {
  if ((duration.years ?? 0) !== 0 || (duration.months ?? 0) !== 0) {
    invalid(
      "ZonedDateTime 的加法不支持 years 或 months；如需日历计算请先通过 toPlainDateTime 转为无时区值",
    );
  }
  return durationMilliseconds({
    days: duration.days,
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    milliseconds: duration.milliseconds,
  });
}

/** 带 IANA 时区的绝对时间点命名空间，内部只保存 epochMs 与 timezone。 */
export const ZonedDateTime = {
  /** 从含时区 ISO、Date 或 options.timezone 构造带时区时间点。 */
  from(input: ZonedDateTimeInput, options: ZonedDateTimeOptions = {}): ZonedDateTimeValue {
    return fromInput(input, options);
  },

  /** 取出 epoch 毫秒。 */
  toInstant(zdt: ZonedDateTimeValue): number {
    return zdt.epochMs;
  },

  /** 按关联时区提取纯日期。 */
  toPlainDate(zdt: ZonedDateTimeValue): Date {
    const local = toLocalDate(zdt);
    return createUtcDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  },

  /** 按关联时区提取纯时间。 */
  toPlainTime(zdt: ZonedDateTimeValue): Date {
    const local = toLocalDate(zdt);
    return createUtcDate(
      1970,
      1,
      1,
      local.getUTCHours(),
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    );
  },

  /** 按关联时区提取无时区日期时间。 */
  toPlainDateTime(zdt: ZonedDateTimeValue): Date {
    return toLocalDate(zdt);
  },

  /** 切换时区但保持同一个绝对时间点。 */
  withTimeZone(zdt: ZonedDateTimeValue, timezone: string): ZonedDateTimeValue {
    return { epochMs: zdt.epochMs, timezone: getTimezone(timezone) };
  },

  /** 按实际经过的毫秒数加法；跨 DST 时不会强行保持相同挂钟时间。 */
  add(zdt: ZonedDateTimeValue, duration: DurationFields): ZonedDateTimeValue {
    return {
      epochMs: zdt.epochMs + addMilliseconds(duration),
      timezone: getTimezone(zdt.timezone),
    };
  },

  /** 按实际经过的毫秒数减法。 */
  subtract(zdt: ZonedDateTimeValue, duration: DurationFields): ZonedDateTimeValue {
    return {
      epochMs: zdt.epochMs - addMilliseconds(duration),
      timezone: getTimezone(zdt.timezone),
    };
  },

  /** 返回 zdt - other 的实际时长差。 */
  since(zdt: ZonedDateTimeValue, other: ZonedDateTimeValue): DurationFields {
    return millisecondsToDuration(zdt.epochMs - other.epochMs);
  },

  /** 判断两个带时区值是否表示同一绝对时刻。 */
  equals(first: ZonedDateTimeValue, second: ZonedDateTimeValue): boolean {
    return first.epochMs === second.epochMs;
  },

  /** 比较两个带时区值的绝对时刻。 */
  compare(first: ZonedDateTimeValue, second: ZonedDateTimeValue): -1 | 0 | 1 {
    return compareEpoch(first, second);
  },

  /** 按关联时区格式化。 */
  format(zdt: ZonedDateTimeValue, pattern: string, options: DateFormatOptions = {}): string {
    return formatInTimeZone(
      new Date(zdt.epochMs),
      getTimezone(zdt.timezone),
      pattern,
      formatOptions(options.locale),
    );
  },

  /** 输出 ISO 日期时间与 UTC 偏移，例如 +05:45；不附加 IANA 方括号。 */
  toString(zdt: ZonedDateTimeValue): string {
    const pattern =
      zdt.epochMs % 1_000 === 0 ? "yyyy-MM-dd'T'HH:mm:ssXXX" : "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
    return formatInTimeZone(new Date(zdt.epochMs), getTimezone(zdt.timezone), pattern);
  },
};

export type { ZonedDateTimeOptions };
