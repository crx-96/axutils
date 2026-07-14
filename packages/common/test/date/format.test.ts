import { describe, expect, it } from "vitest";
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

  it("提供的全球常用时区都能被运行时识别", () => {
    for (const timezone of new Set(Object.values(TIMEZONE))) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: timezone })).not.toThrow();
    }
  });
});
