import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "./constant.js";
import {
  assertDurationObject,
  assertSafeInteger,
  createUtcDate,
  dateTimeToUtcDate,
  dateToUtcFields,
  durationValue,
  invalid,
  isDateObject,
  millisecondsToDuration,
  parseDateTimeString,
} from "./internal.js";
import type { DurationFields, PlainTimeInput } from "./types.js";

/** 将 Date 的 UTC 时间、文本或必需的时分字段转换为 epoch 当天的纯时间。 */
function fromInput(input: PlainTimeInput): Date {
  if (isDateObject(input)) {
    const fields = dateToUtcFields(input);
    return createUtcDate(1970, 1, 1, fields.hour, fields.minute, fields.second, fields.millisecond);
  }
  if (typeof input === "string") {
    // 兼容接口和表单中常见的日期时间文本；要求日期分隔符一致，并按偏移归一化为 UTC。
    if (/^(\d{4})([-/])(\d{2})\2(\d{2})[Tt ]/u.test(input)) {
      const utc = dateTimeToUtcDate(parseDateTimeString(input));
      return createUtcDate(
        1970,
        1,
        1,
        utc.getUTCHours(),
        utc.getUTCMinutes(),
        utc.getUTCSeconds(),
        utc.getUTCMilliseconds(),
      );
    }
    const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/u.exec(input);
    if (!match) {
      invalid("时间字符串必须是 HH:mm:ss[.SSS]");
    }
    const milliseconds = Number((match[4] ?? "").slice(0, 3).padEnd(3, "0") || 0);
    return createUtcDate(
      1970,
      1,
      1,
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      milliseconds,
    );
  }
  if (input === null || typeof input !== "object") {
    invalid("PlainTime 输入无效");
  }
  return createUtcDate(1970, 1, 1, input.hour, input.minute, input.second, input.millisecond);
}

/** 比较 UTC 对齐的两个纯时间，返回三态顺序。 */
function compareTimes(first: PlainTimeInput, second: PlainTimeInput): -1 | 0 | 1 {
  const difference = fromInput(first).getTime() - fromInput(second).getTime();
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** 校验时长容器与安全整数时间单位，用 BigInt 汇总并按一天毫秒取模，避免大数丢精度。 */
function addTime(time: Date, duration: DurationFields, direction = 1): Date {
  assertDurationObject(duration);
  // 按时分秒毫秒顺序读取一次并校验安全整数范围，保留首个错误语义。
  const hours = assertSafeInteger(durationValue(duration, "hours"), "hours");
  const minutes = assertSafeInteger(durationValue(duration, "minutes"), "minutes");
  const seconds = assertSafeInteger(durationValue(duration, "seconds"), "seconds");
  const milliseconds = assertSafeInteger(durationValue(duration, "milliseconds"), "milliseconds");
  const offset =
    BigInt(hours) * BigInt(MS_PER_HOUR) +
    BigInt(minutes) * BigInt(MS_PER_MINUTE) +
    BigInt(seconds) * BigInt(MS_PER_SECOND) +
    BigInt(milliseconds);
  const dayMs = BigInt(MS_PER_DAY);
  // 输入已对齐 epoch 当天，用 BigInt 对正负结果统一取模后再转回 Number。
  const elapsed = BigInt(time.getTime()) + BigInt(direction) * offset;
  return new Date(Number(((elapsed % dayMs) + dayMs) % dayMs));
}

/** 纯时间命名空间；时间加减不跨日，超出 24 小时按周期取模。 */
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
export const PlainTime = {
  /** 从 ISO 时间、datetime 或 Date/字段对象构造纯时间。 */
  from(input: PlainTimeInput): Date {
    return fromInput(input);
  },

  /** 便利工厂。 */
  of(hour: number, minute: number, second = 0, millisecond = 0): Date {
    return createUtcDate(1970, 1, 1, hour, minute, second, millisecond);
  },

  /** 加法结果保持在一天之内，时间字段之外的 Duration 字段会被忽略。 */
  add(time: PlainTimeInput, duration: DurationFields): Date {
    return addTime(fromInput(time), duration);
  },

  /** 时间减法。 */
  subtract(time: PlainTimeInput, duration: DurationFields): Date {
    return addTime(fromInput(time), duration, -1);
  },

  /** 返回 time - other 的时分秒毫秒差。 */
  since(time: PlainTimeInput, other: PlainTimeInput): DurationFields {
    return millisecondsToDuration(fromInput(time).getTime() - fromInput(other).getTime(), false);
  },

  /** 判断两个纯时间是否相等。 */
  equals(first: PlainTimeInput, second: PlainTimeInput): boolean {
    return compareTimes(first, second) === 0;
  },

  /** 比较两个纯时间。 */
  compare(first: PlainTimeInput, second: PlainTimeInput): -1 | 0 | 1 {
    return compareTimes(first, second);
  },

  /** 判断 first 是否早于 second。 */
  isBefore(first: PlainTimeInput, second: PlainTimeInput): boolean {
    return compareTimes(first, second) < 0;
  },

  /** 判断 first 是否晚于 second。 */
  isAfter(first: PlainTimeInput, second: PlainTimeInput): boolean {
    return compareTimes(first, second) > 0;
  },

  /** 获取小时。 */
  hourOf(time: PlainTimeInput): number {
    return fromInput(time).getUTCHours();
  },

  /** 获取分钟。 */
  minuteOf(time: PlainTimeInput): number {
    return fromInput(time).getUTCMinutes();
  },

  /** 获取秒。 */
  secondOf(time: PlainTimeInput): number {
    return fromInput(time).getUTCSeconds();
  },

  /** 获取毫秒。 */
  millisecondOf(time: PlainTimeInput): number {
    return fromInput(time).getUTCMilliseconds();
  },

  /** 输出 HH:mm:ss；毫秒非零时追加三位毫秒。 */
  toString(time: PlainTimeInput): string {
    const fields = dateToUtcFields(fromInput(time));
    const base = `${String(fields.hour).padStart(2, "0")}:${String(fields.minute).padStart(2, "0")}:${String(fields.second).padStart(2, "0")}`;
    return fields.millisecond === 0
      ? base
      : `${base}.${String(fields.millisecond).padStart(3, "0")}`;
  },
};
