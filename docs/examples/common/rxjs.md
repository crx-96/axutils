# `@axutils/common` RxJS HTTP 客户端

本文档对应 `packages/common/src/rxjs/http`，公开路径为 `@axutils/common/rxjs/http`。网络动作放在 `defer` 中，构造客户端、创建 Observable 和配置工厂都不会立即访问网络；只有订阅时才开始初始化配置和调用 Axios。

安装可选 peer 依赖：

```bash
pnpm add @axutils/common rxjs axios safe-stable-stringify spark-md5
```

不使用该子路径时无需安装 RxJS。Axios 默认适配器可用于浏览器、Node.js 和 Nuxt SSR。

## 公开导出与所有合法使用方式

`@axutils/common/rxjs/http` 是 `package.json#exports` 中唯一的 RxJS HTTP 入口。它不是根入口的一部分；`@axutils/common` 不导出 `RxHttpClient`、`HttpRequestError` 或本节类型。该子路径静态使用 `rxjs`、`axios`、`safe-stable-stringify` 和 `spark-md5`：分别用于 Observable、HTTP 适配、稳定请求去重序列化和 MD5 压缩。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common/rxjs/http` | `RxHttpClient`（`create`、`withTypes`、`request`、`get`、`post`、`put`、`patch`、`delete`）、`HttpRequestError` | `HttpMethod`、`HttpClientConfig`、`HttpClientOptions`、`HttpConfigFactory`、`HttpRequestOptions`、`HttpRequestConfig`、`HttpRequestContext`、`HttpRequestHeaders`、`HttpSuccess`、`HttpFailure`、`HttpResult`、`HttpErrorKind`、`HttpErrorInfo`、`HttpResponseTransformer`、`HttpErrorTransformer`、`HttpResponseResult`、`HttpResponseTypeMap`、`HttpMappedClientOptions`、`HttpTransformValue`、`HttpTypedClientFactory` | `rxjs`、`axios`、`safe-stable-stringify`、`spark-md5` |
| `@axutils/common` (`.`) | 不导出 RxJS HTTP API | 不导出上述类型 | 根入口无第三方运行时依赖 |

ESM 使用精确子路径导入全部运行时 API和类型：

```ts
import {
  HttpRequestError,
  RxHttpClient,
} from "@axutils/common/rxjs/http";
import type {
  HttpClientConfig,
  HttpClientOptions,
  HttpConfigFactory,
  HttpErrorInfo,
  HttpErrorKind,
  HttpErrorTransformer,
  HttpFailure,
  HttpMappedClientOptions,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestContext,
  HttpRequestHeaders,
  HttpRequestOptions,
  HttpResponseResult,
  HttpResponseTransformer,
  HttpResponseTypeMap,
  HttpResult,
  HttpSuccess,
  HttpTransformValue,
  HttpTypedClientFactory,
} from "@axutils/common/rxjs/http";
```

CJS 使用同一精确子路径的 `require`：

```js
const {
  HttpRequestError,
  RxHttpClient,
} = require("@axutils/common/rxjs/http");
```

UMD 构建把 RxJS、Axios、`safe-stable-stringify` 和 `spark-md5` 一并打包，浏览器侧使用全局对象；根入口不会加载这些 peer：

```js
const client = new AxutilsCommon.RxHttpClient({
  baseUrl: "https://api.example.com",
});
client.get("/health").subscribe({
  next: (result) => console.log(result.code),
});
```

`HttpMethod` 支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS` 的大小写写法。当前便捷方法是 `request`、`get`、`post`、`put`、`patch`、`delete`；没有独立的 `head` 或 `options` 方法，需要用 `request` 指定 method。

## `new RxHttpClient(options?, configFactory?)`

创建同步配置客户端。构造函数不发起请求，也不调用配置工厂。默认配置：`baseUrl: ""`、`retryCount: 3`、`retryDelay: 0`、`dedupe: true`、`retryable: true`、`retryNonIdempotent: false`、`cancelOnNoSubscribers: false`。

关键配置：

