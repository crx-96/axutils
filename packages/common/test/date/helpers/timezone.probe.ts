import { fr } from "date-fns/locale/fr";
import { fromZonedTime } from "date-fns-tz";
import { describe, expect, it, vi } from "vitest";
import {
  DATE_FORMAT,
  Instant,
  Now,
  PlainDate,
  PlainDateTime,
  ZonedDateTime,
} from "../../../src/date/index.js";

describe(`date/独立宿主 ${process.env.TZ}`, () => {
  it("进程启动时已经应用请求的宿主时区", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ);
  });

  it.each([
    "2024-03-10T02:30:00",
    "2011-12-30T02:30:00",
  ])("%s 的墙上字段不被宿主 DST 或跳日提前改写", (wallTime) => {
    const expected = Date.parse(`${wallTime}Z`);
    expect(PlainDateTime.toZonedDateTime(wallTime, "UTC").epochMs).toBe(expected);
    expect(ZonedDateTime.from(`${wallTime}[UTC]`).epochMs).toBe(expected);
    expect(ZonedDateTime.from(wallTime, { timezone: "UTC" }).epochMs).toBe(expected);
    const date = wallTime.slice(0, 10);
    expect(PlainDate.toZonedDateTime(date, "UTC").epochMs).toBe(Date.parse(`${date}T00:00:00Z`));
  });

  it.each([
    ["2024-03-10T02:30:00.123", "2024-03-09T18:30:00.123Z"],
    ["2011-12-30T02:30:00.123", "2011-12-29T18:30:00.123Z"],
  ])("格式化和反向读取 %s 的 UTC 与上海墙上字段", (wall, shanghaiInstant) => {
    for (const [timezone, instant] of [
      ["UTC", `${wall}Z`],
      ["Asia/Shanghai", shanghaiInstant],
    ] as const) {
      const date = new Date(instant);
      const zdt = Instant.toZonedDateTime(date.getTime(), timezone);
      const offset = timezone === "UTC" ? "Z" : "+08:00";
      expect(ZonedDateTime.toString(zdt)).toBe(wall + offset);
      expect(ZonedDateTime.format(zdt, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")).toBe(wall + offset);
      expect(PlainDateTime.format(date, DATE_FORMAT.DATE_TIME_MS, { timezone })).toBe(
        wall.replace("T", " "),
      );
      expect(PlainDate.format(wall.slice(0, 10), DATE_FORMAT.DATE)).toBe(wall.slice(0, 10));
      expect(ZonedDateTime.toPlainDateTime(zdt).toISOString()).toBe(`${wall}Z`);
      expect(ZonedDateTime.toPlainDate(zdt).toISOString()).toBe(
        `${wall.slice(0, 10)}T00:00:00.000Z`,
      );
      expect(ZonedDateTime.toPlainTime(zdt).toISOString()).toBe("1970-01-01T02:30:00.123Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(date);
        expect(Now.plainDateTimeISO(timezone).toISOString()).toBe(`${wall}Z`);
        expect(Now.plainDateISO(timezone).toISOString()).toBe(`${wall.slice(0, 10)}T00:00:00.000Z`);
        expect(Now.plainTimeISO(timezone).toISOString()).toBe("1970-01-01T02:30:00.123Z");
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("回拨两次 01:30 的偏移、时区名称与时间戳对应各自瞬间", () => {
    for (const [offset, utc] of [
      ["-04:00", "05:30"],
      ["-05:00", "06:30"],
    ]) {
      const timezone = "America/New_York";
      const iso = `2024-11-03T01:30:00.007${offset}`;
      const epoch = Date.parse(`2024-11-03T${utc}:00.007Z`);
      const zdt = ZonedDateTime.from(`${iso}[${timezone}]`, { timezone: "UTC" });
      expect(zdt).toStrictEqual({ epochMs: epoch, timezone });
      expect(ZonedDateTime.toString(zdt)).toBe(iso);
      expect(ZonedDateTime.format(zdt, "PPPP 'à' p", { locale: fr })).toBe(
        "dimanche 3 novembre 2024 à 01:30",
      );
      const name = new Intl.DateTimeFormat("fr", { timeZone: timezone, timeZoneName: "long" })
        .formatToParts(epoch)
        .find((p) => p.type === "timeZoneName")?.value;
      expect(
        ZonedDateTime.format(zdt, "EEEE d MMMM yyyy HH:mm xxx OOOO zzzz RRRR-II-i 'X''z' t T", {
          locale: fr,
        }),
      ).toBe(
        `dimanche 3 novembre 2024 01:30 ${offset} GMT${offset} ${name} 2024-44-7 X'z ${Math.floor(epoch / 1000)} ${epoch}`,
      );
    }
  });

  it("偏移分钟独立校验，同时保留正负 14:00 边界", () => {
    for (const offset of ["+00:60", "-00:60", "+13:99", "-13:99", "+14:01", "-14:01"]) {
      const input = `2024-06-15T10:00:00${offset}`;
      expect(() => Instant.from(input)).toThrow(RangeError);
      expect(() => PlainDateTime.from(input)).toThrow(RangeError);
      expect(() => ZonedDateTime.from(input)).toThrow(RangeError);
    }
    for (const offset of ["+00:59", "-00:59", "+13:59", "-13:59", "+14:00", "-14:00"]) {
      const input = `2024-06-15T10:00:00${offset}`;
      expect(Instant.from(input)).toBe(Date.parse(input));
      expect(PlainDateTime.from(input).getTime()).toBe(Date.parse(input));
      expect(ZonedDateTime.from(input).epochMs).toBe(Date.parse(input));
    }
  });

  it("epoch 附近的正负毫秒不会在目标时区转换中损失精度", () => {
    for (const epochMs of [-1007, -1001, -1, 0, 1, 1001, 1003, 1005, 1007, 1011]) {
      const date = new Date(epochMs);
      expect(PlainDateTime.toZonedDateTime(date, "UTC").epochMs).toBe(epochMs);
      const wallTime = date.toISOString().slice(0, -1);
      expect(ZonedDateTime.from(wallTime, { timezone: "UTC" }).epochMs).toBe(epochMs);
    }
  });

  it.each([
    "2024-03-10T02:30:00",
    "2024-11-03T01:30:00",
  ])("目标纽约的 %s 保留公开 peer 的 DST 消歧策略", (wallTime) => {
    // 此契约不假设 peer 对重复时刻跨宿主一致，只约束库继续采用其公开转换语义。
    const expected = fromZonedTime(wallTime, "America/New_York").getTime();
    expect(PlainDateTime.toZonedDateTime(wallTime, "America/New_York").epochMs).toBe(expected);
    expect(ZonedDateTime.from(`${wallTime}[America/New_York]`).epochMs).toBe(expected);
  });

  it.each([
    [0, -62_373_763_799_877],
    [1, -62_121_302_999_877],
    [99, -59_028_701_399_877],
    [-1, -62_847_149_399_877],
    [10000, 253_416_681_000_123],
  ])("年份 %s 保持本次重构前的 UTC 转换结果", (year, expected) => {
    // 0/BCE 数值是既有 peer 的兼容性基线，不表示其符合 ISO 历史年份；更换策略需单独审查。
    const date = PlainDateTime.from({
      day: 15,
      hour: 10,
      millisecond: 123,
      minute: 30,
      month: 6,
      year,
    });
    expect(date.getUTCFullYear()).toBe(year);
    expect(PlainDateTime.toZonedDateTime(date, "UTC").epochMs).toBe(expected);
  });
});
