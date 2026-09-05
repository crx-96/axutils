import axios, {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { deferred } from "./deferred.js";

interface AdapterContext {
  calls: number;
  configs: InternalAxiosRequestConfig[];
}
type AdapterHandler = (
  config: InternalAxiosRequestConfig,
  context: AdapterContext,
) => Promise<AxiosResponse<unknown>> | AxiosResponse<unknown>;

export const response = (
  config: InternalAxiosRequestConfig,
  data: unknown = { ok: true },
  status = 200,
): AxiosResponse<unknown> => ({
  config,
  data,
  headers: {},
  status,
  statusText: status === 200 ? "OK" : "Error",
});

/** 记录真实 Axios 调度，并模拟 adapter 对非 2xx 响应的拒绝行为。 */
export const createAxiosInstance = (handler: AdapterHandler) => {
  const context: AdapterContext = { calls: 0, configs: [] };
  const started = deferred();
  const adapter: AxiosAdapter = async (config) => {
    context.calls += 1;
    context.configs.push(config);
    started.resolve();
    const result = await handler(config, context);
    if (result.status < 200 || result.status >= 300) {
      throw new AxiosError(
        `Request failed with status code ${result.status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        result,
      );
    }
    return result;
  };
  return { context, instance: axios.create({ adapter }), started: started.promise };
};

/** 请求保持待定直到取消或显式完成；complete 用于收尾不主动取消的订阅场景。 */
export const createPendingAxiosInstance = () => {
  let abortCount = 0;
  const completions = new Set<() => void>();
  const pending = createAxiosInstance(
    (config) =>
      new Promise<AxiosResponse<unknown>>((resolve, reject) => {
        const cleanup = () => {
          completions.delete(complete);
          config.signal?.removeEventListener?.("abort", rejectCanceled);
        };
        const complete = () => {
          cleanup();
          resolve(response(config));
        };
        const rejectCanceled = () => {
          abortCount += 1;
          cleanup();
          reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
        };
        completions.add(complete);
        if (config.signal?.aborted) {
          rejectCanceled();
          return;
        }
        config.signal?.addEventListener?.("abort", rejectCanceled, { once: true });
      }),
  );
  return {
    ...pending,
    get abortCount() {
      return abortCount;
    },
    complete: () => {
      for (const complete of [...completions]) complete();
    },
  };
};
