import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import {
  type Observable,
  catchError,
  defer,
  finalize,
  first,
  from,
  map,
  of,
  race,
  retry,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timer,
} from "rxjs";
import { SAFE_RETRY_METHODS, assertObject } from "../../internal/http/primitives.js";
import { createAbortLifecycle, createCallerAbort$ } from "./abort.js";
import {
  getConfigOptions,
  normalizeConfig,
  normalizeMethod,
  normalizeRequestOptions,
  resolveRequest,
  validateRequestInput,
} from "./config.js";
import { HttpRequestError, isRetryableError, toHttpRequestError } from "./errors.js";
import { getDedupeKey } from "./request-identity.js";
import type {
  HttpClientConfig,
  HttpClientOptions,
  HttpConfigFactory,
  HttpRequestConfig,
  HttpRequestOptions,
  HttpSuccess,
  ResolvedRequest,
} from "./types.js";

/**
 * RxJS + Axios 的跨端 HTTP 客户端。
 *
 * 所有网络动作都放在 defer 中，因此构造客户端、创建请求 Observable 以及配置工厂本身都不会立即访问网络。
 * Axios 负责浏览器/Node/Nuxt 的适配，RxJS 负责懒执行、共享、重试和错误通道。
 */
export class RxHttpClient {
  private declare readonly axiosInstance: AxiosInstance;
  private declare readonly baseConfig: HttpClientConfig;
  private declare readonly configFactory: HttpConfigFactory | undefined;
  private declare readonly configRetryCount: number;
  private declare cachedConfig: HttpClientConfig | undefined;
  private declare configLoading$: Observable<HttpClientConfig> | undefined;
  private declare readonly inFlight: Map<string, Observable<HttpSuccess<unknown>>>;

  /** 创建使用同步配置的客户端；未传 baseUrl 时默认为空字符串。 */
  constructor(options: HttpClientOptions = {}, configFactory?: HttpConfigFactory) {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new TypeError("HttpClientOptions 必须是对象");
    }
    if (options.axiosInstance === undefined) {
      this.axiosInstance = axios;
    } else {
      if (options.axiosInstance === null || typeof options.axiosInstance.request !== "function") {
        throw new TypeError("axiosInstance 必须提供 request 方法");
      }
      this.axiosInstance = options.axiosInstance;
    }

