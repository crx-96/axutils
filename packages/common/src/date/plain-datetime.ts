import type { DateFormatPattern, Timezone } from "./format.js";
import {
  addYearMonths,
  createUtcDate,
  dateTimeToUtcDate,
  dateToUtcFields,
  dateToZonedDate,
  durationMilliseconds,
  durationValue,
  formatZonedDate,
  invalid,
  isDateObject,
  isoDateTimeString,
  millisecondsToDuration,
  parseDateTimeString,
  toEpochMilliseconds,
} from "./internal.js";
import type {
  DateFormatOptions,
  DurationFields,
  PlainDateTimeInput,
  ZonedDateTimeValue,
} from "./types.js";

/** 将 Date、完整日期时间文本或字段对象规范为 UTC 对齐 Date，并保留毫秒字段。 */
function fromInput(input: PlainDateTimeInput): Date {
  // Date 按 UTC 字段复制；文本偏移仍按原契约归一化为 UTC，不经过宿主本地解析。
  if (isDateObject(input)) {
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
  // 字段对象缺省秒和毫秒为 0，其余日历及时间边界由构造器统一校验。
  return createUtcDate(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    input.second,
    input.millisecond,
  );
}

/** 先执行年月日历夹紧，再增加日及以下的整数毫秒，最后校验结果可表示。 */
function addDateTime(date: Date, duration: DurationFields, direction = 1): Date {
  // 先校验输入值再施加方向，避免一元负号把字符串转换为有效整数。
  const years = durationValue(duration, "years");
  const months = durationValue(duration, "months");
  const calendar = addYearMonths(date, direction * years, direction * months);
  // biome-ignore assist/source/useSortedKeys: 按日到毫秒的顺序读取 getter。
  const elapsed = durationMilliseconds({
    days: duration.days,
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    milliseconds: duration.milliseconds,
  });
  return new Date(toEpochMilliseconds(calendar.getTime() + direction * elapsed));
}

/** 规范化两端后比较 UTC 对齐毫秒值。 */
function compareDateTimes(first: PlainDateTimeInput, second: PlainDateTimeInput): -1 | 0 | 1 {
  const difference = fromInput(first).getTime() - fromInput(second).getTime();
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** 无时区日期时间命名空间；Date 内部值始终以 UTC getter 表示原始字段。 */
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
export const PlainDateTime = {
  /** 从完整 ISO 日期时间、Date 或字段对象构造。 */
  from(input: PlainDateTimeInput): Date {
    return fromInput(input);
  },

  /** 将无时区字段解释为目标时区的本地时间。 */
  toZonedDateTime(dateTime: PlainDateTimeInput, timezone: Timezone): ZonedDateTimeValue {
    const value = fromInput(dateTime);
    return {
      epochMs: dateToZonedDate(value, timezone).getTime(),
      timezone,
    };
  },

  /** 日期时间加法；年月按日历处理，小时以下字段按 UTC 毫秒处理。 */
  add(dateTime: PlainDateTimeInput, duration: DurationFields): Date {
    return addDateTime(fromInput(dateTime), duration);
  },

  /** 日期时间减法。 */
  subtract(dateTime: PlainDateTimeInput, duration: DurationFields): Date {
    return addDateTime(fromInput(dateTime), duration, -1);
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
    return formatZonedDate(fromInput(dateTime), options.timezone ?? "UTC", pattern, options.locale);
  },

  /** 输出 ISO 日期时间，保留带符号扩展年份；毫秒非零时追加三位毫秒，不输出时区后缀。 */
  toString(dateTime: PlainDateTimeInput): string {
    return isoDateTimeString(fromInput(dateTime));
  },
};
