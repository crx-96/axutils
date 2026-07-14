import { describe, expect, it } from "vitest";
import { Duration } from "../../src/date";

describe("date/Duration", () => {
  it("保留字段，不自动归约", () => {
    expect(Duration.from({ seconds: 90 })).toEqual({ seconds: 90 });
    expect(Duration.add({ seconds: 30 }, { seconds: 40 })).toEqual({ seconds: 70 });
    expect(Duration.add({ days: 1 }, { hours: 1 })).toEqual({ days: 1, hours: 1 });
    expect(Duration.subtract({ days: 1 }, { hours: 1 })).toEqual({ days: 1, hours: -1 });
    expect(Duration.subtract({ minutes: 2 }, { seconds: 30 })).toEqual({
      minutes: 2,
      seconds: -30,
    });
  });

  it("在毫秒与完整字段之间转换", () => {
    expect(Duration.fromMilliseconds(0)).toEqual({
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    expect(Duration.fromMilliseconds(90_061_000)).toEqual({
      years: 0,
      months: 0,
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
      milliseconds: 0,
    });
    expect(Duration.totalMilliseconds({ days: 1, hours: 1 })).toBe(90_000_000);
    expect(Duration.totalMilliseconds({})).toBe(0);
    expect(() => Duration.totalMilliseconds({ years: 1, days: 1 })).toThrow(RangeError);
  });

  it("支持逐字段取反和绝对值", () => {
    expect(Duration.negated({ days: 1, hours: -2 })).toEqual({ days: -1, hours: 2 });
    expect(Duration.abs({ days: -1, hours: -2 })).toEqual({ days: 1, hours: 2 });
  });
});
