import { type Locale, format, getDefaultOptions } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { fromZonedTime } from "date-fns-tz";
import { MS_PER_MINUTE } from "../constant.js";
import { DATE_FORMAT, type Timezone } from "../format.js";
import { type UtcDateFields, createUtcDate, dateToUtcFields } from "./calendar.js";
import { invalid, toEpochMilliseconds } from "./validation.js";

/** 模块加载时捕获的宿主默认 IANA 时区。 */
export const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** 共用固定时区的字段和名称格式器，限制不同拼写、locale 组合的常驻数量。 */
const formatters = new Map<string, Intl.DateTimeFormat>();

/** 只缓存成功构造的实例，字段格式器的构造也完成时区校验。 */
function zonedFormatter(
  zone: string,
  name?: "short" | "long",
  locale?: string,
): Intl.DateTimeFormat {
  if (typeof zone !== "string" || !zone) invalid("timezone 必须是非空字符串");
  const key = JSON.stringify([zone, name, locale]);
  const cached = formatters.get(key);
  if (cached) return cached;
  // 数字字段固定使用公历、拉丁数字和 00–23 小时，名称沿用 peer 的语言回退顺序。
  const formatter = name
    ? new Intl.DateTimeFormat(locale ? [locale, "en-US"] : undefined, {
        timeZone: zone,
        timeZoneName: name,
      })
    : new Intl.DateTimeFormat("en-US", {
        calendar: "gregory",
        day: "numeric",
        era: "short",
        hour: "numeric",
        hourCycle: "h23",
        minute: "numeric",
        month: "numeric",
        numberingSystem: "latn",
        second: "numeric",
        timeZone: zone,
        year: "numeric",
      });
  if (formatters.size >= 64) formatters.delete(formatters.keys().next().value ?? "");
  formatters.set(key, formatter);
  return formatter;
}

/** 校验并返回调用方提供的时区拼写。 */
export function assertTimezone(timezone: string): string {
  zonedFormatter(timezone);
  return timezone;
}

/** 解析可选时区，缺省时使用模块加载时的宿主默认值。 */
export function getTimezone(timezone?: string): Timezone {
  return assertTimezone(timezone ?? LOCAL_TIMEZONE);
}

/** 提取绝对时间点在目标时区的墙上日历与时间字段，不构造合并 Date 以兼容极限边界。 */
export function zonedWallFields(date: Date, timezone: string): UtcDateFields {
  if (timezone === "UTC") return dateToUtcFields(date);
  // 直接从目标时区读取，避免经宿主本地 Date 构造而跨越 DST 空档或跳日。
  const parts = Object.fromEntries(
    zonedFormatter(timezone)
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  const year = Number(parts.year);
  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    millisecond: date.getUTCMilliseconds(),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: parts.era === "BC" ? 1 - year : year,
  };
}

/** 把绝对时间点投影为 UTC 对齐的墙上字段，毫秒直接取自原时刻。 */
export function zonedWallDate(date: Date, timezone: string): Date {
  if (timezone === "UTC") return new Date(date.getTime());
  const fields = zonedWallFields(date, timezone);
  return createUtcDate(
    fields.year,
    fields.month,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
    fields.millisecond,
  );
}

/** date-fns 会用输入 Date 的构造器复制日期并计算周、年内日序。复制品也必须使用 UTC 日历。 */
class FormatCalendarDate extends Date {}
// 只在内部子类上映射日历读写，让 date-fns 的月份、星期、日序和 locale 逻辑共用原实现。
Object.assign(FormatCalendarDate.prototype, {
  getDate: Date.prototype.getUTCDate,
  getDay: Date.prototype.getUTCDay,
  getFullYear: Date.prototype.getUTCFullYear,
  getHours: Date.prototype.getUTCHours,
  getMilliseconds: Date.prototype.getUTCMilliseconds,
  getMinutes: Date.prototype.getUTCMinutes,
  getMonth: Date.prototype.getUTCMonth,
  getSeconds: Date.prototype.getUTCSeconds,
  setDate: Date.prototype.setUTCDate,
  setFullYear: Date.prototype.setUTCFullYear,
  setHours: Date.prototype.setUTCHours,
  setMonth: Date.prototype.setUTCMonth,
});

/** 用 date-fns 处理完整 token、引号和 locale，仅替换需要原始时刻或目标时区的字段。 */
export function formatZonedDate(
  date: Date,
  timezone: string,
  pattern: string,
  locale?: Locale,
): string {
  // ISO_UTC 是带字面量 Z 的预设，始终序列化原始时刻，同时保留显示时区的输入校验。
  assertTimezone(timezone);
  if (pattern === DATE_FORMAT.ISO_UTC) return date.toISOString();
  // 单个 Unix 时间戳 token（含补位）只依赖原时刻，边界处的墙上日期可能超出 Date 范围。
  const wall = /^(?:T+|t+)$/u.test(pattern) ? date : zonedWallDate(date, timezone);
  const configuredLocale = locale ?? getDefaultOptions().locale;
  const language = configuredLocale ?? enUS;
  return format(new FormatCalendarDate(wall.getTime()), pattern, {
    locale: {
      ...language,
      localize: {
        ...language.localize,
        preprocessor(calendar, parts) {
          // X/x/O 读取当前瞬间的分钟偏移，两次回拨时间可区分，历史秒级偏移截至分钟。
          calendar.getTimezoneOffset = () =>
            Math.trunc((date.getTime() - wall.getTime()) / MS_PER_MINUTE);
          // date-fns 已展开 P/p 并区分引号字面量，保留语言自有预处理（例如法语序数）。
          const localized = language.localize.preprocessor?.(calendar, parts) ?? parts;
          return localized.map((part) => {
            if (!part.isToken) return part;
            if (/^[tT]/u.test(part.value))
              return { isToken: false, value: format(date, part.value, { locale: enUS }) };
            if (!part.value.startsWith("z")) return part;
            const length = part.value.length < 4 ? "short" : "long";
            const name = zonedFormatter(timezone, length, configuredLocale?.code)
              .formatToParts(date)
              .find((field) => field.type === "timeZoneName");
            return { isToken: false, value: name?.value ?? "" };
          });
        },
      },
      // 只让显式 locale 覆盖 date-fns 的全局 weekStartsOn 和 firstWeekContainsDate。
      options: locale?.options ?? {},
    },
  });
}

/** 将 UTC 对齐的墙上字段交给 peer 消歧，保留其目标时区重复/缺失时间与历史年份行为。 */
export function dateToZonedDate(date: Date, timezone: string): Date {
  // 传无时区整秒文本避免宿主 Date 归一化，以整数加回毫秒避免 peer 的小数截断。
  const seconds = date.toISOString().slice(0, -5);
  const zoned = fromZonedTime(seconds, assertTimezone(timezone));
  return new Date(toEpochMilliseconds(zoned.getTime() + date.getUTCMilliseconds()));
}