- `baseUrl`：相对 URL 的基础地址；绝对 URL 不拼接它。
- `retryCount`：一次请求的总尝试次数，至少为 `1`；初始化配置失败时按同步选项重试。
- `retryDelay`：重试或初始化重试之间的毫秒等待，必须是非负有限数。
- `timeout`：Axios 超时毫秒数，省略时沿用 Axios 默认值。
- `dedupe`：是否合并同一时刻的稳定请求，默认 `true`。
- `retryable`：是否启用请求级重试，默认 `true`。
- `retryNonIdempotent`：是否允许 POST/PUT/PATCH/DELETE 重试，默认 `false`。
- `cancelOnNoSubscribers`：最后一个订阅者取消时是否 abort 底层请求，默认 `false`。
- `axiosInstance`：可注入提供 `request` 方法的 Axios 实例。
- `createContext`：可选的同步工厂，在每次订阅开始、等待配置之前捕获使用方状态，返回值不被克隆或修改。
- `transformHeaders`：同步处理请求头副本，第二参数包含本次订阅的上下文；请求级 headers 优先。
- `transformResponse`：处理统一成功结果，支持普通值、Promise 或 Observable，并自动推导最终发值类型。
- `transformError`：在请求最终失败后，将 `HttpRequestError` 转成普通结果；也覆盖配置、请求头和响应转换异常，支持与 `transformResponse` 相同的返回形式。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({
  baseUrl: "https://api.example.com",
  retryCount: 3,
  retryDelay: 100,
  timeout: 10_000,
});
```

## `RxHttpClient.create(factory, options?)`

静态工厂，用 `() => Observable<Partial<HttpClientConfig>>` 创建异步配置客户端。工厂只在第一次请求 Observable 被订阅时执行；首次成功配置会缓存，失败不会缓存，后续请求可以再次初始化。工厂必须返回 Observable，不能直接返回 Promise；只读取第一个配置值。

```ts
import { of } from "rxjs";
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = RxHttpClient.create(
  () => of({ baseUrl: "https://api.example.com", retryCount: 3 }),
  { retryCount: 2, retryDelay: 100 },
);
```

## 统一处理请求头、成功结果和异常

`constructor` 的第一个参数和 `create(factory, options)` 的第二个参数都支持 `transformHeaders`、`transformResponse` 和 `transformError`。它们属于实例选项，不放在配置工厂返回的 `HttpClientConfig` 中。只需配置一次，所有请求方法都会使用这些回调。

```ts
import { of } from "rxjs";
import { RxHttpClient, type HttpSuccess, type HttpClientOptions } from "@axutils/common/rxjs/http";

interface UserResponse {
  user: { id: number; name: string };
}

let token = "initial-token";
const options = {
  transformHeaders: (headers) => ({
    ...headers,
    Authorization: `Bearer ${token}`,
  }),
  transformResponse: (result: HttpSuccess<UserResponse>) => result.data.user,
} satisfies HttpClientOptions;

const client = new RxHttpClient(options);
const configured = RxHttpClient.create(() => of({ baseUrl: "/api" }), options);
// 两者均推导为 Observable<{ id: number; name: string }>
client.get("/user").subscribe((user) => console.log(user.name));
configured.get("/user").subscribe((user) => console.log(user.id));

