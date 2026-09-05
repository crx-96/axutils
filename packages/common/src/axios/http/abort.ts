import { AxiosError, type AxiosRequestConfig } from "axios";

export const createCancellationError = (): AxiosError =>
  new AxiosError("canceled", AxiosError.ERR_CANCELED);

export const throwIfAborted = (signal: AxiosRequestConfig["signal"]): void => {
  if (signal?.aborted) throw createCancellationError();
};

/** 等待重试延迟并监听 signal，保证 delay 阶段不会吞掉调用方取消。 */
export const waitForDelay = (
  delay: number,
  signal?: AxiosRequestConfig["signal"],
): Promise<void> => {
  if (delay === 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      cleanup();
      reject(createCancellationError());
    };
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
  if (signal.aborted) return Promise.reject(createCancellationError());

  let cleanup = () => undefined;
  const cancellation = new Promise<never>((_, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createCancellationError());
    };
    cleanup = () => signal.removeEventListener?.("abort", onAbort);
    signal.addEventListener?.("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([promise, cancellation]).finally(cleanup);
};
