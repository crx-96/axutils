import { describe, expect, it, vi } from "vitest";
import { DATE_FORMAT, PlainDateTime, TIMEZONE, ZonedDateTime } from "../../src/date";

describe("date/format constants", () => {
  it("提供常用格式并保留中文日期的自然展示", () => {
    const value = PlainDateTime.from("2025-01-02T03:04:05");

    expect(PlainDateTime.format(value, DATE_FORMAT.DATE)).toBe("2025-01-02");
    expect(PlainDateTime.format(value, DATE_FORMAT.DATE_TIME)).toBe("2025-01-02 03:04:05");
    expect(PlainDateTime.format(value, DATE_FORMAT.DATE_TIME_MS)).toBe("2025-01-02 03:04:05.000");
    expect(PlainDateTime.format(value, DATE_FORMAT.SLASH_DATE)).toBe("2025/01/02");
    expect(PlainDateTime.format(value, DATE_FORMAT.CN_DATE)).toBe("2025年1月2日");
    expect(PlainDateTime.format(value, DATE_FORMAT.CN_DATE_TIME)).toBe("2025年1月2日 03时04分05秒");
    expect(PlainDateTime.format(value, DATE_FORMAT.TIME)).toBe("03:04:05");
    expect(PlainDateTime.format(value, DATE_FORMAT.TIME_MS)).toBe("03:04:05.000");
  });

  it("提供稳定的 UTC 和中国大陆时区常量", () => {
    expect(TIMEZONE.CHINA).toBe(TIMEZONE.ASIA_SHANGHAI);
    const value = ZonedDateTime.from("2025-01-02T03:04:05", {
      timezone: TIMEZONE.CHINA,
    });

    expect(ZonedDateTime.format(value, DATE_FORMAT.ISO_OFFSET)).toBe("2025-01-02T03:04:05+08:00");
    expect(
      ZonedDateTime.format(ZonedDateTime.withTimeZone(value, TIMEZONE.UTC), DATE_FORMAT.ISO_UTC),
    ).toBe("2025-01-01T19:04:05.000Z");
  });

  it("ISO_UTC 在非 UTC 关联时区和显示覆盖下也表示真实时间点", () => {
    const date = "2024-01-01T01:02:03.004Z";
    const zdt = ZonedDateTime.from(date, { timezone: "Asia/Shanghai" });
    const options = { timezone: "America/New_York" };
    expect(ZonedDateTime.format(zdt, DATE_FORMAT.ISO_UTC)).toBe(date);
    expect(ZonedDateTime.format(zdt, DATE_FORMAT.ISO_UTC, options)).toBe(date);
    expect(PlainDateTime.format(date, DATE_FORMAT.ISO_UTC, options)).toBe(date);
    expect(PlainDateTime.format(date, "HH:mm 'Z'", options)).toBe("20:02 Z");
  });

  it.each([
    [8_640_000_000_000_000, "Asia/Tokyo"],
    [-8_640_000_000_000_000, "America/New_York"],
  ] as const)("极限 epoch %s 的纯时间戳只需校验显示时区", (epochMs, timezone) => {
    const value = { epochMs, timezone };
    for (const [token, expected] of [
      ["T", String(epochMs)],
      ["t", String(epochMs / 1000)],
    ] as const) {
      expect(ZonedDateTime.format(value, token)).toBe(expected);
      expect(PlainDateTime.format(new Date(epochMs), token, { timezone })).toBe(expected);
      expect(() => ZonedDateTime.format(value, token, { timezone: "Mars/Phobos" })).toThrow(
        RangeError,
      );
    }
  });

  it("同一时区的字段与名称格式器预热后跨日期复用", () => {
    const zone = "Europe/Warsaw";
    ZonedDateTime.format({ epochMs: 0, timezone: zone }, "HH z zzzz");
    const construct = vi.spyOn(Intl, "DateTimeFormat");
    try {
      for (const epochMs of [0, Date.UTC(2024, 6, 1), Date.UTC(2024, 11, 1)]) {
        const value = ZonedDateTime.from(new Date(epochMs), { timezone: zone });
        ZonedDateTime.toPlainDateTime(value);
        ZonedDateTime.format(value, "HH z zzzz");
      }
      expect(construct).not.toHaveBeenCalled();
    } finally {
      construct.mockRestore();
    }
  });

  it("提供的全球常用时区都能被运行时识别", () => {
    for (const timezone of new Set(Object.values(TIMEZONE))) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: timezone })).not.toThrow();
    }
  });
});
