import { describe, expect, expectTypeOf, it } from "vitest";
import { DATE_FORMAT, PlainDateTime, TIMEZONE, type Timezone } from "../../src/date";

describe("date/format types", () => {
  it("同时提示预设格式并接受自定义格式", () => {
    expectTypeOf(PlainDateTime.format("2025-01-02T03:04:05", DATE_FORMAT.DATE_TIME)).toBeString();
    expectTypeOf(PlainDateTime.format("2025-01-02T03:04:05", "yyyy年M月d日 HH:mm")).toBeString();
  });

  it("同时提示常用时区并接受自定义 IANA 时区", () => {
    const customTimezone: Timezone = "America/Guatemala";

    expect(
      PlainDateTime.toZonedDateTime("2025-01-02T03:04:05", TIMEZONE.EUROPE_PARIS),
    ).toBeDefined();
    expect(PlainDateTime.toZonedDateTime("2025-01-02T03:04:05", customTimezone)).toBeDefined();
    expect(
      PlainDateTime.format("2025-01-02T03:04:05", DATE_FORMAT.DATE_TIME, {
        timezone: TIMEZONE.ASIA_TOKYO,
      }),
    ).toBe("2025-01-02 12:04:05");
  });
});
