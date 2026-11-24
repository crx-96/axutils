import { describe, expect, it } from "vitest";
import { PlainTime } from "../../src/date";

describe("date/PlainTime", () => {
  it("解析纯时间和 datetime 字符串，不经过 Date 字符串解析", () => {
    expect(PlainTime.toString("10:30:00")).toBe("10:30:00");
    expect(PlainTime.toString("10:30:00.500")).toBe("10:30:00.500");
    expect(PlainTime.toString("2024-06-15T10:30:00")).toBe("10:30:00");
    expect(PlainTime.toString("2024-06-15 10:30:00")).toBe("10:30:00");
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
      milliseconds: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("拒绝小数时间字段，仍忽略日期字段", () => {
    expect(() => PlainTime.add("12:00:00", { milliseconds: 0.5 })).toThrow(RangeError);
    expect(() => PlainTime.subtract("12:00:00", { hours: 0.5 })).toThrow(RangeError);
    expect(PlainTime.toString(PlainTime.add("12:00:00", { days: 0.5, hours: 1 }))).toBe("13:00:00");
  });

  it("带偏移日期时间按 UTC 归一化并校验 IANA 后缀与分隔符一致性", () => {
    expect(PlainTime.toString("2024-06-15T01:30:00+08:00")).toBe("17:30:00");
    expect(PlainTime.toString("2024-06-15T10:30:00.500+08:00")).toBe("02:30:00.500");
    expect(PlainTime.toString("2024-06-15T10:30:00+08:00[Asia/Shanghai]")).toBe("02:30:00");
    expect(() => PlainTime.from("2024-06-15T10:30:00Z[Mars/Phobos]")).toThrow(RangeError);
    expect(() => PlainTime.from("2024/06-15T10:00:00")).toThrow(RangeError);
    expect(() => PlainTime.from("2024-06/15T10:00:00Z")).toThrow(RangeError);
  });

  it("add 与 subtract 拒绝非对象或数组 duration 容器", () => {
    for (const invalidDuration of [null, undefined, "1", 123, []]) {
      expect(() => PlainTime.add("12:00:00", invalidDuration as never)).toThrow(RangeError);
      expect(() => PlainTime.subtract("12:00:00", invalidDuration as never)).toThrow(RangeError);
    }
  });

  it("since 的负差零字段不产生 -0", () => {
    const diff = PlainTime.since("00:00:00", "00:00:01");
    expect(diff).toEqual({ hours: 0, milliseconds: 0, minutes: 0, seconds: -1 });
    expect(Object.is(diff.hours, -0)).toBe(false);
    expect(Object.is(diff.minutes, -0)).toBe(false);
    expect(Object.is(diff.milliseconds, -0)).toBe(false);
  });

  it("大安全整数偏移精确取模并拒绝非安全超大整数", () => {
    expect(PlainTime.toString(PlainTime.add("12:00:00.001", { hours: 3_000_000_000 }))).toBe(
      "12:00:00.001",
    );
    expect(PlainTime.toString(PlainTime.subtract("12:00:00.001", { hours: 3_000_000_000 }))).toBe(
      "12:00:00.001",
    );
    expect(() => PlainTime.add("12:00:00", { hours: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      RangeError,
    );
    expect(() => PlainTime.subtract("12:00:00", { hours: Number.MAX_VALUE })).toThrow(RangeError);
  });
});
