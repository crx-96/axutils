import { describe, expect, it } from "vitest";
import { PlainDateTime } from "../../src/date";

describe("date/PlainDateTime", () => {
  it("解析 ISO、Date 和字段对象", () => {
    expect(PlainDateTime.toString("2024-06-15T10:30:00")).toBe("2024-06-15T10:30:00");
    expect(PlainDateTime.toString("2024-06-15T10:30:00Z")).toBe("2024-06-15T10:30:00");
    expect(PlainDateTime.toString({ day: 15, hour: 10, minute: 30, month: 6, year: 2024 })).toBe(
      "2024-06-15T10:30:00",
    );
    expect(PlainDateTime.toString(new Date("2024-06-15T10:30:00Z"))).toBe("2024-06-15T10:30:00");
    expect(() => PlainDateTime.from(null as never)).toThrow(RangeError);
    expect(() => PlainDateTime.from(undefined as never)).toThrow(RangeError);
  });

  it("接受斜杠分隔的日期时间字符串", () => {
    expect(PlainDateTime.toString("2026/12/12T10:30:00")).toBe("2026-12-12T10:30:00");
    expect(PlainDateTime.toString("2026/12/12T10:30:00Z")).toBe("2026-12-12T10:30:00");
  });

  it("接受 T、t 和空格作为日期与时间的分隔符", () => {
    expect(PlainDateTime.toString("2026-12-12 10:30:00")).toBe("2026-12-12T10:30:00");
    expect(PlainDateTime.toString("2026-12-12t10:30:00")).toBe("2026-12-12T10:30:00");
  });

  it("支持关联时区、提取部分和格式化", () => {
    const value = PlainDateTime.from("2024-06-15T10:30:00");
    expect(PlainDateTime.toZonedDateTime(value, "Asia/Shanghai")).toEqual({
      epochMs: Date.parse("2024-06-15T02:30:00Z"),
      timezone: "Asia/Shanghai",
    });
    expect(PlainDateTime.toPlainDate(value).toISOString()).toBe("2024-06-15T00:00:00.000Z");
    expect(PlainDateTime.toString(PlainDateTime.toPlainTime(value))).toBe("1970-01-01T10:30:00");
    expect(PlainDateTime.format(value, "yyyy-MM-dd HH:mm", { timezone: "Asia/Shanghai" })).toBe(
      "2024-06-15 18:30",
    );
    expect(PlainDateTime.format(value, "yyyy-MM-dd HH:mm")).toBe("2024-06-15 10:30");
  });

  it("支持 since、compare 和关系判断", () => {
    const a = "2024-06-15T10:30:00";
    const b = "2024-06-14T10:30:00";
    expect(PlainDateTime.since(a, b).days).toBe(1);
    expect(PlainDateTime.compare(a, b)).toBe(1);
    expect(PlainDateTime.isBefore(b, a)).toBe(true);
    expect(PlainDateTime.isAfter(a, b)).toBe(true);
  });

  it("公元 0 年的年月运算保留闰日和时间字段", () => {
    expect(PlainDateTime.add("0000-02-29T10:30:00.123", {}).toISOString()).toBe(
      "0000-02-29T10:30:00.123Z",
    );
    expect(PlainDateTime.add("0000-01-31T10:30:00.123", { months: 1 }).toISOString()).toBe(
      "0000-02-29T10:30:00.123Z",
    );
    expect(PlainDateTime.subtract("0000-03-31T10:30:00.123", { months: 1 }).toISOString()).toBe(
      "0000-02-29T10:30:00.123Z",
    );
  });

  it("拒绝无效时区和小数时长", () => {
    const value = "2024-01-01T00:00:00";
    expect(() => PlainDateTime.toZonedDateTime(value, "Mars/Phobos")).toThrow(RangeError);
    expect(() => PlainDateTime.add(value, { hours: 0.5 })).toThrow(RangeError);
    expect(() => PlainDateTime.subtract(value, { milliseconds: 0.5 })).toThrow(RangeError);
  });

  it("负年与扩展年份输出合法 ISO，按需保留毫秒", () => {
    expect(PlainDateTime.toString({ day: 1, hour: 1, minute: 2, month: 1, year: -1 })).toBe(
      "-000001-01-01T01:02:00",
    );
    expect(
      PlainDateTime.toString({ day: 1, hour: 1, millisecond: 3, minute: 2, month: 1, year: 10000 }),
    ).toBe("+010000-01-01T01:02:00.003");
  });
});
