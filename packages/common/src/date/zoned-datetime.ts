import { MS_PER_MINUTE } from "./constant.js";
import type { DateFormatPattern, Timezone } from "./format.js";
import {
  MAX_ISO_OFFSET_MINUTES,
  assertDurationObject,
  assertTimezone,
  createUtcDate,
  dateTimeToUtcDate,
  dateToZonedDate,
  durationMilliseconds,
  durationValue,
  epochDifferenceToDuration,
  formatZonedDate,
  getTimezone,
  invalid,
  isDateObject,
  isoDateTimeString,
  parseDateTimeString,
  toEpochMilliseconds,
  zonedWallDate,
  zonedWallFields,
} from "./internal.js";
import type {
  DateFormatOptions,
  DurationFields,
  ZonedDateTimeInput,
  ZonedDateTimeValue,
} from "./types.js";

/** 构造带时区值时的默认关联或解释时区；文本内 IANA 后缀优先。 */
interface ZonedDateTimeOptions {
  /** 缺省时使用宿主时区；仅偏移文本且未指定时区时关联 UTC。 */
  timezone?: Timezone;
}

/** 按输入种类获取绝对时刻和关联时区，保留文本内 IANA 后缀的既有优先级。 */
function fromInput(
  input: ZonedDateTimeInput,
  options: ZonedDateTimeOptions = {},
): ZonedDateTimeValue {
  // 显式选项仍需有效，即使文本内另有优先级更高的关联时区。
  const optionZone = options.timezone;
  const defaultTimezone = getTimezone(optionZone);
  if (isDateObject(input)) {
    return {
      epochMs: toEpochMilliseconds(Date.prototype.getTime.call(input)),
      timezone: defaultTimezone,
    };
  }
  if (typeof input !== "string") {
    invalid("ZonedDateTime 输入无效");
  }
  const parsed = parseDateTimeString(input);
  const timezone = getTimezone(
    parsed.timezone ?? optionZone ?? (parsed.offsetMinutes !== undefined ? "UTC" : defaultTimezone),
  );
  // 明确偏移（包括 Z）唯一确定时刻。只有无偏移的墙上字段才需要时区消歧。
  const date = dateTimeToUtcDate(parsed);
  const epochMs = (
    parsed.offsetMinutes === undefined ? dateToZonedDate(date, timezone) : date
  ).getTime();
  return { epochMs: toEpochMilliseconds(epochMs), timezone };
}

/** 提取关联时区的墙上字段，并用 UTC 对齐 Date 承载，避免泄漏宿主本地时区。 */
function toLocalDate(zdt: ZonedDateTimeValue): Date {
  return zonedWallDate(new Date(toEpochMilliseconds(zdt.epochMs)), zdt.timezone);
}

