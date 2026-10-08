import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type RawAxiosRequestHeaders,
} from "axios";
import { isCancellationError } from "../../internal/http/error-utils.js";
import { createAttemptHeaders, resolveRequestHeaders } from "../../internal/http/headers.js";
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
  PromiseHttpResponseResult,
  PromiseHttpSuccess,
  ResolvedRequest,
} from "./types.js";

/**
 * 跨浏览器、Node.js 与 Nuxt 的 Axios Promise HTTP 客户端。
 *
 * 使用本类需要安装 `axios`、`safe-stable-stringify` 和 `spark-md5`：
 * `pnpm add axios safe-stable-stringify spark-md5`。本文件不导入 RxJS。
 */
export class PromiseHttpClient<O extends PromiseHttpClientOptions | undefined = object> {
  /** 所有网络尝试使用的 Axios 传输实例。 */
  private declare readonly axiosInstance: AxiosInstance;
  /** 构造阶段完成校验的同步配置。 */
  private declare readonly baseConfig: PromiseHttpClientConfig;
  /** 首次请求时启动的可选配置工厂。 */
  private declare readonly configFactory: PromiseHttpConfigFactory | undefined;
  /** 配置初始化的总尝试次数，固定采用同步选项的值。 */
  private declare readonly configRetryCount: number;
  /** 配置首次成功后缓存的结果；失败不缓存。 */
  private declare cachedConfig: PromiseHttpClientConfig | undefined;
  /** 所有首请求共享的初始化 Promise，不绑定单个调用方的取消信号。 */
  private declare configLoading: Promise<PromiseHttpClientConfig> | undefined;
  /** 按最终传输身份共享的进行中请求，完成或失败后清除。 */
  private declare readonly inFlight: Map<string, Promise<PromiseHttpSuccess<unknown>>>;
  /** 每个调用方在解析配置后独立执行的请求头转换。 */
  private declare readonly transformHeaders: PromiseHttpClientOptions["transformHeaders"];
  /** 网络重试和共享传输之外的成功结果转换。 */
  private declare readonly transformResponse: PromiseHttpClientOptions["transformResponse"];

  /** 创建使用同步配置的客户端；构造函数不会执行网络请求或配置工厂。 */
  // 延迟上下文交叉类型，防止宽泛 options 被推导成 {} 而丢失可能存在的处理函数。
  constructor(
    options: O & (O extends unknown ? PromiseHttpClientOptions | undefined : never),
    configFactory?: PromiseHttpConfigFactory,
  );
  constructor(
    ...args: object extends O
      ? [options?: undefined, configFactory?: PromiseHttpConfigFactory]
      : undefined extends O
        ? [options?: undefined, configFactory?: PromiseHttpConfigFactory]
        : [options: never]
  );
  constructor(options: PromiseHttpClientOptions = {}, configFactory?: PromiseHttpConfigFactory) {
    // 构造时只校验并保存传输、配置和回调，不触发业务工厂或网络请求。
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

    // 回调的形状在构造期校验，业务执行错误则留在相应请求的错误通道。
    for (const name of ["transformHeaders", "transformResponse"] as const) {
      if (clientOptions[name] !== undefined && typeof clientOptions[name] !== "function") {
        throw new TypeError(`${name} 必须是函数`);
      }
    }
    this.transformHeaders = clientOptions.transformHeaders;
    this.transformResponse = clientOptions.transformResponse;
    // 仅无工厂时立即缓存同步配置，其余初始化由第一次请求惰性启动。
    this.inFlight = new Map();
    this.baseConfig = normalizeConfig(getConfigOptions(clientOptions));
    this.configRetryCount = this.baseConfig.retryCount;
    this.configFactory = configFactory;
    if (configFactory === undefined) this.cachedConfig = this.baseConfig;
  }

  /** 创建使用异步配置工厂的客户端；工厂在第一次请求时执行，并缓存成功配置。 */
  static create<O extends PromiseHttpClientOptions | undefined>(
    factory: PromiseHttpConfigFactory,
    options: O & (O extends unknown ? PromiseHttpClientOptions | undefined : never),
  ): PromiseHttpClient<O>;
  static create(factory: PromiseHttpConfigFactory, options?: undefined): PromiseHttpClient;
  static create(
    factory: PromiseHttpConfigFactory,
    options: PromiseHttpClientOptions = {},
  ): PromiseHttpClient<PromiseHttpClientOptions> {
    // 拒绝非法工厂但不执行它，保持与直接构造的初始化时机一致。
    if (typeof factory !== "function") throw new TypeError("PromiseHttpConfigFactory 必须是函数");
    return new PromiseHttpClient(options, factory);
  }