token = "refreshed-token";
client.get("/user", {
  headers: { authorization: "Bearer request-token" },
}).subscribe(); // 此请求使用 request-token
```

### 请求头优先级与执行时机

- `transformHeaders` 收到当前请求 headers 的副本；未传 headers 时为空对象，`common` 和当前方法分组会展开。可以返回普通 headers 对象或 `AxiosHeaders`。
- 回调在每次订阅时、配置解析完成后执行，网络重试沿用本次处理结果。构造客户端和仅创建 Observable 都不会执行回调。
- 合并顺序为 Axios 实例默认 headers → 回调结果 → 请求级 headers。同名 header 不区分大小写，请求级 `false`、`null` 等屏蔽值也保留。
- 回调输入不包含 Axios 实例默认 headers；库在本次解析时补齐实例默认头，再计算去重身份。要屏蔽默认字段，可在返回值中将它设为 `false` 或 `null`。
- 内部重试复用解析时确定的默认头与请求级覆盖，不重新混入之后新增或修改的实例默认字段；请求级显式值也能覆盖默认分组中的 `false`。
- 回调中的对象和多值数组修改不会影响调用方原 headers。请求级字段始终最后覆盖，所以回调不能删除或改写调用方明确指定的同名字段。
- 最终 headers 在自动去重前参与身份计算；不同 token 的请求会独立执行。使用显式 `dedupeKey` 且请求参数不可稳定序列化时，仍由调用方负责 key 的业务身份。

### 每次订阅的上下文与最终请求头

需要隔离身份、语言等状态时，使用 `createContext`，不要在配置等待结束后重新读取这些外部状态。三个现有转换回调统一增加第二个参数 `request: HttpRequestContext<C>`：

```ts
interface HttpRequestContext<C> {
  readonly context: C | undefined;
  readonly headers: HttpRequestHeaders | undefined;
}
```

- `createContext()` 在订阅开始时同步调用；创建客户端或请求 Observable 时不调用。同一 Observable 重新订阅会重新调用，包括通过外部 `retry` 重新订阅；客户端内部的配置重试和网络重试不重新创建上下文。
- `context` 保留工厂返回的原始值和引用。库不复制、冻结或修改业务对象。如果需要身份快照，由应用在工厂内复制所需字段；返回 Promise 也只会被当作上下文值，不会等待它。
- `transformHeaders(headers, request)` 在配置就绪后执行，此时 `request.context` 已可用，`request.headers` 尚未生成。回调提供默认凭据和语言；请求级 `common` → 方法级 → 直接字段依次覆盖，大小写不敏感，显式空字符串、`null`、`false`、`undefined` 保留各自语义。
- `transformResponse(response, request)` 与 `transformError(error, request)` 读取该订阅的上下文及只读请求头快照。`headers` 的字段和多值数组均不可修改，采用 Axios 的标准字段名形式，例如 `Authorization`、`Accept-Language`。
- 请求解析成功后已有“库交给 Axios 的头”。成功响应或携带 `config` 的 Axios 错误到达时，快照更新为其实际 `config.headers`，因此结果转换能看到 Axios 序列化或请求拦截器产生的字段；不伪称能读取浏览器/代理自行添加的线缆级 Header。响应拦截器应保留 Axios 的 `config`，避免丢失传输事实。
- 早于传输结果的取消，使用已解析的头；在配置等待或 Header 转换完成前取消则没有头。自定义 Axios 拦截器仍按 Axios 规则运行；与凭据相关的动态默认值应放在 `createContext` / `transformHeaders` 中，这样内部重试才会复用已捕获状态。
- 网络去重只共享传输结果；每个订阅分别执行转换并持有自己的业务上下文。上下文不会被序列化、传给 Axios 或加入去重 key；会改变网络语义的最终请求头继续参与去重。

旧的单参数回调、无上下文选项、`HttpClientOptions<F, E>`、`withTypes<M>()` 和所有请求方法的 `T/D` 泛型保持可用。内联选项从 `createContext` 推导 `C`；映射模式也可以使用 `withTypes<M, C>()` 显式指定。提取选项时可用 `satisfies HttpMappedClientOptions<M, C>` 保留具体回调和映射关系。`HttpClientOptions` 追加第三个泛型 `C`，`HttpResponseTransformer<C>`、`HttpErrorTransformer<C>` 和 `HttpTypedClientFactory<M, C>` 也支持指定上下文。

成功回调仍允许按接口契约标注具体响应体类型，但上下文参数必须接受工厂可能返回的全部值，不能把可选字段自行标注为必填字段。

#### 初始化和失败行为

| 阶段 | 上下文和 Header | 错误通道与重试 |
| --- | --- | --- |
| 客户端构造选项非法（含非函数 createContext） | 不创建上下文 | 同步抛错，保持原构造校验行为 |
| 请求参数非法且没有 transformError | 不创建上下文，也没有可订阅请求 | 调用请求方法时同步抛错，兼容旧 API |
| 请求参数非法且配置了 transformError | 订阅时仍先创建上下文；headers 为 undefined | 一次 config 错误转换，不加载配置或发请求 |
| createContext 抛错 | context、headers 都为 undefined | 订阅的 config 错误；配置了 transformError 则交给它一次；不内部重试 |
| 配置加载最终失败 | 保留上下文，headers 为 undefined | 配置按既有规则重试，结束后只转换一次 |
| Header 转换失败 | 保留上下文，headers 为 undefined | config 错误，只转换一次，不网络重试 |
| 网络最终失败或成功转换失败 | 保留上下文和已确定的请求头 | 一次错误转换；业务转换失败不重发网络请求 |
| transformError 自身失败 | 保留原始 cause | 直接进入 Observable.error，不递归转换或重试 |
| 主动 unsubscribe | 不执行最终错误转换 | 保持原有取消、共享请求和资源释放语义 |

如果请求参数错误与上下文工厂错误同时存在，订阅先遇到的上下文工厂错误进入转换。已取消的 `signal` 仍先创建上下文，然后遵循现有取消通道；未配置工厂时 `context` 为 `undefined`。工厂可选且可能失败，因此公开类型始终保留 `C | undefined`，应用回调必须处理缺失情况。

#### 可编译的应用示例

完整示例见 [rxjs-context.ts](./rxjs-context.ts)。文件直接导出 `RxHttpClient.withTypes<ApiResponseTypeMap, RequestContext>().create(...)` 产生的 `httpUtils`，可以直接调用：

```ts
httpUtils.get<User>("/user");
httpUtils.post<LoginResult, LoginRequest>("/login", body, {
  headers: { Authorization: null },
});
```

示例把会话版本、凭据快照和语言放在应用上下文中；成功和错误回调先丢弃旧会话结果，再同时核对当前缓存与实际 `Authorization`，决定是否允许处理 401 或 token 续期。显式使用其他凭据或屏蔽凭据的请求无权修改当前凭据缓存。登录、退出、切换身份必须推进应用会话版本；token 续期保持版本并核对旧 token，以防并发旧响应覆盖新 token。以上都是示例应用策略，公共库不包含登录、token 或国际化业务。

`pnpm test:consumer` 会将同一示例放入工作区外，以真实打包产物的 ESM/CJS 声明进行 NodeNext、`skipLibCheck: false` 编译检查，不依赖源码别名或请求方法包装。

### 固定返回类型与异步展开

未配置响应或错误转换时，`get<T>` 等方法继续返回 `Observable<HttpSuccess<T>>`。转换函数返回 `User`、`Promise<User>` 或 `Observable<User>` 时，发值类型都是 `User`；`Promise<Observable<User>>` 也会展开。成功和错误转换分别推导，再合并为最终 Observable 的发值类型。普通数组仍作为单个业务值发出。

例如，成功转换返回 `User`，错误转换返回 `{ message: string }`，则最终类型为 `Observable<User | { message: string }>`。仅配置错误转换时，成功分支仍为 `HttpSuccess<T>`。`request`、`get`、`post`、`put`、`patch`、`delete` 采用相同规则，`post<T, D>` 等方法的 `D` 继续约束请求体。

两种转换都位于网络重试之外，转换失败不会重新发送请求。去重只共享传输结果，每个订阅者分别执行成功或错误转换。Observable 保留所有发值，空流直接完成；若成功转换流发值后才失败，错误转换可以继续发出恢复结果，先前的值不会重放。只展开回调返回的流，流中的值保持原样。已启动的用户 Promise 自身不能因退订而中止，但退订后不会再向该订阅者发值。

### 使用 Observable 转换

```ts
import { type Observable, map, of } from "rxjs";
import { RxHttpClient, type HttpSuccess } from "@axutils/common/rxjs/http";

