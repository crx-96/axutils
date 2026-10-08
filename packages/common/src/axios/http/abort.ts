import { AxiosError, type AxiosRequestConfig } from "axios";

/** 创建与 Axios 原生取消一致的错误，供网络之外的等待阶段使用。 */
export const createCancellationError = (): AxiosError =>
  new AxiosError("canceled", AxiosError.ERR_CANCELED);

/** 在下一次网络尝试或无延迟重试前检查调用方是否已经取消。 */
export const throwIfAborted = (signal: AxiosRequestConfig["signal"]): void => {
  if (signal?.aborted) throw createCancellationError();
};

/** 等待重试延迟并监听 signal，保证 delay 阶段不会吞掉调用方取消。 */
export const waitForDelay = (
  delay: number,
  signal?: AxiosRequestConfig["signal"],
): Promise<void> => {
  // 无延迟时不建立定时器，但仍应立即阻止已取消请求继续重试。
  if (delay === 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    // 超时结束和显式取消共用清理逻辑，避免监听器残留到后续请求。
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    /** 中止本次延迟，并使用统一取消错误拒绝等待。 */
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      cleanup();
      reject(createCancellationError());
    };
    /** 释放本次延迟注册的取消监听器。 */
    const cleanup = () => signal?.removeEventListener?.("abort", onAbort);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
    // 处理注册监听器与 signal 同步变化之间的窄窗口。
    if (signal?.aborted) onAbort();
  });
};

/**
 * 将普通 Promise 与调用方 signal 竞速。
 * 配置工厂本身无法被强制中止，但当前调用可以在 signal abort 后立即结束，避免等待不可取消的工厂。
 */
export const raceWithSignal = <T>(
  promise: Promise<T>,
  signal: AxiosRequestConfig["signal"],
): Promise<T> => {
  if (signal === undefined) return promise;

  // 即使工厂同步取消了 signal，也必须让 race 消费原 Promise 的最终拒绝，防止未处理异常。
  let cleanup = () => undefined;
  const cancellation = new Promise<never>((_, reject) => {
    /** 结束当前调用方的等待，不取消客户端共享配置初始化。 */
    const onAbort = () => {
      cleanup();
      reject(createCancellationError());
    };
    cleanup = () => signal.removeEventListener?.("abort", onAbort);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener?.("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([promise, cancellation]).finally(cleanup);
};
