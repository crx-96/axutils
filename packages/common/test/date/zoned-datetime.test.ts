import { describe, expect, it } from "vitest";
import { ZonedDateTime } from "../../src/date";

describe("date/ZonedDateTime", () => {
  it("解析含 IANA 时区的 ISO 字符串", () => {
    const value = ZonedDateTime.from("2024-06-15T10:00:00+08:00[Asia/Shanghai]");
    expect(value.epochMs).toBe(Date.parse("2024-06-15T02:00:00Z"));
    expect(value.timezone).toBe("Asia/Shanghai");
    expect(ZonedDateTime.toString(value)).toContain("+08:00");
  });

  it("冲突时偏移确定 epoch，方括号时区用于显示", () => {
    const timezone = "America/New_York";
    for (const offset of ["Z", "+00:00", "-00:00", "+05:45", "+14:00", "-14:00"]) {
      const text = `2024-03-10T02:30:00.123${offset}`;
      expect(ZonedDateTime.from(`${text}[${timezone}]`, { timezone: "UTC" })).toEqual({
        epochMs: Date.parse(text),
        timezone,
      });
    }
    expect(ZonedDateTime.from("0000-01-01T00:00:00+14:00[UTC]").epochMs).toBe(
      Date.parse("-000001-12-31T10:00:00Z"),
    );
    expect(() => ZonedDateTime.from("2024-03-10T02:30:00+14:01[UTC]")).toThrow(RangeError);
    expect(() => ZonedDateTime.from("2024-03-10T02:30:00Z[Mars/Phobos]")).toThrow(RangeError);
  });

  it("序列化保留公元零年、毫秒和可精确表示的本地偏移", () => {
    for (const [input, expected] of [
      ["0000-01-01T00:00:00Z[UTC]", "0000-01-01T00:00:00Z"],
      ["0000-02-29T04:30:00.007Z[Etc/GMT-1]", "0000-02-29T05:30:00.007+01:00"],
      ["9999-12-31T23:59:59.999-01:00[Etc/GMT+1]", "9999-12-31T23:59:59.999-01:00"],
      ["9999-12-31T23:59:59.999Z[Asia/Tokyo]", "9999-12-31T23:59:59.999Z"],
    ] as const) {
      const value = ZonedDateTime.from(input);
      const text = ZonedDateTime.toString(value);
      expect(text).toBe(expected);
      expect(ZonedDateTime.from(text).epochMs).toBe(value.epochMs);
    }
  });

  it("蒙罗维亚历史偏移含秒时输出原时刻的 Z 文本", () => {
    for (const [epochMs, expected] of [
      [-1, "1969-12-31T23:59:59.999Z"],
      [0, "1970-01-01T00:00:00Z"],
      [123, "1970-01-01T00:00:00.123Z"],
    ] as const) {
      const text = ZonedDateTime.toString({ epochMs, timezone: "Africa/Monrovia" });
      expect(text).toBe(expected);
      expect(ZonedDateTime.from(text).epochMs).toBe(epochMs);
    }
    expect(() => ZonedDateTime.from("1969-12-31T23:15:30-00:44:30")).toThrow(RangeError);
  });

  it("扩展年回退使用带符号的 UTC 年份，公开文本输入仍要求四位年", () => {
    for (const text of [
      "-000001-12-31T10:00:00.003Z",
      "+010000-06-15T12:00:00Z",
      "-271821-04-20T00:00:00Z",
      "+275760-09-13T00:00:00Z",
    ]) {
      const epochMs = Date.parse(text);
      expect(ZonedDateTime.toString({ epochMs, timezone: "Asia/Tokyo" })).toBe(text);
      expect(() => ZonedDateTime.from(text)).toThrow(RangeError);
      expect(() => ZonedDateTime.toString({ epochMs, timezone: "Mars/Phobos" })).toThrow(
        RangeError,
      );
    }
  });

  it("接受斜杠分隔日期和 Z 后缀", () => {
    const value = ZonedDateTime.from("2024/06/15T10:00:00+08:00[Asia/Shanghai]");
    expect(value.epochMs).toBe(Date.parse("2024-06-15T02:00:00Z"));
    expect(ZonedDateTime.toString(value)).toContain("+08:00");
  });

  it("接受中国接口常见的空格分隔日期时间", () => {
    const value = ZonedDateTime.from("2024-06-15 10:00:00", { timezone: "Asia/Shanghai" });
    expect(value.epochMs).toBe(Date.parse("2024-06-15T02:00:00Z"));
  });

  it("切换时区保持同一时刻，并处理边界偏移", () => {
    const value = ZonedDateTime.from("2024-06-15T00:00:00Z", { timezone: "UTC" });
    const newZone = ZonedDateTime.withTimeZone(value, "America/New_York");
    expect(newZone.epochMs).toBe(value.epochMs);
    expect(ZonedDateTime.toString(ZonedDateTime.withTimeZone(value, "Asia/Kathmandu"))).toContain(
      "+05:45",
    );
    expect(ZonedDateTime.toPlainDate(value).toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  it("按实际时长跨越美国东部 DST", () => {
    const start = ZonedDateTime.from("2024-03-10T01:30:00-05:00[America/New_York]");
    const result = ZonedDateTime.add(start, { hours: 1 });
    expect(ZonedDateTime.toString(result)).toContain("03:30:00-04:00");
    expect(
      ZonedDateTime.equals(
        result,
        ZonedDateTime.from("2024-03-10T03:30:00-04:00[America/New_York]"),
      ),
    ).toBe(true);
  });

  it("拒绝 years/months 参数并正确比较", () => {
    const a = ZonedDateTime.from("2024-06-15T10:00:00Z", { timezone: "UTC" });
    const b = ZonedDateTime.from("2024-06-14T10:00:00Z", { timezone: "UTC" });
    expect(() => ZonedDateTime.add(a, { years: 1 })).toThrow(RangeError);
    expect(() => ZonedDateTime.add(a, { months: 1 })).toThrow(RangeError);
    expect(ZonedDateTime.since(a, b).days).toBe(1);
    expect(ZonedDateTime.compare(a, b)).toBe(1);
    expect(ZonedDateTime.equals(a, b)).toBe(false);
    expect(ZonedDateTime.equals(a, a)).toBe(true);
  });

  it("格式化可覆盖显示时区，并且不改变原值或默认显示", () => {
    const value = { epochMs: 0, timezone: "UTC" };
    expect(ZonedDateTime.format(value, "yyyy-MM-dd HH:mm:ss", { timezone: "Asia/Shanghai" })).toBe(
      "1970-01-01 08:00:00",
    );
    expect(ZonedDateTime.format(value, "yyyy-MM-dd HH:mm:ss")).toBe("1970-01-01 00:00:00");
    expect(value).toEqual({ epochMs: 0, timezone: "UTC" });
    expect(() => ZonedDateTime.format(value, "HH", { timezone: "Mars/Phobos" })).toThrow(
      RangeError,
    );
  });

  it("加减维持整数时间点和 Date 可表示范围", () => {
    const maximum = 8_640_000_000_000_000;
    expect(
      ZonedDateTime.add({ epochMs: maximum - 1, timezone: "UTC" }, { milliseconds: 1 }),
    ).toEqual({
      epochMs: maximum,
      timezone: "UTC",
    });
    expect(() =>
      ZonedDateTime.add({ epochMs: maximum, timezone: "UTC" }, { milliseconds: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      ZonedDateTime.subtract({ epochMs: -maximum, timezone: "UTC" }, { milliseconds: 1 }),
    ).toThrow(RangeError);
    expect(() => ZonedDateTime.add({ epochMs: 0, timezone: "UTC" }, { hours: 0.5 })).toThrow(
      RangeError,
    );
    expect(() =>
      ZonedDateTime.subtract({ epochMs: 0, timezone: "UTC" }, { milliseconds: 0.5 }),
    ).toThrow(RangeError);
  });

  it("读取与比较拒绝无效 epoch，不把 NaN 比较成相等", () => {
    const value = { epochMs: Number.NaN, timezone: "UTC" };
    const valid = { epochMs: 0, timezone: "UTC" };
    expect(() => ZonedDateTime.toInstant(value)).toThrow(RangeError);
    expect(() => ZonedDateTime.compare(value, valid)).toThrow(RangeError);
    expect(() => ZonedDateTime.equals(value, valid)).toThrow(RangeError);
    expect(() => ZonedDateTime.withTimeZone(value, "Asia/Shanghai")).toThrow(RangeError);
  });

  it("必填时区方法拒绝 undefined 而不回退本地时区，且拒绝混用分隔符", () => {
    const valid = { epochMs: 0, timezone: "UTC" };
    const missingTz = { epochMs: 0, timezone: undefined as never };
    expect(() => ZonedDateTime.withTimeZone(valid, undefined as never)).toThrow(RangeError);
    expect(() => ZonedDateTime.add(missingTz, { hours: 1 })).toThrow(RangeError);
    expect(() => ZonedDateTime.subtract(missingTz, { hours: 1 })).toThrow(RangeError);
    expect(() => ZonedDateTime.from("2024/06-15T10:00:00")).toThrow(RangeError);
    expect(() => ZonedDateTime.from("2024-06/15T10:00:00Z")).toThrow(RangeError);
  });

  it("add 与 subtract 拒绝非对象或数组 duration 容器", () => {
    const valid = { epochMs: 0, timezone: "UTC" };
    for (const invalidDuration of [null, undefined, "1", 123, []]) {
      expect(() => ZonedDateTime.add(valid, invalidDuration as never)).toThrow(RangeError);
      expect(() => ZonedDateTime.subtract(valid, invalidDuration as never)).toThrow(RangeError);
    }
  });

  it("大跨度 since 保持毫秒级精度且无 -0", () => {
    const max = { epochMs: 8_640_000_000_000_000, timezone: "UTC" };
    const almostMin = { epochMs: -8_639_999_999_999_999, timezone: "UTC" };
    expect(ZonedDateTime.since(max, almostMin)).toEqual({
      days: 199_999_999,
      hours: 23,
      milliseconds: 999,
      minutes: 59,
      seconds: 59,
    });
    expect(ZonedDateTime.since(almostMin, max)).toEqual({
      days: -199_999_999,
      hours: -23,
      milliseconds: -999,
      minutes: -59,
      seconds: -59,
    });
  });

  it("极限 epoch 在非 UTC 时区下正确提取 toPlainDate 与 toPlainTime", () => {
    const maxTokyo = { epochMs: 8_640_000_000_000_000, timezone: "Asia/Tokyo" };
    expect(ZonedDateTime.toPlainDate(maxTokyo).toISOString()).toBe("+275760-09-13T00:00:00.000Z");
    expect(ZonedDateTime.toPlainTime(maxTokyo).toISOString()).toBe("1970-01-01T09:00:00.000Z");

    const maxNewYork = { epochMs: 8_640_000_000_000_000, timezone: "America/New_York" };
    expect(ZonedDateTime.toPlainDate(maxNewYork).toISOString()).toBe("+275760-09-12T00:00:00.000Z");
    expect(ZonedDateTime.toPlainTime(maxNewYork).toISOString()).toMatch(
      /^1970-01-01T\d{2}:\d{2}:\d{2}\.000Z$/u,
    );

    const minTokyo = { epochMs: -8_640_000_000_000_000, timezone: "Asia/Tokyo" };
    expect(ZonedDateTime.toPlainDate(minTokyo).toISOString()).toBe("-271821-04-20T00:00:00.000Z");
    expect(ZonedDateTime.toPlainTime(minTokyo).toISOString()).toMatch(
      /^1970-01-01T\d{2}:\d{2}:\d{2}\.000Z$/u,
    );

    const minNewYork = { epochMs: -8_640_000_000_000_000, timezone: "America/New_York" };
    // -271821-04-19 早于 JS Date 最小可表示日期，但纯时间落在 1970-01-01 应正常提取。
    expect(() => ZonedDateTime.toPlainDate(minNewYork)).toThrow(RangeError);
    expect(ZonedDateTime.toPlainTime(minNewYork).toISOString()).toMatch(
      /^1970-01-01T\d{2}:\d{2}:\d{2}\.000Z$/u,
    );
  });
});