interface ApiUser {
  user_id: number;
  user_name: string;
}

interface User {
  id: number;
  name: string;
}

const client = new RxHttpClient({
  transformHeaders: (headers) => ({ ...headers, test: "123" }),
  transformResponse: (result: HttpSuccess<ApiUser>): Observable<User> =>
    of(result).pipe(
      map(({ data }) => ({ id: data.user_id, name: data.user_name })),
    ),
});

// 自动展开转换流，结果是 Observable<User>
client.get<ApiUser>("/user").subscribe((user) => console.log(user.name));
```

回调内可以使用 `map`、`switchMap` 等 RxJS 操作符。实例级 `transformError` 接收请求最终失败及成功转换异常，无需在每个请求后重复添加 `catchError`。

未标注参数的回调收到 `HttpSuccess<unknown>`，其中 `code`、`success` 和 `error` 有明确类型。读取业务字段时，在回调参数上声明响应体类型，或先校验 `unknown`；这不会自动校验服务器返回的数据。

内联构造可以直接推导两个回调，无需手写客户端泛型：

```ts
const client = new RxHttpClient({
  transformResponse: (result: HttpSuccess<ApiUser>) => result.data.user_name,
  transformError: (error) => of({ message: error.error.message }),
});
// Observable<string | { message: string }>
const result$ = client.get<ApiUser>("/user");
```

将选项保存为变量时，使用 `satisfies` 保留回调是否存在及其具体类型。只有成功转换时仍可用 `satisfies HttpClientOptions`；两个回调都需要时，可写成下面的形式。第二个泛型默认为 `undefined`，所以已有 `HttpClientOptions<F>` 的含义保持不变：

```ts
import {
  type HttpClientOptions,
  type HttpRequestError,
  type HttpSuccess,
  RxHttpClient,
} from "@axutils/common/rxjs/http";

