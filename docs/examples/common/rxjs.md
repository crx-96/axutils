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
| `@axutils/common/rxjs/http` | `RxHttpClient`（`create`、`request`、`get`、`post`、`put`、`patch`、`delete`）、`HttpRequestError` | `HttpMethod`、`HttpClientConfig`、`HttpClientOptions`、`HttpConfigFactory`、`HttpRequestOptions`、`HttpRequestConfig`、`HttpSuccess`、`HttpFailure`、`HttpResult`、`HttpErrorKind`、`HttpErrorInfo` | `rxjs`、`axios`、`safe-stable-stringify`、`spark-md5` |
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
  HttpFailure,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestOptions,
  HttpResult,
  HttpSuccess,
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

## 结果和错误

成功时请求 Observable 的 `next` 通道发出 `HttpSuccess<T>`：`{ code, success: true, data, error: null }`，`code` 是 HTTP 状态码。

失败时从 `error` 通道发出 `HttpRequestError`，包含 `code`、`success: false`、`data: null` 和 `error`。`error.kind` 是 `config`、`http`、`network`、`timeout`、`cancel` 或 `unknown`；没有 HTTP 响应时 `code` 为 `0`；原始 Axios/配置错误保存在 `error.cause`。

```ts
import {
  HttpRequestError,
  RxHttpClient,
} from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
client.get<{ id: number }>("/users/1").subscribe({
  next: (result) => console.log(result.code, result.data.id),
  error: (error: unknown) => {
    if (error instanceof HttpRequestError) {
      console.error(error.error.kind, error.code, error.error.cause);
    }
  },
});
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

创建通用请求 Observable，返回 `Observable<HttpSuccess<T>>`。输入必须有字符串 `url` 和 `method`，请求配置只做浅复制。网络请求、异步配置和重试都延迟到订阅时执行。

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

默认情况下，相同 method、完整 URL、params、headers、data、timeout 和重试选项的未完成稳定请求只执行一次，订阅者共享同一个成功结果或错误实例。请求完成、失败或取消后不保留响应缓存。

默认 `cancelOnNoSubscribers: false`：最后一个订阅者取消订阅时，底层请求仍继续执行并可被后续相同请求复用。设置为 `true` 后，最后一个订阅者离开会 abort 底层 Axios 请求；使用去重时，只有所有订阅者都取消才触发 abort。传入 `signal` 的请求始终不自动去重，以保证调用方独立取消。

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

`signal` 会同时竞速异步配置、retryDelay 和网络请求。已 abort 的 signal 会从 Observable 的 `error` 通道发出 `HttpRequestError`，其 `error.kind` 为 `cancel`。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({ baseUrl: "https://api.example.com" });
const controller = new AbortController();
client.get("/slow", { signal: controller.signal }).subscribe({
  error: (error) => console.log(error.error.kind), // cancel
});
controller.abort();
```
