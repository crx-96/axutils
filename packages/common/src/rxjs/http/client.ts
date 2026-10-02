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
  retry,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timer,
} from "rxjs";
import { transformRequestHeaders } from "../../internal/http/headers.js";
import { SAFE_RETRY_METHODS, assertObject } from "../../internal/http/primitives.js";
import { createAbortLifecycle } from "./abort.js";
import {
  getConfigOptions,
  normalizeConfig,
  normalizeMethod,
  normalizeRequestOptions,
  resolveRequest,
  validateRequestInput,
  validateSignal,
} from "./config.js";
import { isRetryableError, toHttpRequestError } from "./errors.js";
import { getDedupeKey } from "./request-identity.js";
import { applyResponseTransforms } from "./transforms.js";
import type {
  AnyHttpClientOptions,
  HttpClientConfig,
  HttpClientOptionsFor,
  HttpConfigFactory,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestOptions,
  HttpResponseBody,
  HttpResponseResult,
  HttpResponseTypeMap,
  HttpSuccess,
  ResolvedRequest,
} from "./types.js";

/** 显式映射的两种创建方式，共用 RxHttpClient 的传输与订阅生命周期。 */
export interface HttpTypedClientFactory<M extends HttpResponseTypeMap> {
  configure<O extends HttpClientOptionsFor<M>>(
    options: O & (O extends unknown ? HttpClientOptionsFor<M> | undefined : never),
  ): RxHttpClient<O, M>;
  create<O extends HttpClientOptionsFor<M>>(
    factory: HttpConfigFactory,
    options: O & (O extends unknown ? HttpClientOptionsFor<M> | undefined : never),
  ): RxHttpClient<O, M>;
}

/**
 * RxJS + Axios 的跨端 HTTP 客户端。
 *
 * 所有网络动作都放在 defer 中，因此构造客户端、创建请求 Observable 以及配置工厂本身都不会立即访问网络。
 * Axios 负责浏览器/Node/Nuxt 的适配，RxJS 负责懒执行、共享、重试和错误通道。
 */
export class RxHttpClient<
  O extends AnyHttpClientOptions | undefined = object,
  M extends HttpResponseTypeMap | undefined = undefined,