  /**
   * 发起通用请求；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。
   * 输入校验在返回 Promise 前同步抛出 TypeError/RangeError；异步配置与请求失败通过 Promise 拒绝。
   * T 只声明预期响应类型，不对响应数据做运行时结构校验。
   */
  request<T = unknown, D = unknown>(
    config: PromiseHttpRequestConfig<D>,
  ): Promise<PromiseHttpResponseResult<T, O>> {
    // 只快照请求配置顶层；保留既有同步校验与调用方嵌套值的引用语义。
    assertObject(config, "PromiseHttpRequestConfig 必须是对象");
    if (typeof config.url !== "string") throw new TypeError("请求 url 必须是字符串");
    if (typeof config.method !== "string") throw new TypeError("请求 method 必须是字符串");

    const input: PromiseHttpRequestConfig<D> = {
      ...config,
      method: normalizeMethod(config.method),
    };
    validateRequestInput(input);

    // 已取消调用不启动共享配置工厂，也不进入网络或响应转换阶段。
    if (input.signal?.aborted) {
      return Promise.reject(toPromiseHttpRequestError(createCancellationError()));
    }

    // 配置初始化属于客户端共享状态；signal 只竞速当前调用方的等待，不应进入共享 Promise。
    const operation = this.getConfigPromise().then((clientConfig) => {
      const request = this.resolveRequest(clientConfig, input);
      const key = getDedupeKey(request);
      if (key === undefined) return this.executeRequest<T, D>(request);
      return this.getOrCreateInFlight<T, D>(key, request);
    });

    const transform = this.transformResponse;
    // 转换属于当前调用方，并且位于网络重试之外；Promise 返回值按标准规则展开。
    const transformed = transform === undefined ? operation : operation.then(transform);
    // O 保留构造时处理函数是否存在及其返回类型，运行时分支与该条件类型一致。
    return raceWithSignal(transformed, input.signal).catch((error: unknown) => {
      throw error instanceof PromiseHttpRequestError ? error : toPromiseHttpRequestError(error);
    }) as Promise<PromiseHttpResponseResult<T, O>>;
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(
    url: string,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpResponseResult<T, O>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "GET", url });
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpResponseResult<T, O>> {
    // 请求体省略时不生成 data 字段，让 Axios 保留其默认请求体处理行为。
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
  ): Promise<PromiseHttpResponseResult<T, O>> {
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
  ): Promise<PromiseHttpResponseResult<T, O>> {
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
  ): Promise<PromiseHttpResponseResult<T, O>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "DELETE", url });
  }

  /** 获取并缓存异步配置；共享初始化不绑定任何请求 signal，失败不缓存。 */
  private getConfigPromise(): Promise<PromiseHttpClientConfig> {
    // 成功配置优先于进行中的初始化；同步客户端不需要创建额外共享状态。
    if (this.cachedConfig !== undefined) return Promise.resolve(this.cachedConfig);
    if (this.configLoading !== undefined) return this.configLoading;
    if (this.configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
      return Promise.resolve(this.cachedConfig);
    }

    // 缓存当前初始化身份，清理时只修改仍属于本次加载的槽位。
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

  /** 按同步选项重试配置工厂；取消类异常立即传播，其余最终错误标记为配置失败。 */
  private async initializeConfig(): Promise<PromiseHttpClientConfig> {
    let lastError: unknown;
    // 每次尝试重新调用工厂；合并后再校验，异步值只能覆盖客户端配置字段。
    for (let attempt = 1; attempt <= this.configRetryCount; attempt += 1) {
      try {
        const partial = await Promise.resolve(this.configFactory?.());
        assertObject(partial, "异步 HTTP 配置必须是对象");
        return normalizeConfig({ ...this.baseConfig, ...partial });
      } catch (error) {
        // 配置初始化属于整个客户端，等待间隔不绑定任何单次请求的 signal。
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
  ): ResolvedRequest<D> & { headers: RawAxiosRequestHeaders } {
    const request = resolveRequest(clientConfig, input);
    try {
      // 默认鉴权头也属于请求身份；解析后固定到本次请求，防止换账号后错误共享旧响应。
      const headers = resolveRequestHeaders(
        this.axiosInstance.defaults?.headers,
        input.headers,
        request.method,
        this.transformHeaders,
        // 未设置转换时保持 Axios 原本保留字段名大小写的行为。
        this.transformHeaders !== undefined,
      );
      return { ...request, headers };
    } catch (error) {
      throw toPromiseHttpRequestError(error, "config");
    }
  }

  /** 创建或复用同 key 的 in-flight Promise；成功、失败、取消后都会清理 Map。 */
  private getOrCreateInFlight<T, D>(
    key: string,
    request: ResolvedRequest<D> & { headers: RawAxiosRequestHeaders },
  ): Promise<PromiseHttpSuccess<T>> {
    // 相同身份共享传输成功值和错误实例，调用方的响应转换仍各自执行。
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Promise<PromiseHttpSuccess<T>>;

    // 成功、失败均只清理自己登记的槽位，不缓存已经完成的请求。
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
  private async executeRequest<T, D>(
    request: ResolvedRequest<D> & { headers: RawAxiosRequestHeaders },
  ): Promise<PromiseHttpSuccess<T>> {
    // 非请求头字段在所有尝试之间复用；请求头每次复制，以遮蔽期间变化的实例默认值。
    const axiosConfig: AxiosRequestConfig<D> = {
      method: request.method.toLowerCase(),
      url: request.url,
    };
    if (request.params !== undefined) axiosConfig.params = request.params;
    if (request.data !== undefined) axiosConfig.data = request.data;
    if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
    if (request.signal !== undefined) axiosConfig.signal = request.signal;

    // 只有允许的方法及可重试错误才能进入下一次尝试，取消在每次发送前重新检查。
    const retryAllowed =
      request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);
    for (let attempt = 1; attempt <= request.retryCount; attempt += 1) {
      try {
        throwIfAborted(request.signal);
        const response = await this.axiosInstance.request<T, AxiosResponse<T>, D>({
          ...axiosConfig,
          headers: createAttemptHeaders(this.axiosInstance.defaults?.headers, request.headers),
        });
        return this.toSuccess(response);
      } catch (error) {
        // 重试等待同样接受取消；最终失败保持该客户端独有的错误分类。
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
