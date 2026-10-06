/**
 * 防抖包装函数。
 *
 * 每次调用都会取消前一个定时器，只在连续调用停止 `wait` 毫秒后执行最后一次调用。
 * 包装器保留调用时的 `this` 和参数；`cancel` 会清理尚未执行的调用。
 */
export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  /** 保存本次上下文和参数，在停止调用 wait 毫秒后执行；调用本身不返回结果。 */
  (this: ThisParameterType<T>, ...args: Parameters<T>): void;
  /** 取消尚未执行的调用并释放保存的参数和上下文。 */
  cancel(): void;
}

/**
 * 节流包装函数。
 *
 * 第一次调用立即执行；等待期间的调用只保留最后一次，并在周期结束时补执行一次。
 * `cancel` 会清理 trailing 调用，并让下一次调用重新立即执行。
 */
export interface ThrottledFunction<T extends (...args: never[]) => unknown> {
  /** 首次立即执行，其余调用保留到 trailing；只有同步执行时返回回调结果。 */
  (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | undefined;
  /** 取消 trailing 调用并重置周期，使下一次调用可以立即执行。 */
  cancel(): void;
}

/** 当前运行时返回的定时器句柄，由包装器持有并负责清理。 */
type Timer = ReturnType<typeof setTimeout>;
/** 浏览器与 Node 定时器支持的最大延迟，单位为毫秒。 */
const MAX_TIMER_DELAY = 2_147_483_647;

/** 读取毫秒时钟；performance.now 可调用时优先使用，否则回退到 Date.now。 */
const readActionTime = (): number => {
  // 按方法能力探测，兼容只提供部分 performance API 的宿主或 polyfill。
  if (typeof performance !== "undefined" && typeof performance?.now === "function") {
    return performance.now();
  }
  // 保留墙上时钟作为降级来源；可用时钟自身的异常仍由调用方处理。
  return Date.now();
};

/**
 * 创建同步操作间隔守卫；仅返回是否放行，不执行操作，也不安排延迟补执行。
 *
 * @param interval 两次成功放行之间的最短毫秒数，必须为非负有限数字；0 允许同一时刻重复放行。
 * 不使用定时器，因此不受定时器的 32 位延迟上限限制。
 * @param now 毫秒时钟，默认优先使用 performance.now，方法不可用时使用 Date.now；可注入可控时钟。
 * 返回值必须为有限数字，建议单调递增；若时间倒退，保持原成功时间，直到间隔再次满足。
 * @returns 独立守卫：disabled 默认为 false；首次未禁用的尝试直接放行，禁用或间隔内返回 false。
 * 禁用尝试不读取时钟，拒绝的尝试不更新成功时间；各实例不共享状态。
 * @throws {TypeError} 创建时 interval 非有限数字或 now 非函数；调用时 disabled 非布尔值或时钟返回非有限数字。
 * @throws {RangeError} 创建时 interval 为负数。时钟自身抛出的异常原样传播，且不更新时间。
 */
export const createActionGate = (
  interval: number,
  now: () => number = readActionTime,
): ((disabled?: boolean) => boolean) => {
  // 在创建阶段拒绝无效配置，不等到第一次操作才暴露参数错误。
  if (!Number.isFinite(interval)) throw new TypeError("interval 必须是有限数字");
  if (interval < 0) throw new RangeError("interval 不能为负数");
  if (typeof now !== "function") throw new TypeError("now 必须是函数");

  /** 上一次成功放行的毫秒时间；undefined 表示尚未放行，避免依赖时钟的起点。 */
  let lastActionAt: number | undefined;

  /** 同步判断本次尝试；仅成功时记录当前时间，不保存待执行任务。 */
  return (disabled = false): boolean => {
    // 禁用优先于计时，避免禁用尝试消耗时钟或改变下次可执行时刻。
    if (typeof disabled !== "boolean") throw new TypeError("disabled 必须是布尔值");
    if (disabled) return false;

    /** 本次尝试的毫秒时间；校验通过前不能用于更新状态。 */
    const currentTime = now();
    if (!Number.isFinite(currentTime)) throw new TypeError("now 必须返回有限数字");
    if (lastActionAt !== undefined && currentTime - lastActionAt < interval) return false;

    // 成功放行才开始新的间隔；被拒绝的操作不会延长等待，也不会被补执行。
    lastActionAt = currentTime;
    return true;
  };
};

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
  // 创建包装器之前统一检查回调与平台延迟范围。
  validateTimingArguments(fn, wait);

  /** 当前待执行的 trailing 定时器；undefined 表示没有排程。 */
  let timer: Timer | undefined;
  /** 等待期间最后一次调用的参数；执行或取消后释放。 */
  let lastArgs: Parameters<T> | undefined;
  /** 与最后一次参数配对的调用上下文。 */
  let lastThis: ThisParameterType<T> | undefined;