> {
  private declare readonly axiosInstance: AxiosInstance;
  private declare readonly baseConfig: HttpClientConfig;
  private declare readonly configFactory: HttpConfigFactory | undefined;
  private declare readonly configRetryCount: number;
  private declare cachedConfig: HttpClientConfig | undefined;
  private declare configLoading$: Observable<HttpClientConfig> | undefined;
  private declare readonly inFlight: Map<string, Observable<HttpSuccess<unknown>>>;
  private declare readonly transformHeaders: AnyHttpClientOptions["transformHeaders"];
  private declare readonly transformResponse: AnyHttpClientOptions["transformResponse"];
  private declare readonly transformError: AnyHttpClientOptions["transformError"];

  /** 创建使用同步配置的客户端；未传 baseUrl 时默认为空字符串。 */
  // 延迟上下文交叉类型，防止宽泛 options 被推导成 {} 而丢失可能存在的处理函数。
  constructor(
    options: O & (O extends unknown ? HttpClientOptionsFor<M> | undefined : never),
    configFactory?: HttpConfigFactory,
  );
  constructor(
    ...args: object extends O
      ? [options?: undefined, configFactory?: HttpConfigFactory]
      : undefined extends O
        ? [options?: undefined, configFactory?: HttpConfigFactory]
        : [options: never]
  );
  constructor(options: AnyHttpClientOptions = {}, configFactory?: HttpConfigFactory) {
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

    for (const name of ["transformHeaders", "transformResponse", "transformError"] as const) {
      if (options[name] !== undefined && typeof options[name] !== "function") {
        throw new TypeError(`${name} 必须是函数`);
      }
    }
    this.transformHeaders = options.transformHeaders;
    this.transformResponse = options.transformResponse;
    this.transformError = options.transformError;
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
  static create<O extends AnyHttpClientOptions | undefined>(
    factory: HttpConfigFactory,
    options: O & (O extends unknown ? AnyHttpClientOptions | undefined : never),
  ): RxHttpClient<O>;
  static create(factory: HttpConfigFactory, options?: undefined): RxHttpClient;
  static create(
    factory: HttpConfigFactory,
    options: AnyHttpClientOptions = {},
  ): RxHttpClient<AnyHttpClientOptions> {
    if (typeof factory !== "function") {
      throw new TypeError("HttpConfigFactory 必须是函数");
    }
    return new RxHttpClient(options, factory);
  }

  /** 创建带显式响应映射的配置入口；只约束类型，仍由同一个客户端执行请求。 */
  static withTypes<M extends HttpResponseTypeMap>(): HttpTypedClientFactory<M> {
    return {
      configure<O extends HttpClientOptionsFor<M>>(
        options: O & (O extends unknown ? HttpClientOptionsFor<M> | undefined : never),
      ): RxHttpClient<O, M> {
        return new RxHttpClient<O, M>(options);
      },
      create<O extends HttpClientOptionsFor<M>>(
        factory: HttpConfigFactory,
        options: O & (O extends unknown ? HttpClientOptionsFor<M> | undefined : never),
      ): RxHttpClient<O, M> {
        if (typeof factory !== "function") throw new TypeError("HttpConfigFactory 必须是函数");
        return new RxHttpClient<O, M>(options, factory);
      },
    };
  }

  /**
   * 创建通用请求 Observable；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。
   * 未配置 transformError 时输入校验同步抛错；配置后，校验失败在订阅时交给该回调。
   * T 只声明预期响应类型；映射模式由 M 定义原响应体与 T 的关系，不做运行时结构校验。
   */
  request<T = unknown, D = unknown>(
    config: HttpRequestConfig<D>,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.prepareRequest<T, D>(() => config);
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(
    url: string,
    options?: HttpRequestOptions,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.requestWithOptions<T>("GET", url, options);
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.requestWithOptions<T, D>("POST", url, options, data);
  }

  /** 发起 PUT 请求。 */
  put<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.requestWithOptions<T, D>("PUT", url, options, data);
  }

  /** 发起 PATCH 请求。 */
  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.requestWithOptions<T, D>("PATCH", url, options, data);
  }

  /** 发起 DELETE 请求。 */
  delete<T = unknown>(
    url: string,
    options?: HttpRequestOptions,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.requestWithOptions<T>("DELETE", url, options);
  }

  /** 快捷方法的 options 校验也在统一边界内，避免提前抛错绕过 transformError。 */
  private requestWithOptions<T, D = unknown>(
    method: HttpMethod,
    url: string,
    options: HttpRequestOptions | undefined,
    data?: D,
  ): Observable<HttpResponseResult<T, O, M>> {
    return this.prepareRequest<T, D>(() => {
      const config: HttpRequestConfig<D> = { ...normalizeRequestOptions(options), method, url };
      if (data !== undefined) config.data = data;
      return config;
    });
  }

  /** 保留调用时的浅快照与校验；只有错误转换的执行延迟到订阅时。 */
  private prepareRequest<T, D>(
    buildInput: () => HttpRequestConfig<D>,
  ): Observable<HttpResponseResult<T, O, M>> {
    let source$: Observable<HttpSuccess<unknown>>;
    let signal: HttpRequestOptions["signal"];
    let config: HttpRequestConfig<D> | undefined;
    try {
      config = buildInput();
      assertObject(config, "HttpRequestConfig 必须是对象");
      if (typeof config.url !== "string") throw new TypeError("请求 url 必须是字符串");
      if (typeof config.method !== "string") throw new TypeError("请求 method 必须是字符串");
      const input: HttpRequestConfig<D> = { ...config, method: normalizeMethod(config.method) };
      config = input;
      validateRequestInput(input);
      signal = input.signal;
      source$ = this.createRequest<HttpResponseBody<T, M>, D>(input);
    } catch (error) {
      if (this.transformError === undefined) throw error;
      try {
        // 其他参数无效时仍保留合法取消信号；已完成浅复制时复用快照。
        const candidate = config?.signal;
        validateSignal(candidate);
        signal = candidate;
      } catch {
        // 无效的 signal 不能用于监听；保留最初的参数错误供使用方排查。
        signal = undefined;
      }
      source$ = throwError(() => toHttpRequestError(error, "config"));
    }
    // 构造选项约束实际回调，M 显式声明所有 T 的转换关系；网络数据的结构仍由调用方负责。
    return applyResponseTransforms(
      source$,
      this.transformResponse,
      this.transformError,
      signal,
    ) as Observable<HttpResponseResult<T, O, M>>;
  }

  /** 配置、传输与成功转换保持懒执行；业务转换不进入网络重试或共享结果缓存。 */
  private createRequest<T, D>(input: HttpRequestConfig<D>): Observable<HttpSuccess<T>> {
    return defer(() => this.getConfig$()).pipe(
      switchMap((clientConfig) => {
        const request = this.resolveRequest(clientConfig, input);
        const key = this.getDedupeKey(request);
        return key === undefined
          ? this.executeRequest<T, D>(request)
          : this.getOrCreateInFlight<T, D>(key, request);
      }),
    );
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
    const request = resolveRequest(clientConfig, input);
    if (this.transformHeaders !== undefined) {
      try {
        request.headers = transformRequestHeaders(
          input.headers,
          request.method,
          this.transformHeaders,
        );
      } catch (error) {
        throw toHttpRequestError(error, "config");
      }
    }
    return request;
  }

  /**
   * 根据请求语义生成 in-flight key。
   *
   * 自动 key 使用现有 jsonStringify 的递归 key 排序，再用 Md5 压缩长度；两个依赖均为可选 peer，
   * 仅从本子路径使用 HTTP 功能时需要安装。无法稳定 JSON 序列化时宁可关闭自动去重，也不冒险合并请求。
   */
  private getDedupeKey<D>(request: ResolvedRequest<D>): string | undefined {
    return getDedupeKey(request);
  }

  /** 创建或复用同 key 的 in-flight Observable；请求完成/失败/取消后都会清理 Map。 */
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
