import { describe, expect, it } from "vitest";
import { Instant } from "../../src/date";

describe("date/Instant", () => {
  it("解析带时区 ISO 并保留 epoch 毫秒", () => {
    expect(Instant.from("2024-06-15T10:00:00Z")).toBe(Date.parse("2024-06-15T10:00:00Z"));
    expect(Instant.from("2024/06/15T10:00:00Z")).toBe(Date.parse("2024-06-15T10:00:00Z"));
    expect(() => Instant.from("2024-06-15T10:00:00")).toThrow(RangeError);
    expect(() => Instant.from("2024-02-30T10:00:00Z")).toThrow(RangeError);
    expect(Instant.fromEpochMilliseconds(1_718_445_600_000)).toBe(1_718_445_600_000);
  });

  it("按实际毫秒计算加法和差值", () => {
    const instant = Instant.fromEpochMilliseconds(0);
    expect(Instant.add(instant, { hours: 24 })).toBe(86_400_000);
    expect(Instant.add(instant, { days: 1 })).toBe(86_400_000);
    expect(() => Instant.add(instant, { years: 1 })).toThrow(RangeError);
    expect(Instant.since(86_400_001, 0)).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 1,
    });
  });

  it("可以关联带时区值", () => {
    expect(Instant.toZonedDateTime(0, "Asia/Shanghai")).toEqual({
      epochMs: 0,
      timezone: "Asia/Shanghai",
    });
  });
});
