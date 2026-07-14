import { describe, expect, it } from "vitest";
import { PlainDate } from "../../src/date";

describe("date/PlainDate", () => {
  it("从三种输入构造并提取字段", () => {
    expect(PlainDate.toString(PlainDate.from("2024-06-15"))).toBe("2024-06-15");
    expect(PlainDate.toString(PlainDate.from(new Date("2024-06-15T23:00:00Z")))).toBe("2024-06-15");
    expect(PlainDate.toString(PlainDate.from({ year: 2024, month: 6, day: 15 }))).toBe(
      "2024-06-15",
    );
    expect(PlainDate.toString(PlainDate.from("2024-06-15T10:30:00Z"))).toBe("2024-06-15");
    expect(PlainDate.dayOfWeek("2024-01-01")).toBe(1);
  });

  it("接受斜杠分隔的日期字符串（跨平台兼容）", () => {
    expect(PlainDate.toString(PlainDate.from("2026/12/12"))).toBe("2026-12-12");
    expect(PlainDate.toString(PlainDate.from("2026/12/12T10:30:00"))).toBe("2026-12-12");
  });

  it("校验并接受带空格的完整日期时间输入", () => {
    expect(PlainDate.toString("2024-06-15 10:30:00")).toBe("2024-06-15");
    expect(PlainDate.toString("2024-06-15t10:30:00Z")).toBe("2024-06-15");
  });

  it("of 工厂方法正常构造", () => {
    expect(PlainDate.toString(PlainDate.of(2024, 6, 15))).toBe("2024-06-15");
  });

  it("subtract 正确计算", () => {
    expect(PlainDate.toString(PlainDate.subtract("2024-06-15", { days: 1 }))).toBe("2024-06-14");
    expect(PlainDate.toString(PlainDate.subtract("2024-06-15", { months: 1 }))).toBe("2024-05-15");
  });

  it("拒绝无效输入并处理闰年、月末和周边界", () => {
    expect(() => PlainDate.from(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => PlainDate.from("2024-13-01")).toThrow(RangeError);
    expect(() => PlainDate.from("abc")).toThrow(RangeError);
    expect(() => PlainDate.from("")).toThrow(RangeError);
    expect(PlainDate.toString(PlainDate.add("2024-02-29", { years: 1 }))).toBe("2025-02-28");
    expect(PlainDate.toString(PlainDate.add("2024-01-31", { months: 1 }))).toBe("2024-02-29");
    expect(PlainDate.daysInMonth("2024-02-01")).toBe(29);
    expect(PlainDate.daysInMonth("2023-02-01")).toBe(28);
    expect(PlainDate.toString(PlainDate.startOfWeek("2024-01-03"))).toBe("2024-01-01");
    expect(PlainDate.toString(PlainDate.endOfWeek("2024-01-03"))).toBe("2024-01-07");
    expect(PlainDate.toString(PlainDate.startOfWeek("2024-01-03", { weekStartsOn: 0 }))).toBe(
      "2023-12-31",
    );
    expect(PlainDate.toString(PlainDate.endOfWeek("2024-01-03", { weekStartsOn: 6 }))).toBe(
      "2024-01-05",
    );
    expect(() => PlainDate.startOfWeek("2024-01-03", { weekStartsOn: 7 })).toThrow(RangeError);
  });

  it("比较、计算差值并在 UTC 下稳定格式化", () => {
    expect(PlainDate.since("2024-06-16", "2024-06-15")).toEqual({ days: 1 });
    expect(PlainDate.isBefore("2024-06-15", "2024-06-16")).toBe(true);
    expect(PlainDate.isAfter("2024-06-16", "2024-06-15")).toBe(true);
    expect(PlainDate.isBetween("2024-06-15", "2024-06-15", "2024-06-16")).toBe(true);
    expect(PlainDate.format("2024-06-15", "yyyy-MM-dd")).toBe("2024-06-15");
  });

  it("拒绝 null 和 undefined 输入", () => {
    expect(() => PlainDate.from(null as never)).toThrow(RangeError);
    expect(() => PlainDate.from(undefined as never)).toThrow(RangeError);
  });
});
