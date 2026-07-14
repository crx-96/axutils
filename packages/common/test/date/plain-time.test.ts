import { describe, expect, it } from "vitest";
import { PlainTime } from "../../src/date";

describe("date/PlainTime", () => {
  it("解析纯时间和 datetime 字符串，不经过 Date 字符串解析", () => {
    expect(PlainTime.toString("10:30:00")).toBe("10:30:00");
    expect(PlainTime.toString("10:30:00.500")).toBe("10:30:00.500");
    expect(PlainTime.toString("2024-06-15T10:30:00")).toBe("10:30:00");
    expect(PlainTime.toString({ hour: 10, minute: 30 })).toBe("10:30:00");
    expect(() => PlainTime.from("10:30")).toThrow(RangeError);
    expect(() => PlainTime.from({ hour: 24, minute: 0 })).toThrow(RangeError);
    expect(() => PlainTime.from(null as never)).toThrow(RangeError);
    expect(() => PlainTime.from(undefined as never)).toThrow(RangeError);
  });

  it("加减法按 24 小时周期取模", () => {
    expect(PlainTime.toString(PlainTime.add("23:30:00", { hours: 1 }))).toBe("00:30:00");
    expect(PlainTime.toString(PlainTime.add("10:30:00", { hours: 24 }))).toBe("10:30:00");
    expect(PlainTime.toString(PlainTime.subtract("00:30:00", { minutes: 60 }))).toBe("23:30:00");
    expect(PlainTime.millisecondOf("10:30:00.500")).toBe(500);
    expect(PlainTime.since("10:30:01", "10:30:00")).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 1,
      milliseconds: 0,
    });
  });
});
