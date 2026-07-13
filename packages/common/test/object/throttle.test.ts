import { afterEach, describe, expect, it, vi } from "vitest";
import { throttle as throttleFromEntry } from "../../src/index";
import { throttle } from "../../src/object/timing";

afterEach(() => {
  vi.useRealTimers();
});

describe("object/timing - throttle", () => {
  it("从主入口导出同一个方法", () => {
    expect(throttleFromEntry).toBe(throttle);
  });

  it("首次调用立即执行并返回结果，周期内只保留最后一次 trailing 调用", () => {
    vi.useFakeTimers();

    const calls: string[] = [];
    const firstContext = { prefix: "first" };
    const lastContext = { prefix: "last" };
    const handler = throttle(function (this: typeof firstContext, value: string) {
      calls.push(`${this.prefix}:${value}`);
      return value.length;
    }, 100);

    expect(handler.call(firstContext, "one")).toBe(3);
    expect(handler.call(lastContext, "latest")).toBeUndefined();
    vi.advanceTimersByTime(99);
    expect(calls).toEqual(["first:one"]);

    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["first:one", "last:latest"]);
  });

  it("周期边界已有 trailing 定时器时，新调用并入 trailing 调度", () => {
    vi.useFakeTimers();

    const calls: string[] = [];
    const handler = throttle((value: string) => {
      calls.push(value);
      return value;
    }, 100);

    expect(handler("first")).toBe("first");
    setTimeout(() => {
      expect(handler("boundary")).toBeUndefined();
    }, 100);
    handler("queued");

    vi.advanceTimersByTime(100);

    expect(calls).toEqual(["first", "boundary"]);
  });

  it("只有一次调用时不会额外触发 trailing", () => {
    vi.useFakeTimers();

    const callback = vi.fn(() => "result");
    const handler = throttle(callback, 100);

    expect(handler()).toBe("result");
    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledOnce();
  });

  it("cancel 会取消 trailing，并让下一次调用重新立即执行", () => {
    vi.useFakeTimers();

    const callback = vi.fn((value: number) => value);
    const handler = throttle(callback, 100);

    expect(handler(1)).toBe(1);
    expect(handler(2)).toBeUndefined();
    handler.cancel();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    expect(handler(3)).toBe(3);
    expect(callback).toHaveBeenLastCalledWith(3);
  });

  it("wait 为 0 时允许每次调用立即执行", () => {
    const callback = vi.fn((value: number) => value);
    const handler = throttle(callback, 0);

    expect(handler(1)).toBe(1);
    expect(handler(2)).toBe(2);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["NaN", Number.NaN],
    ["正无穷", Number.POSITIVE_INFINITY],
    ["负无穷", Number.NEGATIVE_INFINITY],
  ])("拒绝非有限 wait：%s", (_label, wait) => {
    expect(() => throttle(vi.fn(), wait)).toThrow(TypeError);
  });

  it("拒绝超出平台定时器上限的 wait", () => {
    expect(() => throttle(vi.fn(), 2_147_483_648)).toThrow(RangeError);
  });

  it("拒绝负数 wait 和非函数回调", () => {
    expect(() => throttle(vi.fn(), -1)).toThrow(RangeError);
    expect(() => throttle(null as never, 0)).toThrow(TypeError);
  });
});
