import type { Locale } from "date-fns";
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "./constant";
import type { DurationFields } from "./types";

export const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function formatOptions(locale?: Locale): { locale?: Locale } {
  return locale === undefined ? {} : { locale };
}

export function invalid(message = "无效的日期或时间输入"): never {
  throw new RangeError(message);
}

export function assertInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    invalid(`${name} 必须是有限整数`);
  }
  return value;
}

export function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    invalid(`${name} 必须是有限数字`);
  }
  return value;
}

export function assertTimezone(timezone: string): string {
  if (typeof timezone !== "string" || timezone.length === 0) {
    invalid("timezone 必须是非空字符串");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    invalid(`无效的 IANA 时区：${timezone}`);
  }
  return timezone;
}

export function getTimezone(timezone?: string): string {
  return assertTimezone(timezone ?? LOCAL_TIMEZONE);
}

export function createUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  assertInteger(year, "year");
  assertInteger(month, "month");
  assertInteger(day, "day");
  assertInteger(hour, "hour");
  assertInteger(minute, "minute");
  assertInteger(second, "second");
  assertInteger(millisecond, "millisecond");
  if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    invalid("日期或时间字段超出范围");
  }
  if (second < 0 || second > 59 || millisecond < 0 || millisecond > 999) {
    invalid("日期或时间字段超出范围");
  }

  // Date.UTC 对 0-99 年会自动加 1900，因此使用 setUTCFullYear 保留 ISO 年份语义。
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    !isValidDate(date) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalid("日期字段超出范围");
  }
  return date;
}

export function createLocalDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  // fromZonedTime 读取 Date 的本地 getter；先用同样的字段校验，再构造本地墙上时间。
  createUtcDate(year, month, day, hour, minute, second, millisecond);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, millisecond);
  return date;
}

export function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function dateToUtcFields(date: Date) {
  if (!isValidDate(date)) {
    invalid("Date 必须是有效日期");
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds(),
  };
}

export function parseFraction(fraction?: string): number {
  return fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0;
}

export interface ParsedDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  offsetMinutes?: number;
  timezone?: string;
}

const DATE_TIME_PATTERN =
  /^(\d{4})[-/](\d{2})[-/](\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?(?:\[([^\]]+)\])?$/u;

export function parseDateTimeString(value: string): ParsedDateTime {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) {
    invalid("日期时间字符串必须是完整 ISO 格式");
  }
  const [, year, month, day, hour, minute, second, fraction, offset, timezone] = match;
  const result: ParsedDateTime = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: parseFraction(fraction),
  };
  if (timezone !== undefined) {
    result.timezone = timezone;
  }
  if (offset && offset !== "Z") {
    const sign = offset.startsWith("-") ? -1 : 1;
    result.offsetMinutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  } else if (offset === "Z") {
    result.offsetMinutes = 0;
  }
  createUtcDate(
    result.year,
    result.month,
    result.day,
    result.hour,
    result.minute,
    result.second,
    result.millisecond,
  );
  if (result.offsetMinutes !== undefined && Math.abs(result.offsetMinutes) > 14 * 60) {
    invalid("UTC 偏移超出范围");
  }
  return result;
}

export function parseDateString(value: string) {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T(.*))?$/u.exec(value);
  if (!match) {
    invalid("日期字符串必须是 YYYY-MM-DD、YYYY/MM/DD 或完整 ISO 日期时间");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (match[4] !== undefined) {
    parseDateTimeString(`${match[1]}-${match[2]}-${match[3]}T${match[4]}`);
  }
  createUtcDate(year, month, day);
  return { year, month, day };
}

export function dateTimeToUtcDate(value: ParsedDateTime): Date {
  const local = createUtcDate(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
  return new Date(local.getTime() - (value.offsetMinutes ?? 0) * MS_PER_MINUTE);
}

export function addYearMonths(date: Date, years = 0, months = 0): Date {
  assertInteger(years, "years");
  assertInteger(months, "months");
  const fields = dateToUtcFields(date);
  const monthIndex = fields.year * 12 + (fields.month - 1) + years * 12 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return createUtcDate(
    targetYear,
    targetMonth,
    Math.min(fields.day, lastDay),
    fields.hour,
    fields.minute,
    fields.second,
    fields.millisecond,
  );
}

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
  return {
    ...(includeDays ? { days: days * sign } : {}),
    hours: hours * sign,
    minutes: minutes * sign,
    seconds: seconds * sign,
    milliseconds: ms * sign,
  };
}