const success = (result: HttpSuccess<{ name: string }>) => result.data.name;
const failure = (error: HttpRequestError) => ({ message: error.error.message });
const options = {
  transformResponse: success,
  transformError: failure,
} satisfies HttpClientOptions<typeof success, typeof failure>;

const client = new RxHttpClient(options);
// Observable<string | { message: string }>
const result$ = client.get("/user");
```

直接给变量标注宽泛选项类型会丢失具体回调信息；若回调字段在变量类型中可选，结果也会保留未配置时的分支。`HttpResponseResult<T, Options, Map>` 可提取最终发值类型，第三个映射参数可以省略。

### 将单次请求的泛型映射到业务结果

TypeScript 无法把任意泛型回调重新应用到每次请求的 `T`。仅传入 `<T>(result: HttpSuccess<ApiResult<T>>) => result.data`，仍可能推导成 `ApiResult<unknown>`。使用 `RxHttpClient.withTypes<Map>()` 显式声明映射，可以保留 `get<UserVO>` 与 `ApiResult<UserVO>` 的关系。

映射接口继承 `HttpResponseTypeMap`，通过 `this["data"]` 引用单次请求的 `T`：

| 字段 | 含义 |
| --- | --- |
| `data` | `get<T>`、`post<T, D>` 等请求中的 `T`；保留基接口的 `unknown`，由请求实例化 |
| `body` | 接口原始响应体；成功回调接收 `HttpSuccess<body>` |
| `result` | 成功回调展开后的发值类型 |
| `error` | 错误回调展开后的发值类型 |

`withTypes<Map>()` 返回 `HttpTypedClientFactory<Map>`；其 `.configure(options)` 创建同步配置实例，`.create(factory, options)` 创建异步配置实例。映射声明一次即可，各请求方法共享同一套类型关系。两个回调都要对任意 `T` 满足声明的输入和输出关系；不需要给每个接口增加断言。

映射字段只约束实际配置的回调：未传 `transformResponse` 时，成功分支仍为 `HttpSuccess<body>`；未传 `transformError` 时，不增加错误恢复结果。成功与错误映射不同，则返回两者的联合。映射模式的回调返回值由 `HttpTransformValue<T>` 描述，支持普通值、`Observable<T>` 以及 `PromiseLike<普通值 | Observable<T>>`；这里的普通值不包含 Promise/thenable 或 Observable。如果业务值本身就是异步容器，需要返回 `of(value)`，让它作为一个业务值发出。

### 完整示例：动态 Token 与 `ApiResult<T>`

下面是使用方的 `api.ts`。`ApiResult`、缓存位置和状态码策略均由业务项目定义。示例对 HTTP 200 原样返回响应体，包括业务失败；对 HTTP 201/204 和请求异常生成 `data: null` 的失败结果，使用 HTTP 状态码或 `-1` 作为失败 code。错误体先作为 `unknown` 检查，只保留已验证类型的元数据。

```ts
import { isAxiosError } from "axios";
import { type Observable, of } from "rxjs";
import {
  type HttpMappedClientOptions,
  type HttpRequestError,
  type HttpResponseTypeMap,
  type HttpSuccess,
  RxHttpClient,
} from "@axutils/common/rxjs/http";

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T | null;
  request_id: string;
  timestamp: number;
  signature: string;
}

