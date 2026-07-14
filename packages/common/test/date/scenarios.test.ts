import { describe, expect, it } from "vitest";
import {
  DATE_FORMAT,
  Duration,
  Instant,
  Now,
  PlainDate,
  PlainDateTime,
  TIMEZONE,
  ZonedDateTime,
} from "../../src/date";

/** 运行时的本地 IANA 时区 */
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("date/usage-scenarios", () => {
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
