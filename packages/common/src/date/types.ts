import type { Locale } from "date-fns";
import type { Timezone } from "./format.js";

/** 纯日期工具接受的输入：ISO 字符串、Date 或 Temporal 风格字段对象。 */
export type PlainDateInput =
  | string
  | Date
  | {
      /** ISO 年份，允许 Date 可表示范围内的 0 年及负年份。 */
      year: number;
      /** 月份，范围 1–12。 */
      month: number;
      /** 月内日期，必须在对应年月的实际日数内。 */
      day: number;
    };

/** 纯时间工具接受的输入：ISO 字符串、Date 或时分秒字段对象。 */
export type PlainTimeInput =
  | string
  | Date
  | {
      /** 小时，范围 0–23。 */
      hour: number;
      /** 分钟，范围 0–59。 */
      minute: number;
      /** 秒，范围 0–59；省略时为 0，不支持闰秒。 */
      second?: number | undefined;
      /** 毫秒，范围 0–999；省略时为 0。 */
      millisecond?: number | undefined;
    };

/** 无时区日期时间工具接受的输入。 */
export type PlainDateTimeInput =
  | string
  | Date
  | {
      /** ISO 年份，允许 Date 可表示范围内的 0 年及负年份。 */
      year: number;
      /** 月份，范围 1–12。 */
      month: number;
      /** 月内日期，必须在对应年月的实际日数内。 */
      day: number;
      /** 小时，范围 0–23。 */
      hour: number;
      /** 分钟，范围 0–59。 */
      minute: number;
      /** 秒，范围 0–59；省略时为 0，不支持闰秒。 */
      second?: number | undefined;
      /** 毫秒，范围 0–999；省略时为 0。 */
      millisecond?: number | undefined;
    };

/** 带时区日期时间接受 ISO 字符串或 Date；epoch 毫秒请使用 Instant。 */
export type ZonedDateTimeInput = string | Date;

/** Temporal 风格的时间长度字段；各字段均为有限整数，缺省表示 0，允许逐字段混合符号。 */
export interface DurationFields {
  /** 日历年数；Instant/ZonedDateTime 的实际时长运算不接受非零值。 */
  years?: number | undefined;
  /** 日历月数；Instant/ZonedDateTime 的实际时长运算不接受非零值。 */
  months?: number | undefined;
  /** 天数；换算为实际时长时每一天固定为 24 小时。 */
  days?: number | undefined;
  /** 小时数；PlainDate 的日期运算忽略此字段。 */
  hours?: number | undefined;
  /** 分钟数；PlainDate 的日期运算忽略此字段。 */
  minutes?: number | undefined;
  /** 秒数；PlainDate 的日期运算忽略此字段。 */
  seconds?: number | undefined;
  /** 毫秒数；PlainDate 的日期运算忽略此字段。 */
  milliseconds?: number | undefined;
}

/** date-fns 格式化配置；locale 必须传入已导入的 locale 对象。 */
export interface DateFormatOptions {
  /** date-fns locale 对象；省略时使用该依赖的默认 locale。 */
  locale?: Locale | undefined;
  /** 显示时区；PlainDate 固定 UTC 并忽略此值，PlainDateTime 默认 UTC，ZonedDateTime 默认自身时区。 */
  timezone?: Timezone | undefined;
}

/** 带时区时间点的轻量公开表示。 */
export interface ZonedDateTimeValue {
  /** 绝对时刻的整数 Unix 毫秒，须在 Date 可表示的正负 8.64e15 毫秒范围内。 */
  epochMs: number;
  /** 用于显示或墙上字段提取的 IANA 时区，不改变 epochMs 表示的时刻。 */
  timezone: Timezone;
}
