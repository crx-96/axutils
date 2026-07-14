import {
  createUtcDate,
  dateToUtcFields,
  durationMilliseconds,
  invalid,
  millisecondsToDuration,
  parseDateTimeString,
} from "./internal";
import type { DurationFields, PlainTimeInput } from "./types";

function fromInput(input: PlainTimeInput): Date {
  if (input instanceof Date) {
    const fields = dateToUtcFields(input);
    return createUtcDate(1970, 1, 1, fields.hour, fields.minute, fields.second, fields.millisecond);
  }
  if (typeof input === "string") {
    // 兼容接口和表单中常见的 `YYYY-MM-DD HH:mm:ss` 写法；纯时间仍走更严格的 HH:mm:ss 校验。
    const dateTime = /^\d{4}[-/]\d{2}[-/]\d{2}[Tt ]/u.test(input)
      ? parseDateTimeString(input)
      : null;
    if (dateTime) {
      return createUtcDate(
        1970,
        1,
        1,
        dateTime.hour,
        dateTime.minute,
        dateTime.second,
        dateTime.millisecond,
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
  return createUtcDate(
    1970,
    1,
    1,
    input.hour,
    input.minute,
    input.second ?? 0,
    input.millisecond ?? 0,
  );
}

function compareTimes(first: PlainTimeInput, second: PlainTimeInput): -1 | 0 | 1 {
  const difference = fromInput(first).getTime() - fromInput(second).getTime();
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

function addTime(time: Date, duration: DurationFields): Date {
  const milliseconds = durationMilliseconds({
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    milliseconds: duration.milliseconds,
  });
  const normalized =
    (((time.getTime() - Date.UTC(1970, 0, 1) + milliseconds) % 86_400_000) + 86_400_000) %
    86_400_000;
  return new Date(Date.UTC(1970, 0, 1) + normalized);
}

/** 纯时间命名空间；时间加减不跨日，超出 24 小时按周期取模。 */
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
    return addTime(fromInput(time), {
      hours: -(duration.hours ?? 0),
      minutes: -(duration.minutes ?? 0),
      seconds: -(duration.seconds ?? 0),
      milliseconds: -(duration.milliseconds ?? 0),
    });
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
