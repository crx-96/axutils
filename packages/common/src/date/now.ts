import type { Timezone } from "./format.js";
import { createUtcDate, getTimezone, zonedWallDate } from "./internal.js";
import type { ZonedDateTimeValue } from "./types.js";

/** 获取当前时刻在目标时区的完整日历字段，用 UTC 对齐 Date 承载。 */
function currentWallDate(timezone?: Timezone): Date {
  return zonedWallDate(new Date(), getTimezone(timezone));
}

/** 当前时间命名空间；纯值方法返回 UTC 对齐的 Date，避免调用方机器时区影响字段读取。 */
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
export const Now = {
  /** 获取目标时区的当前日期，并以 UTC 对齐 Date 返回。 */
  plainDateISO(timezone?: Timezone): Date {
    const date = currentWallDate(timezone);
    return createUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  },

  /** 获取目标时区的当前时间（含毫秒），并以 1970-01-01 UTC 对齐 Date 返回。 */
  plainTimeISO(timezone?: Timezone): Date {
    const date = currentWallDate(timezone);
    return createUtcDate(
      1970,
      1,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    );
  },

  /** 获取目标时区的当前日期时间，并以 UTC 对齐 Date 返回。 */
  plainDateTimeISO(timezone?: Timezone): Date {
    return currentWallDate(timezone);
  },

  /** 获取当前绝对时间点及其关联时区。 */
  zonedDateTimeISO(timezone?: Timezone): ZonedDateTimeValue {
    return { epochMs: Date.now(), timezone: getTimezone(timezone) };
  },

  /** 获取当前 epoch 毫秒。 */
  instant(): number {
    return Date.now();
  },
};
