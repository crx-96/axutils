import { describe, expect, it } from "vitest";
import { PlainDateTime } from "../../src/date";

describe("date/PlainDateTime", () => {
  it("解析 ISO、Date 和字段对象", () => {
    expect(PlainDateTime.toString("2024-06-15T10:30:00")).toBe("2024-06-15T10:30:00");
    expect(PlainDateTime.toString("2024-06-15T10:30:00Z")).toBe("2024-06-15T10:30:00");
    expect(PlainDateTime.toString({ year: 2024, month: 6, day: 15, hour: 10, minute: 30 })).toBe(
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
});
