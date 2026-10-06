import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type RawAxiosRequestHeaders,
} from "axios";
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
  HttpClientOptionsInput,
  HttpConfigFactory,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestContext,
  HttpRequestHeaders,
  HttpRequestOptions,
  HttpResponseBody,
  HttpResponseResult,
  HttpResponseTypeMap,
  HttpSuccess,
  ResolvedRequest,
} from "./types.js";

/** 共享传输只携带响应与实际请求头；订阅业务上下文始终留在共享流外。 */
interface HttpTransportResult<T> {
  /** Axios 返回的统一成功结果。 */
  response: HttpSuccess<T>;
  /** Axios 调度后保留的请求头，含其序列化或拦截器产生的字段。 */
  headers: HttpRequestHeaders;
}

/** 复制并规范化传输头，冻结多值数组与外层对象，避免转换回调影响共享请求。 */
function snapshotRequestHeaders(
  headers: RawAxiosRequestHeaders | AxiosHeaders | undefined,
): HttpRequestHeaders {
  const normalized = new AxiosHeaders();
  // 逐项复制允许显式 undefined；AxiosHeaders 构造类型不接受该屏蔽值。
  for (const name of Object.keys(headers ?? {})) {
    normalized.set(
      name,
      headers instanceof AxiosHeaders ? headers.get(name) : headers?.[name],
      true,
    );
  }
  normalized.normalize(true);
  return Object.freeze(
    Object.fromEntries(
      Object.keys(normalized).map((name) => {
        const value = normalized.get(name);
        return [name, Array.isArray(value) ? Object.freeze([...value]) : value];
      }),
    ),
  );
}

/** 显式映射的两种创建方式，共用 RxHttpClient 的传输与订阅生命周期。 */
export interface HttpTypedClientFactory<M extends HttpResponseTypeMap, C = unknown> {
  /** 创建同步配置客户端；上下文可由 createContext 推导或由 withTypes 的第二泛型指定。 */
  configure<O extends HttpClientOptionsFor<M, R>, R extends C = C>(
    options: O & (O extends unknown ? HttpClientOptionsInput<M, R> | undefined : never),
  ): RxHttpClient<O, M, R>;
  /** 创建共享异步配置客户端；每个订阅仍单独创建上下文。 */
  create<O extends HttpClientOptionsFor<M, R>, R extends C = C>(
    factory: HttpConfigFactory,
    options: O & (O extends unknown ? HttpClientOptionsInput<M, R> | undefined : never),
  ): RxHttpClient<O, M, R>;
}

/**
 * RxJS + Axios 的跨端 HTTP 客户端。
 *
 * 所有网络动作都放在 defer 中，因此构造客户端、创建请求 Observable 以及配置工厂本身都不会立即访问网络。
 * Axios 负责浏览器/Node/Nuxt 的适配，RxJS 负责懒执行、共享、重试和错误通道。
 */
export class RxHttpClient<
  O extends AnyHttpClientOptions<C> | undefined = object,
  M extends HttpResponseTypeMap | undefined = undefined,
  C = unknown,