interface ApiMap extends HttpResponseTypeMap {
  readonly body: ApiResult<this["data"]>;
  readonly result: ApiResult<this["data"]>;
  readonly error: ApiResult<this["data"]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 错误体不能保证含有 T，因此恢复结果始终使用 null，不将未知数据断言为 T。
function failureResult<T>(
  value: unknown,
  code: number,
  message: string,
): ApiResult<T> {
  const metadata = isRecord(value) ? value : {};
  return {
    code,
    message: typeof metadata.message === "string" ? metadata.message : message,
    data: null,
    request_id: typeof metadata.request_id === "string" ? metadata.request_id : "",
    timestamp:
      typeof metadata.timestamp === "number" && Number.isFinite(metadata.timestamp)
        ? metadata.timestamp
        : Date.now(),
    signature: typeof metadata.signature === "string" ? metadata.signature : "",
  };
}

const options = {
  baseUrl: "/api",
  retryCount: 3,
  retryDelay: 100,
  timeout: 10_000,
  transformHeaders: (headers) => {
    // 每次订阅时读取；之后更新缓存，下一次订阅即可使用最新 Token。
    const token = localStorage.getItem("access_token");
    return {
      ...headers,
      Authorization: token ? `Bearer ${token}` : null,
    };
  },
  transformResponse: <T>(response: HttpSuccess<ApiResult<T>>): Observable<ApiResult<T>> =>
    of(
      response.code === 200
        ? response.data
        : failureResult<T>(response.data, response.code, `HTTP ${response.code}`),
    ),
  transformError: <T>(error: HttpRequestError): Observable<ApiResult<T>> => {
    const cause = error.error.cause;
    const body: unknown = isAxiosError<unknown>(cause) ? cause.response?.data : undefined;
    return of(failureResult<T>(body, error.code || -1, error.error.message));
  },
} satisfies HttpMappedClientOptions<ApiMap>;

export const api = RxHttpClient.withTypes<ApiMap>().configure(options);
```

若基础地址需要异步初始化，可在同一模块中使用 `.create` 替代 `.configure`，复用 `options`：

```ts
export const api = RxHttpClient.withTypes<ApiMap>().create(
  () => of({ baseUrl: "/api" }),
  options,
);
```

调用方直接导入客户端，不再包装各请求方法：

```ts
import { type Observable } from "rxjs";
import { api, type ApiResult } from "./api";

interface UserVO {
  id: number;
  name: string;
}

interface LoginVO {
  accessToken: string;
}

interface LoginDTO {
  username: string;
  password: string;
}

const user$: Observable<ApiResult<UserVO>> = api.get<UserVO>("/users/me");
const login$: Observable<ApiResult<LoginVO>> = api.post<LoginVO, LoginDTO>(
  "/login",
  { username: "Ada", password: "example-password" },
);

user$.subscribe((result) => console.log(result.data?.name, result.request_id));
login$.subscribe((result) => console.log(result.data?.accessToken));

// 请求级 Header 始终优先，同名字段大小写不敏感。
api.get<UserVO>("/users/me", {
  headers: { authorization: "Bearer request-token" },
}).subscribe();
```

这个例子面向浏览器，展示不使用上下文的旧 API；它在配置就绪后读取 token，没有实现会话隔离。需要跨配置等待保持身份、处理 401 或续期时，使用前面的 [上下文示例](./rxjs-context.ts)。SSR 项目应从当前应用请求的作用域捕获凭据。映射不校验服务器实际数据；HTTP 200 的 `ApiResult<T>` 仍基于项目的接口契约，需要运行时校验时应在成功回调中完成。错误回调可根据 `error.error.kind` 区分超时、取消等场景；修改业务失败码、通知或跳转策略也由使用方完成。

## 结果和错误

普通实例未配置 `transformResponse` 时，成功请求 Observable 的 `next` 通道发出 `HttpSuccess<T>`：`{ code, success: true, data, error: null }`，`code` 是 HTTP 状态码。映射实例对应 `HttpSuccess<Map 中的 body>`。

普通模式的 `T` 表示原始响应体；映射模式的 `T` 则通过映射中的 `body` 决定原始响应体，例如上例的 `T` 是 `UserVO`，原始响应体是 `ApiResult<UserVO>`。这些声明不会对实际数据做结构校验。处理不可信响应时可使用 `unknown`，在业务边界校验后再使用字段。

错误按发生阶段处理：

- 构造客户端或调用配置工厂入口时，非法选项仍同步抛出 `TypeError`，例如 `timeout: -1` 或传入非函数的转换器。此时客户端尚未建立，实例级错误回调不会执行。
- 请求方法会在调用时浅复制并校验参数。没有 `transformError` 时，非法参数同步抛出 `TypeError`，订阅的 `error` 回调接不到它，需要在调用处用 `try/catch`。配置了 `transformError` 时，方法返回冷 Observable；校验异常记录为 `config` 错误，直到订阅才调用错误转换，也不会初始化配置或发送请求。所有便捷方法的选项校验都经过这个边界。
- 订阅后的配置初始化最终失败、请求头转换失败属于 `config` 错误。HTTP 4xx/5xx、网络、超时及显式取消按各自分类处理。`transformResponse` 抛错、Promise 拒绝或 Observable 发出错误，也会进入同一错误转换边界。
- 存在 `transformError` 时，以上最终错误交给回调，回调结果通过 `next` 通道发出。未配置时仍通过 `error` 通道发出 `HttpRequestError`。转换发生在重试结束之后，成功或错误转换报错都不会重新发送请求。
- `transformError` 自身抛错、Promise 拒绝或 Observable 发出错误时，通过 `error` 通道发出 `kind: "unknown"` 的 `HttpRequestError`，`error.cause` 保留转换器自身的原始异常，不会递归调用错误转换器。恢复流期间发生显式取消则按下文的取消规则处理。

`HttpRequestError` 包含 `code`、`success: false`、`data: null` 和 `error`。`error.kind` 是 `config`、`http`、`network`、`timeout`、`cancel` 或 `unknown`；没有 HTTP 响应时 `code` 为 `0`；原始 Axios/配置错误保存在 `error.cause`。

```ts
import {
  HttpRequestError,
  RxHttpClient,
} from "@axutils/common/rxjs/http";

try {
  const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
  client.get<{ id: number }>("/users/1").subscribe({
    next: (result) => console.log(result.code, result.data.id),
    error: (error: unknown) => {
      if (error instanceof HttpRequestError) {
        console.error(error.error.kind, error.code, error.error.cause);
      } else {
        console.error("未预期的订阅错误", error);
      }
    },
  });
} catch (error) {
  if (error instanceof TypeError) {
    console.error("参数校验失败", error.message);
  } else {
    throw error;
  }
}
```

### `new HttpRequestError(code, error)`

错误类构造函数通常由客户端内部调用。业务代码用 `instanceof` 判断即可；如需创建自定义统一错误，可传入状态码和 `HttpErrorInfo`：

```ts
import { HttpRequestError } from "@axutils/common/rxjs/http";

const error = new HttpRequestError(503, {
  kind: "http",
  message: "服务暂不可用",
  cause: new Error("upstream"),
});
console.log(error.code, error.success, error.data); // 503 false null
```

## `client.request<T, D>(config)`

创建通用请求 Observable，默认返回 `Observable<HttpSuccess<T>>`；成功和错误转换共同决定最终发值类型，显式映射模式将 `T` 应用到 `body`、`result` 和 `error`。输入必须有字符串 `url` 和 `method`，请求配置只做浅复制。网络请求、异步配置和重试都延迟到订阅时执行。

请求级 `HttpRequestOptions` 可覆盖 `params`、`headers`、`timeout`、`retryCount`、`retryDelay`、`retryable`、`retryNonIdempotent`、`dedupe`、`cancelOnNoSubscribers`、`dedupeKey` 和 `signal`。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.request<{ ok: boolean }, { name: string }>({
  method: "POST",
  url: "/users",
  data: { name: "Ada" },
  params: { dryRun: true },
}).subscribe({
  next: (result) => console.log(result.data.ok),
  error: console.error,
});
```

HEAD 和 OPTIONS 通过同一方法：

```ts
client.request({ method: "HEAD", url: "/health" }).subscribe();
client.request({ method: "OPTIONS", url: "/users" }).subscribe();
```

## `client.get<T>(url, options?)`

创建 GET Observable；调用本身不发网络请求，订阅后才执行。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.get<{ id: number }>("/users/1", {
  params: { include: "roles" },
}).subscribe((result) => console.log(result.data.id));
```

## `client.post<T, D>(url, data?, options?)`

创建 POST Observable；`data` 存在时作为 request body。POST 默认不重试，显式设置 `retryNonIdempotent: true` 才允许重试。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.post<{ id: number }, { name: string }>(
  "/users",
  { name: "Ada" },
  { retryNonIdempotent: true },
).subscribe((result) => console.log(result.data.id));
```

## `client.put<T, D>(url, data?, options?)`

创建 PUT Observable；请求体可选，重试边界与 POST 相同。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.put<{ ok: boolean }, { name: string }>("/users/1", {
  name: "Ada Lovelace",
}).subscribe((result) => console.log(result.data.ok));
```

## `client.patch<T, D>(url, data?, options?)`

创建 PATCH Observable；请求体可选，默认不重试，显式允许非幂等重试后才会重试。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.patch<{ updated: boolean }, { enabled: boolean }>("/users/1", {
  enabled: true,
}).subscribe((result) => console.log(result.data.updated));
```

## `client.delete<T>(url, options?)`

创建 DELETE Observable。该便捷方法不接收单独的 body；需要请求体时使用 `request({ method: "DELETE", data })`。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.delete("/users/1").subscribe((result) => console.log(result.success));
```

## 去重、共享和取消订阅

默认情况下，相同 method、完整 URL、params、处理后的 headers、data、timeout 和重试选项的未完成稳定请求只执行一次，订阅者共享同一个原始成功结果或错误实例。成功和错误转换在共享层之外，每个订阅者分别执行，恢复结果不会被缓存并跨请求复用。请求完成、失败或取消后不保留响应缓存。

主动 `unsubscribe()` 会释放当前订阅及其成功或错误转换流，不会调用 `transformError`，也不会产生合成结果。默认 `cancelOnNoSubscribers: false`：最后一个订阅者取消订阅时，底层请求仍继续执行并可被后续相同请求复用。设置为 `true` 后，最后一个订阅者离开会中止底层 Axios 请求及重试等待；使用去重时，只有所有订阅者都取消才会中止共享请求。传入 `signal` 的请求始终不自动去重，以保证调用方独立取消。

FormData、流、Map、Set、类实例和循环引用等无法稳定 JSON 序列化的值默认关闭自动去重；可使用 `dedupeKey` 声明业务身份。显式 key 仍会保留 method、完整 URL 和重试选项等稳定维度，不会仅因 key 相同就合并不同 URL。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
const request$ = client.get("/profile", {
  params: { tenant: "demo" },
  cancelOnNoSubscribers: true,
});
const first = request$.subscribe((result) => console.log(result.data));
const second = client.get("/profile", {
  params: { tenant: "demo" },
  cancelOnNoSubscribers: true,
}).subscribe();
first.unsubscribe(); // second 仍在，底层请求继续
second.unsubscribe(); // 最后一个订阅者离开，触发 abort
```

## 重试和 `AbortSignal`

默认 GET、HEAD、OPTIONS 对网络错误、超时、429 和 5xx 重试；4xx（429 除外）和取消不重试。对于 RxJS 实现，明确的 Axios 网络错误和自定义 adapter 抛出的普通 `Error` 会分类为 network；配置错误会分类为 config。POST、PUT、PATCH、DELETE 只有 `retryNonIdempotent: true` 才允许重试。

`signal` 覆盖异步配置、retryDelay、网络请求和成功转换流。订阅前已取消、等待中取消或成功转换流进行中取消，均产生 `kind: "cancel"` 的 `HttpRequestError`。没有 `transformError` 时走错误通道；有该回调时，可以将取消转换成普通结果，取消的 signal 不会立即抑制这条恢复流。

如果先因其他异常进入错误恢复流，之后才调用 `abort()`，客户端会释放恢复流并通过错误通道发出 `kind: "cancel"`，不会第二次调用 `transformError`。因此显式取消与主动取消订阅不同：前者是可转换的请求事件，后者仅释放当前订阅，不合成任何结果。已有用户 Promise 的计算不能被客户端强制终止，但流解除订阅后不会继续接收其结果。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
const controller = new AbortController();
client.get("/slow", { signal: controller.signal }).subscribe({
  error: (error) => console.log(error.error.kind), // cancel
});
controller.abort();
```
