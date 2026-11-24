import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { Duration } from "../../src/date";

describe("date/Duration", () => {
  it("保留字段，不自动归约", () => {
    expect(Duration.from({ seconds: 90 })).toEqual({ seconds: 90 });
    expect(Duration.add({ seconds: 30 }, { seconds: 40 })).toEqual({ seconds: 70 });
    expect(Duration.add({ days: 1 }, { hours: 1 })).toEqual({ days: 1, hours: 1 });
    expect(Duration.subtract({ days: 1 }, { hours: 1 })).toEqual({ days: 1, hours: -1 });
    expect(Duration.subtract({ minutes: 2 }, { seconds: 30 })).toEqual({
      minutes: 2,
      seconds: -30,
    });
  });

  it.runIf(runInNewContext("typeof Temporal === 'object'"))(
    "读取真实 Temporal.Duration 的原型字段",
    () => {
      const duration = runInNewContext(
        "Temporal.Duration.from({days: 3, hours: 2, microseconds: 1})",
      );
      expect(Duration.from(duration)).toStrictEqual({
        days: 3,
        hours: 2,
        milliseconds: 0,
        minutes: 0,
        months: 0,
        seconds: 0,
        years: 0,
      });
    },
  );

  it("复制继承及非枚举的支持单位，忽略额外字段", () => {
    const input = Object.create({
      days: 3,
      get extra() {
        throw new Error("无关字段");
      },
    });
    Object.defineProperty(input, "hours", { value: 2 });
    expect(Duration.from(input)).toStrictEqual({ days: 3, hours: 2 });
    expect(Duration.from({ minutes: undefined, seconds: 0 })).toStrictEqual({ seconds: 0 });
  });

  it("各运算校验且只使用 getter 的第一次读取", () => {
    for (const [operation, expected] of [
      [Duration.from, { seconds: 2 }],
      [Duration.negated, { seconds: -2 }],
      [Duration.abs, { seconds: 2 }],
      [Duration.totalMilliseconds, 2000],
      [(d) => Duration.add(d, { seconds: 1 }), { seconds: 3 }],
      [(d) => Duration.subtract({ seconds: 1 }, d), { seconds: -1 }],
    ] as const satisfies readonly (readonly [(d: { seconds: number }) => unknown, unknown])[]) {
      let reads = 0;
      expect(
        operation({
          get seconds() {
            return ++reads === 1 ? 2 : NaN;
          },
        }),
      ).toEqual(expected);
      expect(reads).toBe(1);
    }
  });

  it("在毫秒与完整字段之间转换", () => {
    expect(Duration.fromMilliseconds(0)).toEqual({
      days: 0,
      hours: 0,
      milliseconds: 0,
      minutes: 0,
      months: 0,
      seconds: 0,
      years: 0,
    });
    expect(Duration.fromMilliseconds(90_061_000)).toEqual({
      days: 1,
      hours: 1,
      milliseconds: 0,
      minutes: 1,
      months: 0,
      seconds: 1,
      years: 0,
    });
    expect(Duration.totalMilliseconds({ days: 1, hours: 1 })).toBe(90_000_000);
    expect(Duration.totalMilliseconds({})).toBe(0);
    expect(() => Duration.totalMilliseconds({ days: 1, years: 1 })).toThrow(RangeError);
  });

  it("支持逐字段取反和绝对值", () => {
    expect(Duration.negated({ days: 1, hours: -2 })).toEqual({ days: -1, hours: 2 });
    expect(Duration.abs({ days: -1, hours: -2 })).toEqual({ days: 1, hours: 2 });
  });

  it("负数拆解与取反不产生 -0", () => {
    const fromNeg = Duration.fromMilliseconds(-1_000);
    expect(fromNeg).toEqual({
      days: 0,
      hours: 0,
      milliseconds: 0,
      minutes: 0,
      months: 0,
      seconds: -1,
      years: 0,
    });
    for (const unit of ["years", "months", "days", "hours", "minutes", "milliseconds"] as const) {
      expect(Object.is(fromNeg[unit], -0)).toBe(false);
    }

    const negated = Duration.negated({ days: 0, hours: 1 });
    expect(negated).toEqual({ days: 0, hours: -1 });
    expect(Object.is(negated.days, -0)).toBe(false);
  });

  it("拒绝溢出结果并对大安全整数抵消精确求和", () => {
    expect(() => Duration.totalMilliseconds({ days: Number.MAX_VALUE })).toThrow(RangeError);
    expect(() => Duration.add({ days: Number.MAX_VALUE }, { days: Number.MAX_VALUE })).toThrow(
      RangeError,
    );
    expect(() =>
      Duration.subtract({ days: Number.MAX_VALUE }, { days: -Number.MAX_VALUE }),
    ).toThrow(RangeError);
    expect(
      Duration.totalMilliseconds({
        days: 104_249_991_374,
        hours: -2_501_999_792_975,
        minutes: -59,
      }),
    ).toBe(60_000);
  });
});
