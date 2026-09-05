import { MS_PER_MINUTE } from "../constant.js";
import { createUtcDate } from "./calendar.js";
import { invalid } from "./validation.js";

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

// 仅接受完整日期时间与可选偏移/IANA 后缀；年月日等数值边界交给 UTC 日历校验。
const DATE_TIME_PATTERN =
  /^(\d{4})[-/](\d{2})[-/](\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?(?:\[([^\]]+)\])?$/u;

export function parseDateTimeString(value: string): ParsedDateTime {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) {
    invalid("日期时间字符串必须是完整 ISO 格式");
  }
  const [, year, month, day, hour, minute, second, fraction, offset, timezone] = match;
  const result: ParsedDateTime = {
    day: Number(day),
    hour: Number(hour),
    millisecond: parseFraction(fraction),
    minute: Number(minute),
    month: Number(month),
    second: Number(second),
    year: Number(year),
  };
  if (timezone !== undefined) {
    result.timezone = timezone;
  }
  if (offset && offset !== "Z") {
    const sign = offset.startsWith("-") ? -1 : 1;
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    // 分钟字段必须独立落在 0-59；不能让 +00:60 等非法偏移被总分钟数归一化。
    if (offsetMinutes > 59) {
      invalid("UTC 偏移超出范围");
    }
    result.offsetMinutes = sign * (offsetHours * 60 + offsetMinutes);
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
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[Tt ](.*))?$/u.exec(value);
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
  return { day, month, year };
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
