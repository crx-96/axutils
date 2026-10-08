import { assertInteger, invalid } from "./validation.js";

/** UTC 对齐日期的完整字段；用于在纯值转换和日历运算间传递已校验的值。 */
interface UtcDateFields {
  /** ISO 年份，保留公元 0 年及负年份。 */
  year: number;
  /** 月份，范围 1–12。 */
  month: number;
  /** 月内日期，范围由对应年月决定。 */
  day: number;
  /** 小时，范围 0–23。 */
  hour: number;
  /** 分钟，范围 0–59。 */
  minute: number;
  /** 秒，范围 0–59，不支持闰秒。 */
  second: number;
  /** 毫秒，范围 0–999。 */
  millisecond: number;
}

/** 构造 UTC 对齐 Date；拒绝字段溢出而不是采用 Date 的自动进位，缺省时间为午夜。 */
export function createUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  // 先检查整数及时间范围，再借助 Date 验证不同月份的实际日数和可表示年份。
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

/** 判断本 Realm 的 Date 是否含有可表示的时间值。 */
export function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** 校验 Date 并按年到毫秒的稳定顺序读取 UTC 字段；不读取宿主本地时间。 */
export function dateToUtcFields(date: Date): UtcDateFields {
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

/** 按前推公历计算月长，不构造下一月的 Date，避免 0–99 年重映射及时间值极限。 */
export function daysInGregorianMonth(year: number, month: number): number {
  assertInteger(year, "year");
  assertInteger(month, "month");
  if (month < 1 || month > 12) {
    invalid("month 必须是 1 到 12 的整数");
  }
  // 闰年规则直接用于 ISO 年份，因此 0 年按 400 年周期保留 2 月 29 日。
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** 合并年月偏移后计算目标月份；月末夹紧到目标月最后一天，保留所有时间字段。 */
export function addYearMonths(date: Date, years = 0, months = 0): Date {
  assertInteger(years, "years");
  assertInteger(months, "months");
  const fields = dateToUtcFields(date);
  // 以连续月份索引处理跨年和负偏移，再还原为一基月份。
  const monthIndex = fields.year * 12 + (fields.month - 1) + years * 12 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  const lastDay = daysInGregorianMonth(targetYear, targetMonth);
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
