import { afterEach, describe, expect, it, vi } from "vitest";
import { createActionGate as fromEntry } from "../../src/index.js";
import { createActionGate } from "../../src/object/timing.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("object/timing - createActionGate", () => {
  it("根入口与功能入口保持同一函数", () => {
    expect(fromEntry).toBe(createActionGate);
  });

  it("首次立即放行，间隔内拒绝且不延长周期，恰好到边界再次放行", () => {
    let time = 0;
    const gate = createActionGate(100, () => time);
    expect(gate()).toBe(true);
    expect(gate()).toBe(false);
    time = 99;
    expect(gate()).toBe(false);
    time = 100;
    expect(gate()).toBe(true);
    time = 199;
    expect(gate()).toBe(false);
    time = 200;
    expect(gate()).toBe(true);
  });

  it("禁用不读取时钟、不消耗首次放行，也不更新时间", () => {
    const now = vi.fn(() => 0);
    const gate = createActionGate(100, now);
    expect(now).not.toHaveBeenCalled();
    expect(gate(true)).toBe(false);
    expect(now).not.toHaveBeenCalled();
    expect(gate(false)).toBe(true);
    now.mockReturnValue(100);
    expect(gate(true)).toBe(false);
    expect(now).toHaveBeenCalledTimes(1);
    expect(gate()).toBe(true);
  });

  it("不安排定时器，时间推进不会补执行操作", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const gate = createActionGate(100, Date.now);
    if (gate()) action();
    if (gate()) action();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1_000);
    expect(action).toHaveBeenCalledTimes(1);
    if (gate()) action();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("0 允许同一时刻重复放行，禁用仍拒绝", () => {
    const gate = createActionGate(0, () => 42);
    expect(gate()).toBe(true);
    expect(gate()).toBe(true);
    expect(gate(true)).toBe(false);
  });

  it("接受小数间隔、负数时钟起点及超过定时器上限的间隔", () => {
    let time = -10;
    const gate = createActionGate(0.5, () => time);
    expect(gate()).toBe(true);
    time = -9.75;
    expect(gate()).toBe(false);
    time = -9.5;
    expect(gate()).toBe(true);
    const longGate = createActionGate(2_147_483_648, () => time);
    expect(longGate()).toBe(true);
    time += 2_147_483_648;
    expect(longGate()).toBe(true);
  });

  it("不同实例独立，时钟倒退不会重置最后成功时间", () => {
    let time = 100;
    const first = createActionGate(10, () => time);
    const second = createActionGate(10, () => time);
    expect(first()).toBe(true);
    expect(second()).toBe(true);
    time = 50;
    expect(first()).toBe(false);
    time = 109;
    expect(first()).toBe(false);
    time = 110;
    expect(first()).toBe(true);
  });

  it("默认时钟优先使用 performance.now", () => {
    const now = vi.fn(() => 10);
    vi.stubGlobal("performance", { now });
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("不应读取墙上时钟");
    });
    const gate = createActionGate(5);
    expect(gate()).toBe(true);
    now.mockReturnValue(15);
    expect(gate()).toBe(true);
  });

  it.each([
    undefined,
    null,
    {},
    { now: undefined },
    { now: 0 },
  ])("performance.now 不可用时回退 Date.now：%j", (performance) => {
    vi.stubGlobal("performance", performance);
    const now = vi.spyOn(Date, "now").mockReturnValue(10);
    const gate = createActionGate(5);
    expect(gate()).toBe(true);
    now.mockReturnValue(14);
    expect(gate()).toBe(false);
    now.mockReturnValue(15);
    expect(gate()).toBe(true);
  });

  it("可用的 performance.now 自身抛错时原样传播且不占用首次放行", () => {
    const failure = new Error("性能时钟故障");
    const now = vi
      .fn<() => number>()
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockReturnValue(0);
    vi.stubGlobal("performance", { now });
    const fallback = vi.spyOn(Date, "now");
    const gate = createActionGate(10);
    expect(() => gate()).toThrow(failure);
    expect(fallback).not.toHaveBeenCalled();
    expect(gate()).toBe(true);
    expect(gate()).toBe(false);
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
    "100",
    null,
    undefined,
  ])("创建时拒绝非法间隔 %s", (interval) => {
    expect(() => Reflect.apply(createActionGate, undefined, [interval])).toThrow(TypeError);
  });

  it("拒绝负间隔、非函数时钟及非布尔禁用值", () => {
    expect(() => createActionGate(-1)).toThrow(RangeError);
    expect(() => Reflect.apply(createActionGate, undefined, [10, null])).toThrow(TypeError);
    expect(() => Reflect.apply(createActionGate(10), undefined, ["false"])).toThrow(TypeError);
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
    "10",
    null,
    undefined,
  ])("非法时钟结果 %s 不改变守卫状态", (value) => {
    const now = vi.fn(() => value);
    const gate = Reflect.apply(createActionGate, undefined, [100, now]);
    expect(() => gate()).toThrow(TypeError);
    now.mockReturnValue(0);
    expect(gate()).toBe(true);
    now.mockReturnValue(value);
    expect(() => gate()).toThrow(TypeError);
    now.mockReturnValue(99);
    expect(gate()).toBe(false);
    now.mockReturnValue(100);
    expect(gate()).toBe(true);
  });

  it("时钟自身异常原样传播且不会占用首次放行", () => {
    const failure = new Error("时钟故障");
    const now = vi
      .fn<() => number>()
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockReturnValue(0);
    const gate = createActionGate(10, now);
    expect(() => gate()).toThrow(failure);
    expect(gate()).toBe(true);
  });
});
