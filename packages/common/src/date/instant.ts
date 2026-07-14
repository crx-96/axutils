import {
  dateTimeToUtcDate,
  durationMilliseconds,
  getTimezone,
  invalid,
  millisecondsToDuration,
  parseDateTimeString,
} from "./internal";
import type { DurationFields, ZonedDateTimeValue } from "./types";

const INSTANT_PATTERN =
  /^\d{4}[-/]\d{2}[-/]\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

function toEpoch(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    invalid("epoch 毫秒必须是有限整数");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    invalid("epoch 毫秒超出 Date 可表示范围");
  }
  return value;
}

function normalize(value: string): number {
  if (!INSTANT_PATTERN.test(value)) {
    invalid("Instant 字符串必须包含 Z 或 UTC 偏移");
  }
  const epoch = dateTimeToUtcDate(parseDateTimeString(value)).getTime();
  if (!Number.isFinite(epoch)) {
    invalid("无效的 Instant 字符串");
  }
  return epoch;
}

/** 绝对时间点命名空间，内部统一使用 Unix epoch 毫秒表示。 */
export const Instant = {
  /** 从带 Z 或 UTC 偏移的 ISO 字符串创建绝对时间点。 */
  from(value: string): number {
    if (typeof value !== "string") {
      invalid("Instant.from 只接受字符串");
    }
    return normalize(value);
  },

  /** 从整数 Unix epoch 毫秒创建绝对时间点。 */
  fromEpochMilliseconds(milliseconds: number): number {
    return toEpoch(milliseconds);
  },

  /** 将绝对时间点关联到指定 IANA 时区。 */
  toZonedDateTime(epochMs: number, timezone: string): ZonedDateTimeValue {
    return { epochMs: toEpoch(epochMs), timezone: getTimezone(timezone) };
  },

  /** 读取绝对时间点的 epoch 毫秒。 */
  epochMilliseconds(instant: number): number {
    return toEpoch(instant);
  },

  /** 按实际毫秒数相加；years/months 无法从绝对时间点推导，传入非零值会抛错。 */
  add(instant: number, duration: DurationFields): number {
    return toEpoch(instant) + durationMilliseconds(duration);
  },

  /** 按实际毫秒数相减。 */
  subtract(instant: number, duration: DurationFields): number {
    return toEpoch(instant) - durationMilliseconds(duration);
  },

  /** 返回 instant - other 的分解结果。 */
  since(instant: number, other: number): DurationFields {
    return millisecondsToDuration(toEpoch(instant) - toEpoch(other));
  },

  /** 判断两个绝对时间点是否相等。 */
  equals(first: number, second: number): boolean {
    return toEpoch(first) === toEpoch(second);
  },

  /** 比较两个绝对时间点，返回 -1、0 或 1。 */
  compare(first: number, second: number): -1 | 0 | 1 {
    const difference = toEpoch(first) - toEpoch(second);
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  },
};
