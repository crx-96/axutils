import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Now } from "../../src/date";

const NOW = new Date("2024-01-31T20:34:56.789Z");

describe("date/Now", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("返回目标时区的当前纯值和绝对时间", () => {
    expect(Now.plainDateISO("UTC").toISOString()).toBe("2024-01-31T00:00:00.000Z");
    expect(Now.plainDateTimeISO("UTC").getTime()).toBe(NOW.getTime());
    expect(Now.instant()).toBe(NOW.getTime());
  });

  it("跨月时按完整日期比较目标时区的一天差值", () => {
    const utc = Now.plainDateISO("UTC");
    const shanghai = Now.plainDateISO("Asia/Shanghai");
    expect(utc.toISOString()).toBe("2024-01-31T00:00:00.000Z");
    expect(shanghai.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(shanghai.getTime() - utc.getTime()).toBe(86_400_000);
    expect(Now.zonedDateTimeISO("Asia/Shanghai")).toEqual({
      epochMs: NOW.getTime(),
      timezone: "Asia/Shanghai",
    });
  });

  it("纯时间保留毫秒，并按目标时区读取当前字段", () => {
    for (const [timezone, expected] of [
      ["UTC", "1970-01-01T20:34:56.789Z"],
      ["Asia/Shanghai", "1970-01-01T04:34:56.789Z"],
    ]) {
      expect(Now.plainTimeISO(timezone).toISOString()).toBe(expected);
    }
    expect(Now.plainDateTimeISO("UTC").getUTCMilliseconds()).toBe(789);
  });
});
