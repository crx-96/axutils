import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DateFormatPattern, Timezone } from "./format";
import {
  addYearMonths,
  createLocalDate,
  createUtcDate,
  dateTimeToUtcDate,
  dateToUtcFields,
  durationMilliseconds,
  formatOptions,
  invalid,
  millisecondsToDuration,
  parseDateTimeString,
} from "./internal";
import type {
  DateFormatOptions,
  DurationFields,
  PlainDateTimeInput,
  ZonedDateTimeValue,
} from "./types";

function fromInput(input: PlainDateTimeInput): Date {
  if (input instanceof Date) {
    const fields = dateToUtcFields(input);
    return createUtcDate(
      fields.year,
      fields.month,
      fields.day,
      fields.hour,
      fields.minute,
      fields.second,
      fields.millisecond,
    );
  }
  if (typeof input === "string") {
    return dateTimeToUtcDate(parseDateTimeString(input));
  }
  if (input === null || typeof input !== "object") {
    invalid("PlainDateTime 输入无效");
  }
  return createUtcDate(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
    input.millisecond ?? 0,
  );
}

function addDateTime(date: Date, duration: DurationFields): Date {
  let result = addYearMonths(date, duration.years ?? 0, duration.months ?? 0);
  result = new Date(
    result.getTime() +
      durationMilliseconds({
        days: duration.days,
        hours: duration.hours,
        minutes: duration.minutes,
        seconds: duration.seconds,
        milliseconds: duration.milliseconds,
      }),
  );
  return createUtcDate(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
    result.getUTCHours(),
    result.getUTCMinutes(),
    result.getUTCSeconds(),
    result.getUTCMilliseconds(),
  );
}

function compareDateTimes(first: PlainDateTimeInput, second: PlainDateTimeInput): -1 | 0 | 1 {
  const difference = fromInput(first).getTime() - fromInput(second).getTime();
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** 无时区日期时间命名空间；Date 内部值始终以 UTC getter 表示原始字段。 */
export const PlainDateTime = {
  /** 从完整 ISO 日期时间、Date 或字段对象构造。 */
  from(input: PlainDateTimeInput): Date {
    return fromInput(input);
  },

  /** 将无时区字段解释为目标时区的本地时间。 */
  toZonedDateTime(dateTime: PlainDateTimeInput, timezone: Timezone): ZonedDateTimeValue {
    const value = fromInput(dateTime);
    return {
      epochMs: fromZonedTime(
        createLocalDate(
          value.getUTCFullYear(),
          value.getUTCMonth() + 1,
          value.getUTCDate(),
          value.getUTCHours(),
          value.getUTCMinutes(),
          value.getUTCSeconds(),
          value.getUTCMilliseconds(),
        ),
        timezone,
      ).getTime(),
      timezone,
    };
  },

  /** 日期时间加法；年月按日历处理，小时以下字段按 UTC 毫秒处理。 */
  add(dateTime: PlainDateTimeInput, duration: DurationFields): Date {
    return addDateTime(fromInput(dateTime), duration);
  },

  /** 日期时间减法。 */
  subtract(dateTime: PlainDateTimeInput, duration: DurationFields): Date {
    return addDateTime(fromInput(dateTime), {
      years: -(duration.years ?? 0),
      months: -(duration.months ?? 0),
      days: -(duration.days ?? 0),
      hours: -(duration.hours ?? 0),
      minutes: -(duration.minutes ?? 0),
      seconds: -(duration.seconds ?? 0),
      milliseconds: -(duration.milliseconds ?? 0),
    });
  },

  /** 返回 dateTime - other 的天、时、分、秒、毫秒差，不拆分年月。 */
  since(dateTime: PlainDateTimeInput, other: PlainDateTimeInput): DurationFields {
    return millisecondsToDuration(fromInput(dateTime).getTime() - fromInput(other).getTime());
  },

  /** 判断两个日期时间是否相等。 */
  equals(first: PlainDateTimeInput, second: PlainDateTimeInput): boolean {
    return compareDateTimes(first, second) === 0;
  },

  /** 比较两个日期时间。 */
  compare(first: PlainDateTimeInput, second: PlainDateTimeInput): -1 | 0 | 1 {
    return compareDateTimes(first, second);
  },

  /** 提取 UTC 对齐的纯日期。 */
  toPlainDate(dateTime: PlainDateTimeInput): Date {
    const fields = dateToUtcFields(fromInput(dateTime));
    return createUtcDate(fields.year, fields.month, fields.day);
  },

  /** 提取 UTC 对齐的纯时间。 */
  toPlainTime(dateTime: PlainDateTimeInput): Date {
    const fields = dateToUtcFields(fromInput(dateTime));
    return createUtcDate(1970, 1, 1, fields.hour, fields.minute, fields.second, fields.millisecond);
  },

  /** 判断 first 是否早于 second。 */
  isBefore(first: PlainDateTimeInput, second: PlainDateTimeInput): boolean {
    return compareDateTimes(first, second) < 0;
  },

  /** 判断 first 是否晚于 second。 */
  isAfter(first: PlainDateTimeInput, second: PlainDateTimeInput): boolean {
    return compareDateTimes(first, second) > 0;
  },

  /**
   * 按可选目标时区格式化；省略 timezone 时按内部 UTC 字段格式化。
   * @see DATE_FORMAT 预设格式常量（可输入 DATE_FORMAT. 查看）
   * @see https://date-fns.org/docs/format date-fns 格式 token 文档
   */
  format(
    dateTime: PlainDateTimeInput,
    pattern: DateFormatPattern,
    options: DateFormatOptions = {},
  ): string {
    return formatInTimeZone(
      fromInput(dateTime),
      options.timezone ?? "UTC",
      pattern,
      formatOptions(options.locale),
    );
  },

  /** 输出 ISO 日期时间，毫秒非零时追加三位毫秒。 */
  toString(dateTime: PlainDateTimeInput): string {
    const fields = dateToUtcFields(fromInput(dateTime));
    const base = `${String(fields.year).padStart(4, "0")}-${String(fields.month).padStart(2, "0")}-${String(fields.day).padStart(2, "0")}T${String(fields.hour).padStart(2, "0")}:${String(fields.minute).padStart(2, "0")}:${String(fields.second).padStart(2, "0")}`;
    return fields.millisecond === 0
      ? base
      : `${base}.${String(fields.millisecond).padStart(3, "0")}`;
  },
};