> {
  /** 用于所有网络尝试的 Axios 实例。 */
  private declare readonly axiosInstance: AxiosInstance;
  /** 构造阶段校验完成的同步配置。 */
  private declare readonly baseConfig: HttpClientConfig;
  /** 可选的异步配置来源，首次订阅时才启动。 */
  private declare readonly configFactory: HttpConfigFactory | undefined;
  /** 初始化配置的总尝试次数，固定取自同步选项。 */
  private declare readonly configRetryCount: number;
  /** 初始化首次成功后缓存的配置。 */
  private declare cachedConfig: HttpClientConfig | undefined;
  /** 供并发订阅共享的配置加载流，失败后释放。 */
  private declare configLoading$: Observable<HttpClientConfig> | undefined;
  /** 按传输身份共享的进行中请求，不保存业务上下文或业务转换结果。 */
  private declare readonly inFlight: Map<string, Observable<HttpTransportResult<unknown>>>;
  /** 在当前订阅开始时捕获使用方状态，不参与共享网络流。 */
  private declare readonly createContext: AnyHttpClientOptions<C>["createContext"];
  /** 为当前订阅生成默认 Header；只在配置解析后调用一次。 */
  private declare readonly transformHeaders: AnyHttpClientOptions<C>["transformHeaders"];
  /** 每个订阅独立处理统一成功响应。 */
  private declare readonly transformResponse: AnyHttpClientOptions<C>["transformResponse"];
  /** 每个订阅在最终失败后至多执行一次错误转换。 */
  private declare readonly transformError: AnyHttpClientOptions<C>["transformError"];

  /** 创建使用同步配置的客户端；未传 baseUrl 时默认为空字符串。 */
  // 延迟上下文交叉类型，防止宽泛 options 被推导成 {} 而丢失可能存在的处理函数。
  constructor(
    options: O & (O extends unknown ? HttpClientOptionsInput<M, C> | undefined : never),
    configFactory?: HttpConfigFactory,
  );
  constructor(
    ...args: object extends O
      ? [options?: undefined, configFactory?: HttpConfigFactory]
      : undefined extends O
        ? [options?: undefined, configFactory?: HttpConfigFactory]
        : [options: never]
  );
  constructor(options: AnyHttpClientOptions<C> = {}, configFactory?: HttpConfigFactory) {
    // 构造期只校验选项与传输能力，不执行任何业务回调或配置工厂。
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

    for (const name of [
      "createContext",
      "transformHeaders",
      "transformResponse",
      "transformError",
    ] as const) {
      if (options[name] !== undefined && typeof options[name] !== "function") {
        throw new TypeError(`${name} 必须是函数`);
      }
    }
    this.createContext = options.createContext;
    this.transformHeaders = options.transformHeaders;
    this.transformResponse = options.transformResponse;
    this.transformError = options.transformError;
    // 初始化实例级共享状态；业务上下文只会出现在单次订阅闭包中。
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
  static create<O extends AnyHttpClientOptions<C> | undefined, C = unknown>(
    factory: HttpConfigFactory,
    options: O & (O extends unknown ? HttpClientOptionsInput<undefined, C> | undefined : never),
  ): RxHttpClient<O, undefined, C>;
  static create(factory: HttpConfigFactory, options?: undefined): RxHttpClient;
  static create<C>(
    factory: HttpConfigFactory,
    options: AnyHttpClientOptions<C> = {},
  ): RxHttpClient<AnyHttpClientOptions<C>, undefined, C> {
    if (typeof factory !== "function") {
      throw new TypeError("HttpConfigFactory 必须是函数");
    }
    return new RxHttpClient<AnyHttpClientOptions<C>, undefined, C>(options, factory);
  }

  /** 创建带显式响应映射的配置入口；只约束类型，仍由同一个客户端执行请求。 */
  static withTypes<M extends HttpResponseTypeMap, C = unknown>(): HttpTypedClientFactory<M, C> {
    return {
      /** 使用同步选项创建实际客户端，不另建请求转发层。 */
      configure<O extends HttpClientOptionsFor<M, R>, R extends C = C>(
        options: O & (O extends unknown ? HttpClientOptionsInput<M, R> | undefined : never),
      ): RxHttpClient<O, M, R> {
        return new RxHttpClient<O, M, R>(options);
      },
      /** 保留映射和上下文类型，交由同一实现管理异步配置。 */
      create<O extends HttpClientOptionsFor<M, R>, R extends C = C>(
        factory: HttpConfigFactory,
        options: O & (O extends unknown ? HttpClientOptionsInput<M, R> | undefined : never),
      ): RxHttpClient<O, M, R> {
        if (typeof factory !== "function") throw new TypeError("HttpConfigFactory 必须是函数");
        return new RxHttpClient<O, M, R>(options, factory);
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

  /** 保留调用时的浅快照与校验；上下文、配置和转换在每个订阅内独立创建。 */
  private prepareRequest<T, D>(
    buildInput: () => HttpRequestConfig<D>,
  ): Observable<HttpResponseResult<T, O, M>> {
    let createSource: (
      request: HttpRequestContext<C>,
      onHeaders: (headers: HttpRequestHeaders) => void,
    ) => Observable<HttpSuccess<unknown>>;
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
      createSource = (request, onHeaders) =>
        this.createRequest<HttpResponseBody<T, M>, D>(input, request, onHeaders);
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
      createSource = () => throwError(() => toHttpRequestError(error, "config"));
    }
    // 订阅上下文放在取消监听与共享配置之外：即便 signal 已取消，也先捕获该订阅的身份。
    // 构造选项约束实际回调，M 声明所有 T 的转换关系；末尾断言只恢复现有的结果映射。
    return defer(() => {
      let request: HttpRequestContext<C> = { context: undefined, headers: undefined };
      let source$: Observable<HttpSuccess<unknown>>;
      try {
        request = { context: this.createContext?.(), headers: undefined };
        source$ = createSource(request, (headers) => {
          // 更新的是库的元信息，绝不复制或修改使用方返回的业务对象。
          request = { context: request.context, headers };
        });
      } catch (error) {
        // 同步工厂失败不进入配置/网络重试，错误转换收到缺失的上下文。
        source$ = throwError(() => toHttpRequestError(error, "config"));
      }
      return applyResponseTransforms(
        source$,
        this.transformResponse,
        this.transformError,
        signal,
        () => request,
      );
    }) as Observable<HttpResponseResult<T, O, M>>;
  }

  /** 配置、传输与成功转换保持懒执行；业务转换不进入网络重试或共享结果缓存。 */
  private createRequest<T, D>(
    input: HttpRequestConfig<D>,
    context: HttpRequestContext<C>,
    onHeaders: (headers: HttpRequestHeaders) => void,
  ): Observable<HttpSuccess<T>> {
    return defer(() => this.getConfig$()).pipe(
      switchMap((clientConfig) => {
        const request = this.resolveRequest(clientConfig, input, context);
        // 在去重前锁定各订阅的请求头，只有传输结果进入共享流。
        onHeaders(snapshotRequestHeaders(request.headers));
        const key = this.getDedupeKey(request);
        return key === undefined
          ? this.executeRequest<T, D>(request)
          : this.getOrCreateInFlight<T, D>(key, request);
      }),
      map((result) => {
        // 成功时以 Axios 实际调度的 Header 为准；去重订阅只共享这个只读传输快照。
        onHeaders(result.headers);
        return result.response;
      }),
      catchError((cause: unknown) => {
        const error = toHttpRequestError(cause);
        // HTTP/网络错误通常携带最终 config；配置或取消等早期失败保留已有阶段的快照。
        if (
          error.error.kind !== "config" &&
          axios.isAxiosError<unknown, unknown>(error.error.cause) &&
          error.error.cause.config !== undefined
        ) {
          onHeaders(snapshotRequestHeaders(error.error.cause.config.headers));
        }
        return throwError(() => error);
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
    context: HttpRequestContext<C>,
  ): ResolvedRequest<D> & { headers: RawAxiosRequestHeaders } {
    const request = resolveRequest(clientConfig, input);
    try {
      // 沿用共享规范化与覆盖逻辑；回调仍只看到请求头副本，不包含 Axios 默认头。
      const requested = transformRequestHeaders(input.headers, request.method, (headers) =>
        this.transformHeaders === undefined ? headers : this.transformHeaders(headers, context),
      );
      // 提前展开实例默认值，使自动去重和所有重试使用同一份最终 Header。
      const defaults = transformRequestHeaders(
        this.axiosInstance.defaults?.headers,
        request.method,
        (headers) => headers,
      );
      const headers = transformRequestHeaders(requested, request.method, () => defaults);
      return { ...request, headers };
    } catch (error) {
      throw toHttpRequestError(error, "config");
    }
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
  ): Observable<HttpTransportResult<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Observable<HttpTransportResult<T>>;

    // 只有第一次订阅进入这里才登记 Map；Observable 创建本身不会占用去重槽位。
    let shared$: Observable<HttpTransportResult<unknown>>;
    const source$ = this.executeRequest<T, D>(request).pipe(
      finalize(() => {
        if (this.inFlight.get(key) === shared$) this.inFlight.delete(key);
      }),
    );
    // 默认不取消底层请求时不能使用 refCount，否则最后一个订阅者离开会让 source finalize 并清掉 Map，
    // 但 Axios Promise 仍在执行，随后相同请求会重新发起。开启自动取消时才让 refCount 控制底层生命周期。
    shared$ = source$.pipe(shareReplay({ bufferSize: 1, refCount: request.cancelOnNoSubscribers }));
    this.inFlight.set(key, shared$);
    return shared$ as Observable<HttpTransportResult<T>>;
  }

  /** 通过 defer/from 接入 Axios Promise，并按规则进行请求级重试和统一错误转换。 */
  private executeRequest<T, D>(request: ResolvedRequest<D>): Observable<HttpTransportResult<T>> {
    return defer(() => {
      // 取消资源属于这次共享传输，所有内部重试复用同一生命周期与请求参数。
      const abortLifecycle = createAbortLifecycle(request.signal, request.cancelOnNoSubscribers);
      let settled = false;
      const axiosConfig: AxiosRequestConfig<D> = {
        method: request.method.toLowerCase(),
        url: request.url,
      };
      if (request.params !== undefined) axiosConfig.params = request.params;
      if (request.data !== undefined) axiosConfig.data = request.data;
      if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
      if (abortLifecycle.signal !== undefined) axiosConfig.signal = abortLifecycle.signal;

      // 默认只允许安全方法重试；每次尝试仍由 Axios 执行拦截器和请求体转换。
      const retryAllowed =
        request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);

      return defer(() => {
        // 已在 resolveRequest 合并过默认头。用显式 undefined 覆盖当前默认头的所有顶层键，
        // 阻止 Axios 再展开 common/方法分组（其中的 false 会锁住字段）或补入重试期间新增的头。
        // 每次只读取默认键名并建立新的请求配置，不修改实例默认值或已解析的请求头。
        const suppressedDefaults: RawAxiosRequestHeaders = Object.fromEntries(
          Object.keys(this.axiosInstance.defaults?.headers ?? {}).map((name) => [name, undefined]),
        );
        return from(
          this.axiosInstance.request<T, AxiosResponse<T>, D>({
            ...axiosConfig,
            headers: { ...suppressedDefaults, ...request.headers },
          }),
        );
      }).pipe(
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
          // 传输完成后记录 Axios 实际使用的头；拦截器和序列化仍可按其契约改变字段。
          settled = true;
          return {
            headers: snapshotRequestHeaders(response.config.headers),
            response: this.toSuccess<T>(response),
          };
        }),
        catchError((error: unknown) => {
          // 重试耗尽或不可重试的错误在此统一，交给各订阅独立转换。
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
