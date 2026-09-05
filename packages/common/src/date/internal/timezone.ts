import type { Locale } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Timezone } from "../format.js";
import { invalid } from "./validation.js";

export const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function formatOptions(locale?: Locale): { locale?: Locale } {
  return locale === undefined ? {} : { locale };
}

export function assertTimezone(timezone: string): string {
  if (typeof timezone !== "string" || timezone.length === 0) {
    invalid("timezone 必须是非空字符串");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    invalid(`无效的 IANA 时区：${timezone}`);
  }
  return timezone;
}

export function getTimezone(timezone?: string): Timezone {
  return assertTimezone(timezone ?? LOCAL_TIMEZONE) as Timezone;
}

/**
 * 将 UTC 对齐的日期字段解释为目标时区的墙上时间。
 *
 * 无时区 ISO 字符串避免先构造宿主本地 Date，从而防止宿主 DST 缺失时刻提前被归一化。
 * toISOString 保留 0-99 年和扩展年份；移除偏移后交给 peer，不把字段误解释为 UTC 时间点。
 * peer 用浮点数解析小数秒，在 epoch 附近可能丢失 1ms，因此只传整秒并以整数加回毫秒。
 * 目标时区的重复/缺失时间与历史年份仍交给 date-fns-tz，不改写其既有消歧策略和限制。
 */
export function dateToZonedDate(date: Date, timezone: string): Date {
  const seconds = date.toISOString().slice(0, -5);
  const zoned = fromZonedTime(seconds, timezone);
  return new Date(zoned.getTime() + date.getUTCMilliseconds());
}
