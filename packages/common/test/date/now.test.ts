import { formatInTimeZone } from "date-fns-tz";
import { describe, expect, it } from "vitest";
import { Now } from "../../src/date";

describe("date/Now", () => {
  it("返回目标时区的当前纯值和绝对时间", () => {
    const before = Date.now();
    const date = Now.plainDateISO("UTC");
    const after = Date.now();
    expect(date.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/u);
    expect(Now.plainDateTimeISO("UTC").getTime()).toBeGreaterThanOrEqual(date.getTime());
    expect(Now.instant()).toBeGreaterThanOrEqual(before);
    expect(Now.instant()).toBeLessThanOrEqual(after + 100);
  });

  it("在时区边界只会相差一天", () => {
    const utc = Now.plainDateISO("UTC").getUTCDate();
    const shanghai = Now.plainDateISO("Asia/Shanghai").getUTCDate();
    expect(Math.abs(shanghai - utc)).toBeLessThanOrEqual(1);
    const before = Date.now();
    const zoned = Now.zonedDateTimeISO("Asia/Shanghai");
    expect(zoned.timezone).toBe("Asia/Shanghai");
    expect(zoned.epochMs).toBeGreaterThanOrEqual(before);
    expect(zoned.epochMs).toBeLessThanOrEqual(Date.now());
  });

  it("纯时间保留毫秒，并按目标时区读取当前字段", () => {
    for (const timezone of ["UTC", "Asia/Shanghai"]) {
      const expectedBefore = formatInTimeZone(new Date(), timezone, "HH:mm:ss");
      const actual = Now.plainTimeISO(timezone);
      const expectedAfter = formatInTimeZone(new Date(), timezone, "HH:mm:ss");
      expect(actual.toISOString()).toMatch(/^1970-01-01T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
      expect([expectedBefore, expectedAfter]).toContain(actual.toISOString().slice(11, 19));
      expect(actual.getUTCMilliseconds()).toBeGreaterThanOrEqual(0);
    }

    const dateTime = Now.plainDateTimeISO("UTC");
    expect(dateTime.getUTCMilliseconds()).toBeGreaterThanOrEqual(0);
  });
});
