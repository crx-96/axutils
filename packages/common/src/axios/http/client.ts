import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import { isCancellationError } from "../../internal/http/error-utils.js";
import { SAFE_RETRY_METHODS, assertObject } from "../../internal/http/primitives.js";
import { createCancellationError, raceWithSignal, throwIfAborted, waitForDelay } from "./abort.js";
import {
  getConfigOptions,
  normalizeConfig,
  normalizeMethod,
  normalizeRequestOptions,
  resolveRequest,
  validateRequestInput,
} from "./config.js";
import { PromiseHttpRequestError, isRetryableError, toPromiseHttpRequestError } from "./errors.js";
import { getDedupeKey } from "./request-identity.js";
import type {
  PromiseHttpClientConfig,
  PromiseHttpClientOptions,
  PromiseHttpConfigFactory,
  PromiseHttpRequestConfig,
  PromiseHttpRequestOptions,
  PromiseHttpSuccess,
  ResolvedRequest,
} from "./types.js";

/**
 * 跨浏览器、Node.js 与 Nuxt 的 Axios Promise HTTP 客户端。
 *
 * 使用本类需要安装 `axios`、`safe-stable-stringify` 和 `spark-md5`：
 * `pnpm add axios safe-stable-stringify spark-md5`。本文件不导入 RxJS。
 */
export class PromiseHttpClient {
  private declare readonly axiosInstance: AxiosInstance;
  private declare readonly baseConfig: PromiseHttpClientConfig;
  private declare readonly configFactory: PromiseHttpConfigFactory | undefined;
  private declare readonly configRetryCount: number;
  private declare cachedConfig: PromiseHttpClientConfig | undefined;
  private declare configLoading: Promise<PromiseHttpClientConfig> | undefined;
  private declare readonly inFlight: Map<string, Promise<PromiseHttpSuccess<unknown>>>;

  /** 创建使用同步配置的客户端；构造函数不会执行网络请求或配置工厂。 */
  constructor(options: PromiseHttpClientOptions = {}, configFactory?: PromiseHttpConfigFactory) {
    assertObject(options, "PromiseHttpClientOptions 必须是对象");
    const clientOptions = options as PromiseHttpClientOptions;
    if (clientOptions.axiosInstance === undefined) {
      this.axiosInstance = axios;
    } else {
      if (
        clientOptions.axiosInstance === null ||
        typeof clientOptions.axiosInstance.request !== "function"
      ) {
        throw new TypeError("axiosInstance 必须提供 request 方法");
      }
      this.axiosInstance = clientOptions.axiosInstance;
    }

    this.inFlight = new Map();
    this.baseConfig = normalizeConfig(getConfigOptions(clientOptions));
    this.configRetryCount = this.baseConfig.retryCount;
    this.configFactory = configFactory;
    if (configFactory === undefined) this.cachedConfig = this.baseConfig;
  }

  /** 创建使用异步配置工厂的客户端；工厂在第一次请求时执行，并缓存成功配置。 */
  static create(
    factory: PromiseHttpConfigFactory,
    options: PromiseHttpClientOptions = {},
  ): PromiseHttpClient {
    if (typeof factory !== "function") throw new TypeError("PromiseHttpConfigFactory 必须是函数");
    return new PromiseHttpClient(options, factory);
  }