  /** 清除排程和保留的调用数据，避免取消后执行或持续引用调用方对象。 */
  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = undefined;
    lastArgs = undefined;
    lastThis = undefined;
  };

  /** 每次调用重新计算静默等待期，只执行最新一次调用。 */
  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    // 已有排程被新调用替代，因此先取消旧定时器。
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    lastArgs = args;
    lastThis = this;
    // 替换为完整的等待期，到期时使用本轮保存的数据执行。
    timer = setTimeout(() => {
      // 执行用户回调前释放当前排程状态，使回调内重入可以独立安排下一次调用。
      timer = undefined;
      /** 本轮静默期结束时待执行的参数快照。 */
      const callArgs = lastArgs;
      /** 与本轮参数配对的调用上下文。 */
      const callThis = lastThis;
      lastArgs = undefined;
      lastThis = undefined;

      if (callArgs !== undefined) {
        Reflect.apply(fn, callThis, callArgs);
      }
    }, wait);
  } as DebouncedFunction<T>;

  // 为包装器挂载显式清理入口；断言对应的 cancel 属性在返回之前补齐。
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
  // 创建包装器之前统一检查回调与平台延迟范围。
  validateTimingArguments(fn, wait);

  /** 当前 trailing 定时器；undefined 表示没有排队任务。 */
  let timer: Timer | undefined;
  /** 是否已经执行过 leading，用于保证第一次调用立即执行。 */
  let hasInvoked = false;
  /** 上一次实际执行回调的时间，单位为毫秒。 */
  let lastInvokeTime = 0;
  /** 等待期间最新一次调用的参数；undefined 表示没有待执行调用。 */
  let lastArgs: Parameters<T> | undefined;
  /** 与待执行参数配对的调用上下文。 */
  let lastThis: ThisParameterType<T> | undefined;
  /** 定时器触发后的处理函数，在包装器返回之前完成初始化。 */
  let runTrailing: () => void;

  /** 记录本轮执行时间并使用原上下文执行回调，返回同步结果。 */
  const invoke = (
    thisArg: ThisParameterType<T> | undefined,
    args: Parameters<T>,
  ): ReturnType<T> => {
    // 先更新状态再调用用户函数，保证用户函数重入调用 throttle 时仍处于当前节流周期。
    hasInvoked = true;
    lastInvokeTime = Date.now();
    return Reflect.apply(fn, thisArg, args) as ReturnType<T>;
  };

  /** 在剩余毫秒数后执行 trailing，由 cancel 或定时器触发路径负责清理句柄。 */
  const scheduleTrailing = (delay: number): void => {
    timer = setTimeout(runTrailing, delay);
  };

  /** 执行本轮等待中的调用，并保留用户回调重入产生的下一轮排程。 */
  runTrailing = (): void => {
    // 定时器已触发，先取消排队标记；没有等待中的参数时无需调用用户函数。
    timer = undefined;
    if (lastArgs === undefined) {
      return;
    }

    // 提取并清空本轮数据，避免用户回调的重入调用被本轮清理覆盖。
    /** 本轮待执行的参数快照。 */
    const callArgs = lastArgs;
    /** 与本轮参数配对的调用上下文。 */
    const callThis = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    invoke(callThis, callArgs);

    // 用户回调可能重入并产生下一次待执行调用；此时继续从新的周期排程，避免丢失调用。
    if (lastArgs !== undefined && timer === undefined) {
      scheduleTrailing(Math.max(wait - (Date.now() - lastInvokeTime), 0));
    }
  };

  /** 清除 trailing 排程及保存的调用信息，同时恢复首次立即执行的状态。 */
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

  /** 同步执行可放行的 leading，否则合并到唯一的 trailing 排程。 */
  const throttled = function (
    this: ThisParameterType<T>,
    ...args: Parameters<T>
  ): ReturnType<T> | undefined {
    /** 本次调用的毫秒时间。 */
    const now = Date.now();
    /** 距上次真正执行回调的毫秒数。 */
    const elapsed = now - lastInvokeTime;

    // 如果 trailing timer 仍在排队，说明上一周期尚未完成；边界调用只更新待执行参数，
    // 不能清除 timer 后同步执行，否则 timer 注册顺序会导致 pending 调用被意外跳过。
    /** 仅首次或间隔已满足且没有 trailing 排队时，允许同步执行。 */
    const shouldInvokeLeading = !hasInvoked || (elapsed >= wait && timer === undefined);
    if (shouldInvokeLeading) {
      // 清空旧排程与参数后执行本次调用，后续重入数据由 invoke 之后的检查处理。
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      lastArgs = undefined;
      lastThis = undefined;
      /** 本次同步回调的返回值，待重入排程处理完成后返回调用方。 */
      const result = invoke(this, args);

      // 处理 leading 回调内部重入的情况；普通调用不会进入此分支。
      if (lastArgs !== undefined && timer === undefined) {
        scheduleTrailing(Math.max(wait - (Date.now() - lastInvokeTime), 0));
      }
      return result;
    }

    // 等待期间只保留最新数据，并且最多安排一个 trailing 定时器。
    lastArgs = args;
    lastThis = this;
    if (timer === undefined) {
      scheduleTrailing(Math.max(wait - elapsed, 0));
    }
    return undefined;
  } as ThrottledFunction<T>;

  // 断言对应的 cancel 方法在返回前挂载，调用方可以显式释放排程。
  throttled.cancel = cancel;
  return throttled;
};
