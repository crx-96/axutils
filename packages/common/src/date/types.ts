import type { Locale } from "date-fns";
import type { Timezone } from "./format";

/** 纯日期工具接受的输入：ISO 字符串、Date 或 Temporal 风格字段对象。 */
export type PlainDateInput =
  | string
  | Date
  | {
      year: number;
      month: number;
      day: number;
    };

/** 纯时间工具接受的输入：ISO 字符串、Date 或时分秒字段对象。 */
export type PlainTimeInput =
  | string
  | Date
  | {
      hour: number;
      minute: number;
      second?: number | undefined;
      millisecond?: number | undefined;
    };

/** 无时区日期时间工具接受的输入。 */
export type PlainDateTimeInput =
  | string
  | Date
  | {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second?: number | undefined;
      millisecond?: number | undefined;
    };

/** 带时区日期时间接受 ISO 字符串或 Date；epoch 毫秒请使用 Instant。 */
export type ZonedDateTimeInput = string | Date;

/** Temporal 风格的时间长度字段。缺省字段表示 0。 */
export interface DurationFields {
  years?: number | undefined;
  months?: number | undefined;
  days?: number | undefined;
  hours?: number | undefined;
  minutes?: number | undefined;
  seconds?: number | undefined;
  milliseconds?: number | undefined;
}

/** date-fns 格式化配置；locale 必须传入已导入的 locale 对象。 */
export interface DateFormatOptions {
  locale?: Locale | undefined;
  timezone?: Timezone | undefined;
}

/** 带时区时间点的轻量公开表示。 */
export interface ZonedDateTimeValue {
  epochMs: number;
  timezone: Timezone;
}