    this.inFlight = new Map();
    this.baseConfig = normalizeConfig(getConfigOptions(options));
    this.configRetryCount = this.baseConfig.retryCount;
    this.configFactory = configFactory;
    if (configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
    }
  }

  /**
   * 创建使用异步配置工厂的客户端。
   *
   * 工厂不会在这里执行，只有第一次请求 Observable 被订阅时才会执行；配置首次成功后缓存在实例中，
   * 配置失败不会缓存失败结果，后续请求可以再次初始化。工厂本身必须返回 Observable，不能返回 Promise。
   */
  static create(factory: HttpConfigFactory, options: HttpClientOptions = {}): RxHttpClient {
    if (typeof factory !== "function") {
      throw new TypeError("HttpConfigFactory 必须是函数");
    }
    return new RxHttpClient(options, factory);
  }

  /** 发起通用请求；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。 */
  request<T = unknown, D = unknown>(config: HttpRequestConfig<D>): Observable<HttpSuccess<T>> {
    assertObject(config, "HttpRequestConfig 必须是对象");
    if (typeof config.url !== "string") {
      throw new TypeError("请求 url 必须是字符串");
    }
    if (typeof config.method !== "string") {
      throw new TypeError("请求 method 必须是字符串");
    }

    const input: HttpRequestConfig<D> = {
      ...config,
      method: normalizeMethod(config.method),
    };
    validateRequestInput(input);

    const request$ = defer(() => this.getConfig$()).pipe(
      switchMap((clientConfig) => {
        const request = this.resolveRequest(clientConfig, input);
        const key = this.getDedupeKey(request);
        if (key === undefined) {
          return this.executeRequest<T, D>(request);
        }
        return this.getOrCreateInFlight<T, D>(key, request);
      }),
    );
    const callerAbort$ = createCallerAbort$(input.signal);
    const result$ = callerAbort$ === undefined ? request$ : race(callerAbort$, request$);

    return result$.pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpRequestError ? error : toHttpRequestError(error))),
      ),
    );
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(url: string, options?: HttpRequestOptions): Observable<HttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "GET", url });
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
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
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "PUT",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 PATCH 请求。 */
  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "PATCH",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 DELETE 请求。 */
  delete<T = unknown>(url: string, options?: HttpRequestOptions): Observable<HttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "DELETE", url });
  }

  /** 获取并缓存异步配置；并发首请求共享同一个初始化 Observable。 */
  private getConfig$(): Observable<HttpClientConfig> {
    if (this.cachedConfig !== undefined) return of(this.cachedConfig);
    if (this.configLoading$ !== undefined) return this.configLoading$;
    if (this.configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
      return of(this.cachedConfig);
    }

    const config$ = defer(() => {
      const result = this.configFactory?.();
      if (result === undefined || typeof result.subscribe !== "function") {
        throw new TypeError("HttpConfigFactory 必须返回 Observable");
      }
      return result;
    }).pipe(
      // 只读取第一个配置值，避免配置流持续发值导致客户端配置在请求过程中变化。
      first(),
      map((partial) => {
        assertObject(partial, "异步 HTTP 配置必须是对象");
        return normalizeConfig({ ...this.baseConfig, ...partial });
      }),
      // 配置初始化使用同步选项中的 retryCount；异步配置中的 retryCount 只影响后续请求。
      retry({ count: this.configRetryCount - 1, delay: this.baseConfig.retryDelay }),
      tap((config) => {
        this.cachedConfig = config;
      }),
      catchError((error: unknown) => throwError(() => toHttpRequestError(error, "config"))),
      finalize(() => {
        // 失败不缓存；成功时保留 cachedConfig，后续请求直接复用，不再执行工厂。
        if (this.cachedConfig === undefined) this.configLoading$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.configLoading$ = config$;
    return config$;
  }

  /** 将请求级覆盖项与已解析客户端配置合并，并在网络执行前完成边界校验。 */
  private resolveRequest<D>(
    clientConfig: HttpClientConfig,
    input: HttpRequestConfig<D>,
  ): ResolvedRequest<D> {
    return resolveRequest(clientConfig, input);
  } /**
   * 根据请求语义生成 in-flight key。
   *
   * 自动 key 使用现有 jsonStringify 的递归 key 排序，再用 Md5 压缩长度；两个依赖均为可选 peer，
   * 仅从本子路径使用 HTTP 功能时需要安装。无法稳定 JSON 序列化时宁可关闭自动去重，也不冒险合并请求。
   */
  private getDedupeKey<D>(request: ResolvedRequest<D>): string | undefined {
    return getDedupeKey(request);
  } /** 创建或复用同 key 的 in-flight Observable；请求完成/失败/取消后都会清理 Map。 */
  private getOrCreateInFlight<T, D>(
    key: string,
    request: ResolvedRequest<D>,
  ): Observable<HttpSuccess<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Observable<HttpSuccess<T>>;

    // 只有第一次订阅进入这里才登记 Map；Observable 创建本身不会占用去重槽位。
    let shared$: Observable<HttpSuccess<unknown>>;
    const source$ = this.executeRequest<T, D>(request).pipe(
      finalize(() => {
        if (this.inFlight.get(key) === shared$) this.inFlight.delete(key);
      }),
    );
    // 默认不取消底层请求时不能使用 refCount，否则最后一个订阅者离开会让 source finalize 并清掉 Map，
    // 但 Axios Promise 仍在执行，随后相同请求会重新发起。开启自动取消时才让 refCount 控制底层生命周期。
    shared$ = source$.pipe(shareReplay({ bufferSize: 1, refCount: request.cancelOnNoSubscribers }));
    this.inFlight.set(key, shared$);
    return shared$ as Observable<HttpSuccess<T>>;
  }

  /** 通过 defer/from 接入 Axios Promise，并按规则进行请求级重试和统一错误转换。 */
  private executeRequest<T, D>(request: ResolvedRequest<D>): Observable<HttpSuccess<T>> {
    return defer(() => {
      const abortLifecycle = createAbortLifecycle(request.signal, request.cancelOnNoSubscribers);
      let settled = false;
      const axiosConfig: AxiosRequestConfig<D> = {
        method: request.method.toLowerCase(),
        url: request.url,
      };
      if (request.params !== undefined) axiosConfig.params = request.params;
      if (request.headers !== undefined) axiosConfig.headers = request.headers;
      if (request.data !== undefined) axiosConfig.data = request.data;
      if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
      if (abortLifecycle.signal !== undefined) axiosConfig.signal = abortLifecycle.signal;

      const retryAllowed =
        request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);

      return defer(() =>
        from(this.axiosInstance.request<T, AxiosResponse<T>, D>(axiosConfig)),
      ).pipe(
        retry({
          count: retryAllowed ? request.retryCount - 1 : 0,
          delay: (error: unknown) => {
            if (!retryAllowed || !isRetryableError(error)) {
              return throwError(() => error);
            }
            return request.retryDelay > 0 ? timer(request.retryDelay) : of(null);
          },
        }),
        map((response) => {
          settled = true;
          return this.toSuccess<T>(response);
        }),
        catchError((error: unknown) => {
          settled = true;
          return throwError(() => toHttpRequestError(error));
        }),
        finalize(() => {
          // 只有 source 被订阅者主动解除且请求尚未结束时才 abort，正常完成/失败不触发额外取消。
          if (!settled) abortLifecycle.abort();
          abortLifecycle.cleanup();
        }),
      );
    });
  }

  /** 将 Axios 响应映射为只携带 HTTP 状态码的统一成功结果。 */
  private toSuccess<T>(response: AxiosResponse<T>): HttpSuccess<T> {
    // biome-ignore assist/source/useSortedKeys: 保留公开响应对象的字段枚举顺序。
    return {
      code: response.status,
      success: true,
      data: response.data,
      error: null,
    };
  }
}