/** 比较两个有效绝对时刻；拒绝 NaN，避免无效输入被误判为相等。 */
function compareEpoch(first: ZonedDateTimeValue, second: ZonedDateTimeValue): -1 | 0 | 1 {
  const difference = toEpochMilliseconds(first.epochMs) - toEpochMilliseconds(second.epochMs);
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** 校验时长容器与此命名空间不支持的年月字段，再将日及以下整数时长换算为毫秒。 */
function addMilliseconds(duration: DurationFields): number {
  assertDurationObject(duration);
  if (durationValue(duration, "years") !== 0 || durationValue(duration, "months") !== 0) {
    invalid(
      "ZonedDateTime 的加法不支持 years 或 months；如需日历计算请先通过 toPlainDateTime 转为无时区值",
    );
  }
  // biome-ignore assist/source/useSortedKeys: 按日期字段顺序读取并校验，保留首个错误的语义。
  return durationMilliseconds({
    days: duration.days,
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    milliseconds: duration.milliseconds,
  });
}

/** 带 IANA 时区的绝对时间点命名空间，内部只保存 epochMs 与 timezone。 */
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
export const ZonedDateTime = {
  /** 从含时区 ISO、Date 或 options.timezone 构造带时区时间点。 */
  from(input: ZonedDateTimeInput, options: ZonedDateTimeOptions = {}): ZonedDateTimeValue {
    return fromInput(input, options);
  },

  /** 取出 epoch 毫秒。 */
  toInstant(zdt: ZonedDateTimeValue): number {
    return toEpochMilliseconds(zdt.epochMs);
  },

  /** 按关联时区提取纯日期；直接从墙上字段构造，避免极限时刻的时间部分触发越界。 */
  toPlainDate(zdt: ZonedDateTimeValue): Date {
    const fields = zonedWallFields(new Date(toEpochMilliseconds(zdt.epochMs)), zdt.timezone);
    return createUtcDate(fields.year, fields.month, fields.day);
  },

  /** 按关联时区提取纯时间；直接从墙上字段构造，避免极限时刻的日期部分触发越界。 */
  toPlainTime(zdt: ZonedDateTimeValue): Date {
    const fields = zonedWallFields(new Date(toEpochMilliseconds(zdt.epochMs)), zdt.timezone);
    return createUtcDate(1970, 1, 1, fields.hour, fields.minute, fields.second, fields.millisecond);
  },

  /** 按关联时区提取无时区日期时间。 */
  toPlainDateTime(zdt: ZonedDateTimeValue): Date {
    return toLocalDate(zdt);
  },

  /** 切换时区但保持同一个绝对时间点。 */
  withTimeZone(zdt: ZonedDateTimeValue, timezone: Timezone): ZonedDateTimeValue {
    return { epochMs: toEpochMilliseconds(zdt.epochMs), timezone: assertTimezone(timezone) };
  },

  /** 按实际经过的毫秒数加法；跨 DST 时不会强行保持相同挂钟时间。 */
  add(zdt: ZonedDateTimeValue, duration: DurationFields): ZonedDateTimeValue {
    // 结果仍必须能表示为 Date，避免产生之后无法格式化的带时区值。
    return {
      epochMs: toEpochMilliseconds(toEpochMilliseconds(zdt.epochMs) + addMilliseconds(duration)),
      timezone: assertTimezone(zdt.timezone),
    };
  },

  /** 按实际经过的毫秒数减法。 */
  subtract(zdt: ZonedDateTimeValue, duration: DurationFields): ZonedDateTimeValue {
    return {
      epochMs: toEpochMilliseconds(toEpochMilliseconds(zdt.epochMs) - addMilliseconds(duration)),
      timezone: assertTimezone(zdt.timezone),
    };
  },

  /** 返回 zdt - other 的精确实际时长差，大跨度不丢失毫秒精度。 */
  since(zdt: ZonedDateTimeValue, other: ZonedDateTimeValue): DurationFields {
    return epochDifferenceToDuration(
      toEpochMilliseconds(zdt.epochMs),
      toEpochMilliseconds(other.epochMs),
    );
  },

  /** 判断两个带时区值是否表示同一绝对时刻。 */
  equals(first: ZonedDateTimeValue, second: ZonedDateTimeValue): boolean {
    return toEpochMilliseconds(first.epochMs) === toEpochMilliseconds(second.epochMs);
  },

  /** 比较两个带时区值的绝对时刻。 */
  compare(first: ZonedDateTimeValue, second: ZonedDateTimeValue): -1 | 0 | 1 {
    return compareEpoch(first, second);
  },

  /**
   * 按关联时区格式化；options.timezone 可以覆盖本次显示，不改变原始值。
   * @see DATE_FORMAT 预设格式常量（可输入 DATE_FORMAT. 查看）
   * @see https://date-fns.org/docs/format date-fns 格式 token 文档
   */
  format(
    zdt: ZonedDateTimeValue,
    pattern: DateFormatPattern,
    options: DateFormatOptions = {},
  ): string {
    return formatZonedDate(
      new Date(toEpochMilliseconds(zdt.epochMs)),
      options.timezone ?? zdt.timezone,
      pattern,
      options.locale,
    );
  },

  /** 输出精确到毫秒的 ISO 日期时间。墙上字段或偏移超出公开文本语法时改用 UTC。 */
  toString(zdt: ZonedDateTimeValue): string {
    const date = new Date(toEpochMilliseconds(zdt.epochMs));
    const timezone = assertTimezone(zdt.timezone);
    const year = date.getUTCFullYear();
    // 合法偏移最多跨一个日界。保留紧邻四位年的跨年机会，更远的年份直接输出 UTC，避免墙上 Date 越界。
    if (timezone === "UTC" || year < -1 || year > 10_000) return isoDateTimeString(date, "Z");

    const wall = zonedWallDate(date, timezone);
    const wallYear = wall.getUTCFullYear();
    const offset = (wall.getTime() - date.getTime()) / MS_PER_MINUTE;
    // 公开解析器只接受四位年和 ±14:00 以内的整分钟偏移。截断历史偏移会改变回读的时间点。
    if (
      wallYear < 0 ||
      wallYear > 9999 ||
      !Number.isInteger(offset) ||
      Math.abs(offset) > MAX_ISO_OFFSET_MINUTES ||
      offset === 0
    ) {
      return isoDateTimeString(date, "Z");
    }
    const minutes = Math.abs(offset);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return isoDateTimeString(wall, `${offset < 0 ? "-" : "+"}${hh}:${mm}`);
  },
};

export type { ZonedDateTimeOptions };
