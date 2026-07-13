import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce as debounceFromEntry } from "../../src/index";
import { debounce } from "../../src/object/timing";

afterEach(() => {
  vi.useRealTimers();
});

describe("object/timing - debounce", () => {
  it("从主入口导出同一个方法", () => {
    expect(debounceFromEntry).toBe(debounce);
  });

  it("只在停止调用后执行最后一次，并保留 this 与最新参数", () => {
    vi.useFakeTimers();

    const calls: string[] = [];
    const context = { prefix: "ctx" };
    const handler = debounce(function (this: typeof context, value: string) {
      calls.push(`${this.prefix}:${value}`);
    }, 100);

    handler.call(context, "first");
    vi.advanceTimersByTime(50);
    handler.call(context, "last");

    vi.advanceTimersByTime(99);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(calls).toEqual(["ctx:last"]);
  });

  it("连续调用会重新计算等待时间", () => {
    vi.useFakeTimers();

    const calls: number[] = [];
    const handler = debounce((value: number) => calls.push(value), 100);

    handler(1);
    vi.advanceTimersByTime(90);
    handler(2);
    vi.advanceTimersByTime(90);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(10);
    expect(calls).toEqual([2]);
  });

  it("cancel 会清除待执行的调用", () => {
    vi.useFakeTimers();

    const callback = vi.fn();
    const handler = debounce(callback, 100);
    handler();
    handler.cancel();
    vi.advanceTimersByTime(100);

    expect(callback).not.toHaveBeenCalled();
  });

  it("wait 为 0 时在下一次定时器调度中执行", () => {
    vi.useFakeTimers();

    const callback = vi.fn();
    const handler = debounce(callback, 0);

    handler();
    expect(callback).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each([
    ["NaN", Number.NaN],
    ["正无穷", Number.POSITIVE_INFINITY],
    ["负无穷", Number.NEGATIVE_INFINITY],
  ])("拒绝非有限 wait：%s", (_label, wait) => {
    expect(() => debounce(vi.fn(), wait)).toThrow(TypeError);
  });

  it("拒绝超出平台定时器上限的 wait", () => {
    expect(() => debounce(vi.fn(), 2_147_483_648)).toThrow(RangeError);
  });

  it("拒绝负数 wait 和非函数回调", () => {
    expect(() => debounce(vi.fn(), -1)).toThrow(RangeError);
    expect(() => debounce(null as never, 0)).toThrow(TypeError);
  });
});
