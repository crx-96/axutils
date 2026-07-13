/**
 * 防抖包装函数。
 *
 * 每次调用都会取消前一个定时器，只在连续调用停止 `wait` 毫秒后执行最后一次调用。
 * 包装器保留调用时的 `this` 和参数；`cancel` 会清理尚未执行的调用。
 */
export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (this: ThisParameterType<T>, ...args: Parameters<T>): void;
  cancel(): void;
}

/**
 * 节流包装函数。
 *
 * 第一次调用立即执行；等待期间的调用只保留最后一次，并在周期结束时补执行一次。
 * `cancel` 会清理 trailing 调用，并让下一次调用重新立即执行。
 */
export interface ThrottledFunction<T extends (...args: never[]) => unknown> {
  (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | undefined;
  cancel(): void;
}

type Timer = ReturnType<typeof setTimeout>;
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * 校验计时工具的回调和等待时间。
 *
 * 这里拒绝非有限值和负数，避免把 NaN、Infinity 或负延迟交给不同运行时后产生不一致的
 * 定时器行为；0 仍然是合法值，表示尽快调度。
 */
const validateTimingArguments = (fn: unknown, wait: number): void => {
  if (typeof fn !== "function") {
    throw new TypeError("fn 必须是函数");
  }
  if (!Number.isFinite(wait)) {
    throw new TypeError("wait 必须是有限数字");
  }
  if (wait < 0) {
    throw new RangeError("wait 不能为负数");
  }
  // 浏览器和 Node.js 的定时器延迟使用 32 位有符号整数；超出上限可能溢出为极短延迟。
  if (wait > MAX_TIMER_DELAY) {
    throw new RangeError(`wait 不能超过 ${MAX_TIMER_DELAY} 毫秒`);
  }
};

/**
 * 创建 trailing 防抖函数。
 *
 * 这是轻量防抖实现，不提供 leading、flush 或 maxWait 配置；它只负责合并短时间内的
 * 连续调用，适合输入事件、窗口调整等只关心最终状态的场景。
 */
export const debounce = <T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
): DebouncedFunction<T> => {
  validateTimingArguments(fn, wait);

  let timer: Timer | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: ThisParameterType<T> | undefined;

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = undefined;
    lastArgs = undefined;
    lastThis = undefined;
  };

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    lastArgs = args;
    lastThis = this;
    timer = setTimeout(() => {
      timer = undefined;
      const callArgs = lastArgs;
      const callThis = lastThis;
      lastArgs = undefined;
      lastThis = undefined;

      if (callArgs !== undefined) {
        Reflect.apply(fn, callThis, callArgs);
      }
    }, wait);
  } as DebouncedFunction<T>;

  debounced.cancel = cancel;
  return debounced;
};

/**
 * 创建 leading + trailing 节流函数。
 *
 * 节流调用只返回同步执行的那一次回调结果；被延迟到 trailing 阶段的调用返回 undefined，
 * 避免把异步定时器中的结果伪装成当前调用的同步返回值。
 */
export const throttle = <T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
): ThrottledFunction<T> => {
  validateTimingArguments(fn, wait);

  let timer: Timer | undefined;
  let hasInvoked = false;
  let lastInvokeTime = 0;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: ThisParameterType<T> | undefined;
  let runTrailing: () => void;

  const invoke = (
    thisArg: ThisParameterType<T> | undefined,
    args: Parameters<T>,
  ): ReturnType<T> => {
    // 先更新状态再调用用户函数，保证用户函数重入调用 throttle 时仍处于当前节流周期。
    hasInvoked = true;
    lastInvokeTime = Date.now();
    return Reflect.apply(fn, thisArg, args) as ReturnType<T>;
  };

  const scheduleTrailing = (delay: number): void => {
    timer = setTimeout(runTrailing, delay);
  };

  runTrailing = (): void => {
    timer = undefined;
    if (lastArgs === undefined) {
      return;
    }

    const callArgs = lastArgs;
    const callThis = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    invoke(callThis, callArgs);

    // 用户回调可能重入并产生下一次待执行调用；此时继续从新的周期排程，避免丢失调用。
    if (lastArgs !== undefined && timer === undefined) {
      scheduleTrailing(Math.max(wait - (Date.now() - lastInvokeTime), 0));
    }
  };

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = undefined;
    hasInvoked = false;
    lastInvokeTime = 0;
    lastArgs = undefined;
    lastThis = undefined;
  };

  const throttled = function (
    this: ThisParameterType<T>,
    ...args: Parameters<T>
  ): ReturnType<T> | undefined {
    const now = Date.now();
    const elapsed = now - lastInvokeTime;

    // 如果 trailing timer 仍在排队，说明上一周期尚未完成；边界调用只更新待执行参数，
    // 不能清除 timer 后同步执行，否则 timer 注册顺序会导致 pending 调用被意外跳过。
    const shouldInvokeLeading = !hasInvoked || (elapsed >= wait && timer === undefined);
    if (shouldInvokeLeading) {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      lastArgs = undefined;
      lastThis = undefined;
      const result = invoke(this, args);

      // 处理 leading 回调内部重入的情况；普通调用不会进入此分支。
      if (lastArgs !== undefined && timer === undefined) {
        scheduleTrailing(Math.max(wait - (Date.now() - lastInvokeTime), 0));
      }
      return result;
    }

    lastArgs = args;
    lastThis = this;
    if (timer === undefined) {
      scheduleTrailing(Math.max(wait - elapsed, 0));
    }
    return undefined;
  } as ThrottledFunction<T>;

  throttled.cancel = cancel;
  return throttled;
};
