import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATE_FORMAT,
  Duration,
  Instant,
  Now,
  PlainDate,
  PlainDateTime,
  PlainTime,
  TIMEZONE,
  ZonedDateTime,
} from "../../src/date";

/** 运行时的本地 IANA 时区 */
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("date/usage-scenarios", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-31T20:34:56.789Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("跨 Realm Date 按 UTC 字段或内部时间点读取，无效 Date 抛 RangeError", () => {
    const input = runInNewContext('new Date("2024-01-31T23:59:58.007Z")');
    expect(PlainDate.toString(input)).toBe("2024-01-31");
    expect(PlainTime.toString(input)).toBe("23:59:58.007");
    expect(PlainDateTime.toString(input)).toBe("2024-01-31T23:59:58.007");
    expect(ZonedDateTime.from(input, { timezone: "UTC" })).toEqual({
      epochMs: Date.parse("2024-01-31T23:59:58.007Z"),
      timezone: "UTC",
    });
    const invalid = runInNewContext("new Date(NaN)");
    for (const api of [PlainDate, PlainTime, PlainDateTime, ZonedDateTime])
      expect(() => api.from(invalid)).toThrow(RangeError);
  });

  it("字段对象只对可选时间单位补零", () => {
    const date = { day: 31, month: 1, year: 2024 };
    for (const missing of [{}, { hour: 0 }, { minute: 0 }, { hour: undefined, minute: 0 }]) {
      expect(() => PlainTime.from(missing as never)).toThrow(RangeError);
      expect(() => PlainDateTime.from({ ...date, ...missing } as never)).toThrow(RangeError);
    }
    expect(PlainTime.toString({ hour: 0, minute: 0 })).toBe("00:00:00");
    expect(PlainDateTime.toString({ ...date, hour: 0, minute: 0 })).toBe("2024-01-31T00:00:00");
  });

  it("减法先校验参与运算的字段，保留纯日期和时间忽略其他单位的行为", () => {
    const value = "2024-01-31T08:00:00";
    for (const field of [
      "years",
      "months",
      "days",
      "hours",
      "minutes",
      "seconds",
      "milliseconds",
    ]) {
      const bad = { [field]: "1" };
      expect(() => PlainDateTime.subtract(value, bad)).toThrow(RangeError);
      if (["years", "months", "days"].includes(field)) {
        expect(() => PlainDate.subtract(value, bad)).toThrow(RangeError);
        expect(PlainTime.toString(PlainTime.subtract(value, bad))).toBe("08:00:00");
      } else {
        expect(() => PlainTime.subtract(value, bad)).toThrow(RangeError);
        expect(PlainDate.toString(PlainDate.subtract(value, bad))).toBe("2024-01-31");
      }
    }
  });

  it.each(["years", "months", "days"])("加减法拒绝参与运算的 %s 为 null", (unit) => {
    const date = "2024-01-31T08:00:00";
    const zdt = ZonedDateTime.from(`${date}Z`);
    const invalid = { [unit]: null };
    for (const op of ["add", "subtract"] as const) {
      expect(() => PlainDate[op](date, invalid)).toThrow(RangeError);
      expect(() => PlainDateTime[op](date, invalid)).toThrow(RangeError);
      expect(() => ZonedDateTime[op](zdt, invalid)).toThrow(RangeError);
    }
  });

  it("undefined 仍表示零，运算只读取需要的单位", () => {
    const date = "2024-01-31T08:00:00";
    const zdt = ZonedDateTime.from(`${date}Z`);
    const fields = {
      days: undefined,
      months: undefined,
      get weeks(): number {
        throw new Error("读取了未使用的 weeks");
      },
      years: undefined,
    };
    const dateOnly = {
      days: undefined,
      get hours(): number {
        throw new Error("读取了纯日期忽略的 hours");
      },
    };
    for (const op of ["add", "subtract"] as const) {
      expect(PlainDate[op](date, dateOnly)).toEqual(PlainDate.from(date));
      expect(PlainDateTime[op](date, fields)).toEqual(PlainDateTime.from(date));
      expect(ZonedDateTime[op](zdt, fields)).toEqual(zdt);
    }
  });

  // ─────────── 1. 当前系统时间 ───────────
  it("获取当前系统时间，多种格式显示", () => {
    const now = Now.plainDateTimeISO();

    const fmt1 = PlainDateTime.format(now, DATE_FORMAT.DATE_TIME);
    const fmt2 = PlainDateTime.format(now, DATE_FORMAT.SLASH_DATE_TIME);
    const fmt3 = now.toISOString(); // 原生 ISO 8601
    const fmt4 = PlainDateTime.format(now, DATE_FORMAT.CN_DATE_TIME);

    expect(fmt1).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(fmt2).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(fmt3).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(fmt4).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}时\d{2}分\d{2}秒$/);
  });

  // ─────────── 2. 固定时间多种格式 ───────────
  it("解析 2025-12-12 12:12:12 并显示多种格式", () => {
    // PlainDateTime.from 接受完整 ISO 格式
    const dt = PlainDateTime.from("2025-12-12 12:12:12");

    expect(PlainDateTime.format(dt, DATE_FORMAT.DATE_TIME)).toBe("2025-12-12 12:12:12");
    expect(PlainDateTime.format(dt, DATE_FORMAT.SLASH_DATE_TIME)).toBe("2025/12/12 12:12:12");
    // ISO 8601：PlainDateTime.toString 默认就是 YYYY-MM-DDTHH:mm:ss（毫秒非零时补 .SSS）
    expect(PlainDateTime.toString(dt)).toBe("2025-12-12T12:12:12");
    expect(PlainDateTime.format(dt, DATE_FORMAT.CN_DATE_TIME)).toBe("2025年12月12日 12时12分12秒");
  });

  // ─────────── 3. 中国时间 → 系统当地时间 ───────────
  it("2025-12-12 12:12:12（中国时间）转系统当地时间", () => {
    // 先把字符串解析为无时区时间，再关联到 Asia/Shanghai
    const wallClock = PlainDateTime.from("2025-12-12T12:12:12");
    const cst = PlainDateTime.toZonedDateTime(wallClock, TIMEZONE.CHINA);
    // cst = { epochMs: 2025-12-12T04:12:12Z, timezone: "Asia/Shanghai" }

    // 转成系统当地时区
    const local = ZonedDateTime.withTimeZone(cst, LOCAL_TZ);

    // 是同一个绝对时刻
    expect(local.epochMs).toBe(cst.epochMs);

    // 只看一下两种展示
    const cstDisplay = ZonedDateTime.format(cst, DATE_FORMAT.DATE_TIME);
    const localDisplay = ZonedDateTime.format(local, DATE_FORMAT.DATE_TIME);
    expect(cstDisplay).toBe("2025-12-12 12:12:12");
    expect(localDisplay).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  // ─────────── 4. 中国时间 → 美国东部时间 ───────────
  it("2025-12-12 12:12:12（中国时间）转美国东部时间", () => {
    const wallClock = PlainDateTime.from("2025-12-12T12:12:12");
    const cst = PlainDateTime.toZonedDateTime(wallClock, TIMEZONE.CHINA);
    const est = ZonedDateTime.withTimeZone(cst, TIMEZONE.AMERICA_NEW_YORK);

    // 12 月美国东部是 EST（UTC-5），北京时间是 CST（UTC+8）
    // 12:12 CST = 04:12 UTC = 23:12 EST（往前一天）
    expect(ZonedDateTime.format(est, DATE_FORMAT.DATE_TIME)).toBe("2025-12-11 23:12:12");
    expect(ZonedDateTime.format(est, "XXX")).toBe("-05:00"); // EST 偏移
    expect(est.epochMs).toBe(cst.epochMs); // 同一绝对时刻
  });

  // ─────────── 5. 东京时间 → 北京时间 ───────────
  it("用户在东京，现在北京时间是多少？", () => {
    // 当前东京时间
    const tokyoNow = Now.zonedDateTimeISO(TIMEZONE.ASIA_TOKYO);
    // 时时区转换
    const beijingNow = ZonedDateTime.withTimeZone(tokyoNow, TIMEZONE.CHINA);

    // 同一绝对时刻
    expect(beijingNow.epochMs).toBe(tokyoNow.epochMs);

    // 东京比北京早 1 小时（JST = UTC+9, CST = UTC+8）
    const tokyoHour = Number(ZonedDateTime.format(tokyoNow, "HH"));
    const beijingHour = Number(ZonedDateTime.format(beijingNow, "HH"));

    // 可能跨天：东京 23 点 = 北京 22 点，东京 0 点 = 前一日 23 点
    const hourDiff = (tokyoHour - beijingHour + 24) % 24;
    expect(hourDiff).toBe(1);
  });

  // ─────────── 6. 90 天后 ───────────
  it("从 2026-07-14 开始，90 天后是哪一天？", () => {
    const start = PlainDate.from("2026-07-14");
    const after90 = PlainDate.add(start, { days: 90 });

    expect(PlainDate.toString(after90)).toBe("2026-10-12");

    // 也可以算回来
    const back = PlainDate.subtract(after90, { days: 90 });
    expect(PlainDate.toString(back)).toBe("2026-07-14");
  });

  // ─────────── 7. 时间差 ───────────
  it("计算两个时间之间相差多久", () => {
    // 以 PlainDateTime 为例
    const start = PlainDateTime.from("2026-06-01T08:30:00");
    const end = PlainDateTime.from("2026-07-14T19:45:30");

    // since 返回 Duration 对象，已分解为 days / hours / minutes / seconds
    const diff = PlainDateTime.since(end, start);
    expect(diff.days).toBe(43);
    expect(diff.hours).toBe(11);
    expect(diff.minutes).toBe(15);
    expect(diff.seconds).toBe(30);

    // 也可以用 Instant.since 得到同样的绝对值
    const epochDiff = Instant.since(end.getTime(), start.getTime());
    expect(epochDiff.days).toBe(43);

    // Duration.totalMilliseconds 可以把差值的非年月字段汇总为毫秒
    const total = Duration.totalMilliseconds(diff);
    expect(total).toBe(end.getTime() - start.getTime());

    // 反过来：Duration.fromMilliseconds 可以把毫秒拆回各字段
    expect(Duration.fromMilliseconds(total)).toMatchObject({
      days: 43,
      hours: 11,
      minutes: 15,
      seconds: 30,
    });
  });
});
