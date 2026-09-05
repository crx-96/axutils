import { AxiosError, type AxiosRequestConfig } from "axios";
import { Observable } from "rxjs";

interface AbortControllerLike {
  signal: NonNullable<AxiosRequestConfig["signal"]>;
  abort(): void;
}

interface AbortLifecycle {
  signal: AxiosRequestConfig["signal"];
  abort(): void;
  cleanup(): void;
}

type AbortControllerConstructor = new () => AbortControllerLike;

/**
 * 通过 globalThis 读取 AbortController，避免在不提供该全局对象的旧运行时中模块加载失败。
 * 目标运行时通常都支持它；如果运行时没有实现，则保留原有 signal 行为，但无法提供自动取消。
 */
const getAbortController = (): AbortControllerLike | undefined => {
  const AbortControllerClass = (
    globalThis as unknown as {
      AbortController?: AbortControllerConstructor;
    }
  ).AbortController;
  return AbortControllerClass === undefined ? undefined : new AbortControllerClass();
};

/**
 * 为一次 Axios 请求创建取消生命周期。
 * 当启用自动取消时，内部 controller 负责“最后一个订阅者离开”的取消；用户传入的 signal
 * 会通过事件转发到同一个 controller，从而同时支持显式 abort 和 RxJS 订阅取消。
 */
export const createAbortLifecycle = (
  sourceSignal: AxiosRequestConfig["signal"],
  enabled: boolean,
): AbortLifecycle => {
  if (!enabled) {
    return {
      abort: () => undefined,
      cleanup: () => undefined,
      signal: sourceSignal,
    };
  }

  const controller = getAbortController();
  if (controller === undefined) {
    return {
      abort: () => undefined,
      cleanup: () => undefined,
      signal: sourceSignal,
    };
  }

  if (sourceSignal === undefined) {
    return {
      abort: () => controller.abort(),
      cleanup: () => undefined,
      signal: controller.signal,
    };
  }

  if (sourceSignal.aborted) {
    controller.abort();
    return {
      abort: () => controller.abort(),
      cleanup: () => undefined,
      signal: controller.signal,
    };
  }

  if (typeof sourceSignal.addEventListener !== "function") {
    // Axios 的标准 AbortSignal 都支持 addEventListener；不完整的自定义 signal 无法安全合并。
    return {
      abort: () => undefined,
      cleanup: () => undefined,
      signal: sourceSignal,
    };
  }

  const onAbort = () => controller.abort();
  sourceSignal.addEventListener("abort", onAbort);
  return {
    abort: () => controller.abort(),
    cleanup: () => sourceSignal.removeEventListener?.("abort", onAbort),
    signal: controller.signal,
  };
};

/**
 * 将调用方的 AbortSignal 连接到请求的完整 RxJS 生命周期。
 * Axios 只能中止已经发出的网络请求；这里额外监听 signal，使异步配置和 retryDelay 等等待阶段也能立即终止。
 */
export const createCallerAbort$ = (
  sourceSignal: AxiosRequestConfig["signal"],
): Observable<never> | undefined => {
  if (sourceSignal === undefined) return undefined;

  const createCancellationError = () => new AxiosError("canceled", AxiosError.ERR_CANCELED);
  return new Observable<never>((subscriber) => {
    // Observable 可能在 signal 创建后才订阅；必须在订阅时再次检查，避免错过已经发生的 abort 事件。
    if (sourceSignal.aborted) {
      subscriber.error(createCancellationError());
      return;
    }
    if (typeof sourceSignal.addEventListener !== "function") return;

    const onAbort = () => subscriber.error(createCancellationError());
    sourceSignal.addEventListener("abort", onAbort);
    // 处理注册监听器与 signal 同步变更之间的窄窗口。
    if (sourceSignal.aborted) onAbort();
    return () => sourceSignal.removeEventListener?.("abort", onAbort);
  });
};
