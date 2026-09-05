import { assertInteger, invalid } from "./validation.js";

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

export function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function dateToUtcFields(date: Date) {
  if (!isValidDate(date)) {
    invalid("Date 必须是有效日期");
  }
  // biome-ignore assist/source/useSortedKeys: Date 的 UTC getter 可被覆写，保留从年到毫秒的调用顺序。
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
