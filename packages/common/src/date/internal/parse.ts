import { MS_PER_MINUTE } from "../constant.js";
import { createUtcDate } from "./calendar.js";
import { assertTimezone } from "./timezone.js";
import { invalid } from "./validation.js";

/** 解析秒后最多 9 位小数并截断补齐为 3 位毫秒整数。 */
export function parseFraction(fraction?: string): number {
  return fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0;
}

/** 完整日期时间文本解析后的结构化字段，保留原始偏移与 IANA 时区后缀。 */
export interface ParsedDateTime {
  /** 四位 ISO 年份。 */
  year: number;
  /** 月份（1–12）。 */
  month: number;
  /** 月内日期。 */
  day: number;
  /** 小时（0–23）。 */
  hour: number;
  /** 分钟（0–59）。 */
  minute: number;
  /** 秒（0–59）。 */
  second: number;
  /** 毫秒（0–999）。 */
  millisecond: number;
  /** 文本中的 UTC 偏移总分钟数；缺省表示未带偏移。 */
  offsetMinutes?: number;
  /** 文本方括号中的 IANA 时区名称；缺省表示未带时区后缀。 */
  timezone?: string;
}

/** 公开文本语法允许的最大绝对 UTC 偏移，单位为分钟。 */
export const MAX_ISO_OFFSET_MINUTES = 14 * 60;

// 仅接受完整日期时间与可选偏移/IANA 后缀；日期分隔符必须成对一致，数值边界交给 UTC 日历校验。
const DATE_TIME_PATTERN =
  /^(\d{4})([-/])(\d{2})\2(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?(?:\[([^\]]+)\])?$/u;

/** 解析完整日期时间文本，并统一校验日历字段、偏移范围与可选 IANA 时区后缀。 */
export function parseDateTimeString(value: string): ParsedDateTime {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) {
    invalid("日期时间字符串必须是完整 ISO 格式");
  }
  const [, year, , month, day, hour, minute, second, fraction, offset, timezone] = match;
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
  if (
    result.offsetMinutes !== undefined &&
    Math.abs(result.offsetMinutes) > MAX_ISO_OFFSET_MINUTES
  ) {
    invalid("UTC 偏移超出范围");
  }
  // 任何入口解析带 [IANA] 后缀的文本时均校验时区合法性，避免静默忽略无效时区。
  if (result.timezone !== undefined) {
    assertTimezone(result.timezone);
  }
  return result;
}

/** 解析纯日期或完整日期时间文本；带时间部分时按文本偏移归一化为 UTC 后提取年月日。 */
export function parseDateString(value: string): { day: number; month: number; year: number } {
  const match = /^(\d{4})([-/])(\d{2})\2(\d{2})(?:[Tt ](.*))?$/u.exec(value);
  if (!match) {
    invalid("日期字符串必须是 YYYY-MM-DD、YYYY/MM/DD 或完整 ISO 日期时间");
  }
  if (match[5] !== undefined) {
    // 复用完整日期时间解析与 UTC 归一化，与 PlainDateTime.from / PlainTime.from 保持一致。
    const utc = dateTimeToUtcDate(
      parseDateTimeString(`${match[1]}-${match[3]}-${match[4]}T${match[5]}`),
    );
    return {
      day: utc.getUTCDate(),
      month: utc.getUTCMonth() + 1,
      year: utc.getUTCFullYear(),
    };
  }
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  createUtcDate(year, month, day);
  return { day, month, year };
}

/** 将已解析的日期时间字段按文本偏移（缺省视为 0）归一化为 UTC Date。 */
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