  /** 发起通用请求；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。 */
  request<T = unknown, D = unknown>(
    config: PromiseHttpRequestConfig<D>,
  ): Promise<PromiseHttpSuccess<T>> {
    assertObject(config, "PromiseHttpRequestConfig 必须是对象");
    if (typeof config.url !== "string") throw new TypeError("请求 url 必须是字符串");
    if (typeof config.method !== "string") throw new TypeError("请求 method 必须是字符串");

    const input: PromiseHttpRequestConfig<D> = {
      ...config,
      method: normalizeMethod(config.method),
    };
    this.validateRequestInput(input);

    if (input.signal?.aborted) {
      return Promise.reject(toPromiseHttpRequestError(createCancellationError()));
    }

    // 配置初始化属于客户端共享状态；signal 只竞速当前调用方的等待，不应进入共享 Promise。
    const operation = this.getConfigPromise().then((clientConfig) => {
      const request = this.resolveRequest(clientConfig, input);
      const key = this.getDedupeKey(request);
      if (key === undefined) return this.executeRequest<T, D>(request);
      return this.getOrCreateInFlight<T, D>(key, request);
    });

    return raceWithSignal(operation, input.signal).catch((error: unknown) => {
      throw error instanceof PromiseHttpRequestError ? error : toPromiseHttpRequestError(error);
    });
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(
    url: string,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "GET", url });
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    const config: PromiseHttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "POST",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 PUT 请求。 */
  put<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T, D>({
      ...normalizeRequestOptions(options),
      method: "PUT",
      url,
      ...(data === undefined ? {} : { data }),
    });
  }

  /** 发起 PATCH 请求。 */
  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T, D>({
      ...normalizeRequestOptions(options),
      method: "PATCH",
      url,
      ...(data === undefined ? {} : { data }),
    });
  }

  /** 发起 DELETE 请求。 */
  delete<T = unknown>(
    url: string,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "DELETE", url });
  }

  private validateRequestInput(input: PromiseHttpRequestConfig): void {
    validateRequestInput(input);
  } /** 获取并缓存异步配置；共享初始化不绑定任何请求 signal，失败不缓存。 */
  private getConfigPromise(): Promise<PromiseHttpClientConfig> {
    if (this.cachedConfig !== undefined) return Promise.resolve(this.cachedConfig);
    if (this.configLoading !== undefined) return this.configLoading;
    if (this.configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
      return Promise.resolve(this.cachedConfig);
    }

    const loading = this.initializeConfig();
    this.configLoading = loading;
    void loading.then(
      (config) => {
        if (this.configLoading === loading) {
          // 配置初始化属于客户端级状态；只要共享初始化成功，就可以缓存供所有请求复用。
          this.cachedConfig = config;
          this.configLoading = undefined;
        }
      },
      () => {
        if (this.configLoading === loading) this.configLoading = undefined;
      },
    );
    return loading;
  }

  private async initializeConfig(): Promise<PromiseHttpClientConfig> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.configRetryCount; attempt += 1) {
      try {
        const partial = await Promise.resolve(this.configFactory?.());
        assertObject(partial, "异步 HTTP 配置必须是对象");
        return normalizeConfig({ ...this.baseConfig, ...partial });
      } catch (error) {
        if (isCancellationError(error)) throw error;
        lastError = error;
        if (attempt < this.configRetryCount) {
          await waitForDelay(this.baseConfig.retryDelay);
        }
      }
    }
    throw toPromiseHttpRequestError(lastError, "config");
  }

  /** 将请求级覆盖项与已解析客户端配置合并，并在网络执行前完成边界校验。 */
  private resolveRequest<D>(
    clientConfig: PromiseHttpClientConfig,
    input: PromiseHttpRequestConfig<D>,
  ): ResolvedRequest<D> {
    return resolveRequest(clientConfig, input);
  } /**
   * 根据请求语义生成 in-flight key。
   *
   * 带 signal 的调用必须独立执行；不稳定请求体默认关闭自动去重，显式 dedupeKey 则由调用方接管身份。
   */
  private getDedupeKey<D>(request: ResolvedRequest<D>): string | undefined {
    return getDedupeKey(request);
  } /** 创建或复用同 key 的 in-flight Promise；成功、失败、取消后都会清理 Map。 */
  private getOrCreateInFlight<T, D>(
    key: string,
    request: ResolvedRequest<D>,
  ): Promise<PromiseHttpSuccess<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Promise<PromiseHttpSuccess<T>>;

    const source = this.executeRequest<T, D>(request);
    let tracked!: Promise<PromiseHttpSuccess<unknown>>;
    tracked = source.then(
      (result) => {
        if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
        return result;
      },
      (error: unknown) => {
        if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
        throw error;
      },
    ) as Promise<PromiseHttpSuccess<unknown>>;
    this.inFlight.set(key, tracked);
    return tracked as Promise<PromiseHttpSuccess<T>>;
  }

  /** 通过显式循环接入 Axios Promise，并按规则进行请求级重试和统一错误转换。 */
  private async executeRequest<T, D>(request: ResolvedRequest<D>): Promise<PromiseHttpSuccess<T>> {
    const axiosConfig: AxiosRequestConfig<D> = {
      method: request.method.toLowerCase(),
      url: request.url,
    };
    if (request.params !== undefined) axiosConfig.params = request.params;
    if (request.headers !== undefined) axiosConfig.headers = request.headers;
    if (request.data !== undefined) axiosConfig.data = request.data;
    if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
    if (request.signal !== undefined) axiosConfig.signal = request.signal;

    const retryAllowed =
      request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);
    for (let attempt = 1; attempt <= request.retryCount; attempt += 1) {
      try {
        throwIfAborted(request.signal);
        const response = await this.axiosInstance.request<T, AxiosResponse<T>, D>(axiosConfig);
        return this.toSuccess(response);
      } catch (error) {
        const canRetry = attempt < request.retryCount && retryAllowed && isRetryableError(error);
        if (!canRetry) throw toPromiseHttpRequestError(error);
        await waitForDelay(request.retryDelay, request.signal);
      }
    }
    throw new Error("HTTP 请求执行流程异常");
  }

  /** 将 Axios 响应映射为只携带 HTTP 状态码的统一成功结果。 */
  private toSuccess<T>(response: AxiosResponse<T>): PromiseHttpSuccess<T> {
    // biome-ignore assist/source/useSortedKeys: 保留公开响应对象的字段枚举顺序。
    return { code: response.status, success: true, data: response.data, error: null };
  }
}
