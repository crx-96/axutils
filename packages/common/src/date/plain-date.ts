import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  addYearMonths,
  createLocalDate,
  createUtcDate,
  dateToUtcFields,
  formatOptions,
  invalid,
  parseDateString,
} from "./internal";
import type {
  DateFormatOptions,
  DurationFields,
  PlainDateInput,
  ZonedDateTimeValue,
} from "./types";

function fromInput(input: PlainDateInput): Date {
  if (input instanceof Date) {
    const fields = dateToUtcFields(input);
    return createUtcDate(fields.year, fields.month, fields.day);
  }
  if (typeof input === "string") {
    const fields = parseDateString(input);
    return createUtcDate(fields.year, fields.month, fields.day);
  }
  if (input === null || typeof input !== "object") {
    invalid("PlainDate 输入无效");
  }
  return createUtcDate(input.year, input.month, input.day);
}

function durationValue(duration: DurationFields, name: keyof DurationFields): number {
  const value = duration[name] ?? 0;
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    invalid(`${name} 必须是有限整数`);
  }
  return value;
}

function addDate(date: Date, duration: DurationFields): Date {
  const years = durationValue(duration, "years");
  const months = durationValue(duration, "months");
  const days = durationValue(duration, "days");
  let result = addYearMonths(date, years, months);
  result = new Date(result.getTime() + days * 86_400_000);
  return createUtcDate(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

function compareDates(first: Date, second: Date): -1 | 0 | 1 {
  const difference = fromInput(first).getTime() - fromInput(second).getTime();
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** 纯日期命名空间；所有字段都按 UTC 提取和存储，不受运行时本地时区影响。 */
export const PlainDate = {
  /** 从 ISO 日期、Date 或字段对象创建纯日期；无效输入统一抛 RangeError。 */
  from(input: PlainDateInput): Date {
    return fromInput(input);
  },

  /** 便利工厂，等价于 PlainDate.from({ year, month, day })。 */
  of(year: number, month: number, day: number): Date {
    return createUtcDate(year, month, day);
  },

  /** 将日期作为目标时区的午夜转换为带时区时间点。 */
  toZonedDateTime(date: PlainDateInput, timezone: string): ZonedDateTimeValue {
    const value = fromInput(date);
    return {
      epochMs: fromZonedTime(
        createLocalDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()),
        timezone,
      ).getTime(),
      timezone,
    };
  },

  /** 转换为当天 UTC 午夜的无时区日期时间表示。 */
  toPlainDateTime(date: PlainDateInput): Date {
    return fromInput(date);
  },

  /** 日期加法按日历处理，月末溢出会 clamp 到目标月最后一天。 */
  add(date: PlainDateInput, duration: DurationFields): Date {
    return addDate(fromInput(date), duration);
  },

  /** 日期减法。 */
  subtract(date: PlainDateInput, duration: DurationFields): Date {
    return addDate(fromInput(date), {
      years: -(duration.years ?? 0),
      months: -(duration.months ?? 0),
      days: -(duration.days ?? 0),
    });
  },

  /** 返回 date - other 的日历日差，结果只含 days 字段。 */
  since(date: PlainDateInput, other: PlainDateInput): DurationFields {
    return {
      days: Math.round((fromInput(date).getTime() - fromInput(other).getTime()) / 86_400_000),
    };
  },

  /** 判断两个日期是否相等。 */
  equals(first: PlainDateInput, second: PlainDateInput): boolean {
    return compareDates(fromInput(first), fromInput(second)) === 0;
  },

  /** 比较两个日期，返回 -1、0 或 1。 */
  compare(first: PlainDateInput, second: PlainDateInput): -1 | 0 | 1 {
    return compareDates(fromInput(first), fromInput(second));
  },

  /** 判断 first 是否早于 second。 */
  isBefore(first: PlainDateInput, second: PlainDateInput): boolean {
    return compareDates(fromInput(first), fromInput(second)) < 0;
  },

  /** 判断 first 是否晚于 second。 */
  isAfter(first: PlainDateInput, second: PlainDateInput): boolean {
    return compareDates(fromInput(first), fromInput(second)) > 0;
  },

  /** 判断日期是否位于闭区间 [start, end]；不自动交换边界。 */
  isBetween(date: PlainDateInput, start: PlainDateInput, end: PlainDateInput): boolean {
    return !PlainDate.isBefore(date, start) && !PlainDate.isAfter(date, end);
  },

  /** 获取 UTC 年份。 */
  yearOf(date: PlainDateInput): number {
    return fromInput(date).getUTCFullYear();
  },

  /** 获取 UTC 月份（1-12）。 */
  monthOf(date: PlainDateInput): number {
    return fromInput(date).getUTCMonth() + 1;
  },

  /** 获取 UTC 日。 */
  dayOf(date: PlainDateInput): number {
    return fromInput(date).getUTCDate();
  },

  /** 获取星期几，1 表示周一，7 表示周日。 */
  dayOfWeek(date: PlainDateInput): number {
    const day = fromInput(date).getUTCDay();
    return day === 0 ? 7 : day;
  },

  /** 获取月份天数。 */
  daysInMonth(date: PlainDateInput): number {
    const value = fromInput(date);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  },

  /** 获取所在周的第一天，默认以周一为每周起点。 */
  startOfWeek(date: PlainDateInput, options: { weekStartsOn?: number } = {}): Date {
    const value = fromInput(date);
    const weekStartsOn = options.weekStartsOn ?? 1;
    if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
      invalid("weekStartsOn 必须是 0 到 6 的整数");
    }
    const current = value.getUTCDay();
    const offset = (current - weekStartsOn + 7) % 7;
    const epoch = value.getTime() - offset * 86_400_000;
    return new Date(epoch);
  },

  /** 获取所在周的最后一天。 */
  endOfWeek(date: PlainDateInput, options: { weekStartsOn?: number } = {}): Date {
    return new Date(PlainDate.startOfWeek(date, options).getTime() + 6 * 86_400_000);
  },

  /** 输出 YYYY-MM-DD。 */
  toString(date: PlainDateInput): string {
    const fields = dateToUtcFields(fromInput(date));
    return `${String(fields.year).padStart(4, "0")}-${String(fields.month).padStart(2, "0")}-${String(fields.day).padStart(2, "0")}`;
  },

  /** 使用 UTC 时区格式化，保证不同运行时本地时区得到相同结果。 */
  format(date: PlainDateInput, pattern: string, options: DateFormatOptions = {}): string {
    return formatInTimeZone(fromInput(date), "UTC", pattern, formatOptions(options.locale));
  },
};
