import type { Timezone } from "./format.js";
import {
  dateTimeToUtcDate,
  durationMilliseconds,
  getTimezone,
  invalid,
  millisecondsToDuration,
  parseDateTimeString,
  toEpochMilliseconds,
} from "./internal.js";
import type { DurationFields, ZonedDateTimeValue } from "./types.js";

/** Instant 文本必须带明确偏移，避免绝对时间点依赖宿主默认时区。 */
const INSTANT_PATTERN =
  /^\d{4}[-/]\d{2}[-/]\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

/** 严格解析有偏移文本并返回整数 epoch 毫秒，保留 ISO 字段与偏移的边界校验。 */
function normalize(value: string): number {
  // 先要求偏移，再由共用解析器验证实际日期和偏移范围。
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
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
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
    return toEpochMilliseconds(milliseconds);
  },

  /** 将绝对时间点关联到指定 IANA 时区。 */
  toZonedDateTime(epochMs: number, timezone: Timezone): ZonedDateTimeValue {
    return { epochMs: toEpochMilliseconds(epochMs), timezone: getTimezone(timezone) };
  },

  /** 读取绝对时间点的 epoch 毫秒。 */
  epochMilliseconds(instant: number): number {
    return toEpochMilliseconds(instant);
  },

  /** 按整数毫秒相加；非零 years/months 或结果超出 Date 范围时抛 RangeError。 */
  add(instant: number, duration: DurationFields): number {
    // 输入有效并不保证结果有效；输出遵守与 fromEpochMilliseconds 相同的范围。
    return toEpochMilliseconds(toEpochMilliseconds(instant) + durationMilliseconds(duration));
  },

  /** 按实际毫秒数相减。 */
  subtract(instant: number, duration: DurationFields): number {
    return toEpochMilliseconds(toEpochMilliseconds(instant) - durationMilliseconds(duration));
  },

  /** 返回 instant - other 的分解结果。 */
  since(instant: number, other: number): DurationFields {
    return millisecondsToDuration(toEpochMilliseconds(instant) - toEpochMilliseconds(other));
  },

  /** 判断两个绝对时间点是否相等。 */
  equals(first: number, second: number): boolean {
    return toEpochMilliseconds(first) === toEpochMilliseconds(second);
  },

  /** 比较两个绝对时间点，返回 -1、0 或 1。 */
  compare(first: number, second: number): -1 | 0 | 1 {
    const difference = toEpochMilliseconds(first) - toEpochMilliseconds(second);
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  },
};
