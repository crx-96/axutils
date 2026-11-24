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

  it.each(["t", " "])("接受分隔符 %j，仍要求以明确偏移结尾", (separator) => {
    const local = `2024/06/15${separator}10:00:00.123456789`;
    expect(Instant.from(`${local}+05:45`)).toBe(Date.parse("2024-06-15T04:15:00.123Z"));
    expect(() => Instant.from(local)).toThrow(RangeError);
    expect(() => Instant.from(`${local}Z[UTC]`)).toThrow(RangeError);
    expect(() => Instant.from(`${local}+14:01`)).toThrow(RangeError);
  });

  it("按实际毫秒计算加法和差值", () => {
    const instant = Instant.fromEpochMilliseconds(0);
    expect(Instant.add(instant, { hours: 24 })).toBe(86_400_000);
    expect(Instant.add(instant, { days: 1 })).toBe(86_400_000);
    expect(() => Instant.add(instant, { years: 1 })).toThrow(RangeError);
    expect(Instant.since(86_400_001, 0)).toEqual({
      days: 1,
      hours: 0,
      milliseconds: 1,
      minutes: 0,
      seconds: 0,
    });
  });

  it("可以关联带时区值", () => {
    expect(Instant.toZonedDateTime(0, "Asia/Shanghai")).toEqual({
      epochMs: 0,
      timezone: "Asia/Shanghai",
    });
  });

  it.each(["days", "hours", "minutes", "seconds", "milliseconds"])(
    "拒绝 %s 的小数字段而不返回小数毫秒或静默截断",
    (field) => {
      expect(() => Instant.add(0, { [field]: 0.5 })).toThrow(RangeError);
      expect(() => Instant.subtract(0, { [field]: 0.5 })).toThrow(RangeError);
    },
  );

  it("允许时间值边界，拒绝加减后超出 Date 范围的结果", () => {
    const maximum = 8_640_000_000_000_000;
    expect(Instant.add(maximum - 1, { milliseconds: 1 })).toBe(maximum);
    expect(Instant.subtract(-maximum + 1, { milliseconds: 1 })).toBe(-maximum);
    expect(() => Instant.add(maximum, { milliseconds: 1 })).toThrow(RangeError);
    expect(() => Instant.subtract(-maximum, { milliseconds: 1 })).toThrow(RangeError);
    expect(() => Instant.add(0, { days: Number.MAX_VALUE })).toThrow(RangeError);
  });

  it.each(["add", "subtract"] as const)("%s 的时长 getter 只读取一次", (method) => {
    let reads = 0;
    const duration = {
      get seconds() {
        reads += 1;
        return reads === 1 ? 1 : 0.5;
      },
    };

    expect(Instant[method](0, duration)).toBe(method === "add" ? 1_000 : -1_000);
    expect(reads).toBe(1);
  });

  it.each(["add", "subtract"] as const)("%s 也校验非枚举和继承的时长字段", (method) => {
    const hidden = Object.defineProperty({}, "seconds", { value: 0.5 });
    const inherited = Object.create({ hours: 0.5 });

    expect(() => Instant[method](0, hidden)).toThrow(RangeError);
    expect(() => Instant[method](0, inherited)).toThrow(RangeError);
  });

  it("toZonedDateTime 拒绝缺省或非法时区且不回退到本地时区", () => {
    expect(() => Instant.toZonedDateTime(0, undefined as never)).toThrow(RangeError);
    expect(() => Instant.toZonedDateTime(0, "" as never)).toThrow(RangeError);
  });

  it("消除 -0 且拒绝混用日期分隔符", () => {
    expect(Object.is(Instant.fromEpochMilliseconds(-0), -0)).toBe(false);
    const diff = Instant.since(0, 1_000);
    expect(diff).toEqual({ days: 0, hours: 0, milliseconds: 0, minutes: 0, seconds: -1 });
    expect(Object.is(diff.days, -0)).toBe(false);
    expect(Object.is(diff.hours, -0)).toBe(false);
    expect(Object.is(diff.minutes, -0)).toBe(false);
    expect(Object.is(diff.milliseconds, -0)).toBe(false);
    expect(() => Instant.from("2024-06/15T10:00:00Z")).toThrow(RangeError);
    expect(() => Instant.from("2024/06-15T10:00:00Z")).toThrow(RangeError);
  });

  it("大跨度 since 使用 BigInt 保持毫秒级精度", () => {
    expect(Instant.since(8_640_000_000_000_000, -8_639_999_999_999_999)).toEqual({
      days: 199_999_999,
      hours: 23,
      milliseconds: 999,
      minutes: 59,
      seconds: 59,
    });
    expect(Instant.since(-8_639_999_999_999_999, 8_640_000_000_000_000)).toEqual({
      days: -199_999_999,
      hours: -23,
      milliseconds: -999,
      minutes: -59,
      seconds: -59,
    });
  });
});
