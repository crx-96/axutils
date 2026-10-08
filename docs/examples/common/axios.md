# `@axutils/common` Axios Promise HTTP 客户端

本文档对应 `packages/common/src/axios/http`，公开路径为 `@axutils/common/axios/http`。它只依赖 Axios Promise，不会从该模块加载 RxJS；安装：

```bash
pnpm add @axutils/common axios safe-stable-stringify spark-md5
```

`axios`、`safe-stable-stringify` 和 `spark-md5` 都是可选 peer 依赖，只有使用此 HTTP 子路径才需要安装。客户端默认使用 Axios 实例，也可以注入调用方配置好的实例。

## 公开导出与所有合法使用方式

`@axutils/common/axios/http` 是 `package.json#exports` 中唯一的 Axios Promise HTTP 入口。它不是根入口的一部分，`PromiseHttpClient` 和本节类型只能从该精确子路径取得。该子路径静态使用 `axios`、`safe-stable-stringify` 和 `spark-md5`：前者提供 HTTP 实现和 Axios 类型，后两者用于请求去重键的稳定序列化与 MD5 压缩。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common/axios/http` | `PromiseHttpClient`（`create`、`request`、`get`、`post`、`put`、`patch`、`delete`）、`PromiseHttpRequestError` | `PromiseHttpMethod`、`PromiseHttpClientConfig`、`PromiseHttpClientOptions`、`PromiseHttpConfigFactory`、`PromiseHttpRequestOptions`、`PromiseHttpRequestConfig`、`PromiseHttpSuccess`、`PromiseHttpFailure`、`PromiseHttpResult`、`PromiseHttpErrorKind`、`PromiseHttpErrorInfo`、`PromiseHttpResponseTransformer`、`PromiseHttpResponseResult` | `axios`、`safe-stable-stringify`、`spark-md5` |
| `@axutils/common` (`.`) | 不导出 Axios HTTP API | 不导出上述类型 | 根入口无第三方运行时依赖 |

ESM 使用精确子路径导入全部运行时 API：

```ts
import {
  PromiseHttpClient,
  PromiseHttpRequestError,
} from "@axutils/common/axios/http";
import type {
  PromiseHttpClientConfig,
  PromiseHttpClientOptions,
  PromiseHttpConfigFactory,
  PromiseHttpErrorInfo,
  PromiseHttpErrorKind,
  PromiseHttpFailure,
  PromiseHttpMethod,
  PromiseHttpRequestConfig,
  PromiseHttpRequestOptions,
  PromiseHttpResponseResult,
  PromiseHttpResponseTransformer,
  PromiseHttpResult,
  PromiseHttpSuccess,
} from "@axutils/common/axios/http";
```

CJS 使用同一精确子路径的 `require`：

```js
const {
  PromiseHttpClient,
  PromiseHttpRequestError,
} = require("@axutils/common/axios/http");
```

类型中引用 Axios 配置的 `PromiseHttpClientOptions`、`PromiseHttpRequestOptions` 和 `PromiseHttpRequestConfig` 仍然只从本子路径导入；它们不会被根入口重新导出。UMD 构建把 Axios、`safe-stable-stringify` 和 `spark-md5` 一并打包，浏览器侧使用全局对象：

```js
const client = new AxutilsCommon.PromiseHttpClient({
  baseUrl: "https://api.example.com",
});
client.get("/health").then((result) => console.log(result.code));
```

`PromiseHttpMethod` 支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS` 的大小写写法。当前客户端公开的便捷方法是 `request`、`get`、`post`、`put`、`patch`、`delete`；没有单独的 `head` 或 `options` 方法，需要通过 `request` 指定对应 method。

## `new PromiseHttpClient(options?, configFactory?)`

创建同步配置客户端。构造函数只校验并保存配置，不发起网络请求，也不会调用配置工厂。默认配置：`baseUrl: ""`、`retryCount: 3`、`retryDelay: 0`、`dedupe: true`、`retryable: true`、`retryNonIdempotent: false`。

关键配置：

- `baseUrl`：相对 URL 的基础地址；绝对 URL 不拼接它。
- `retryCount`：一次请求允许的总尝试次数，`1` 表示不重试，范围 `1..100`。
- `retryDelay`：每次重试前等待的毫秒数，范围 `0..2_147_483_647`。
- `timeout`：Axios 超时时间，非负有限数且不超过 `2_147_483_647`；省略时使用 Axios 默认值。
- `dedupe`：是否自动合并同一时刻的稳定请求，默认 `true`。
- `retryable`：是否允许请求重试，默认 `true`。
- `retryNonIdempotent`：是否允许 POST/PUT/PATCH/DELETE 重试，默认 `false`。
- `axiosInstance`：可选 Axios 实例，必须提供 `request` 方法。
- `transformHeaders`：同步处理请求头副本，适合读取最新 token；请求级 headers 优先。
- `transformResponse`：处理统一成功结果，支持同步或 Promise 返回值，并自动推导结果类型。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({
  baseUrl: "https://api.example.com",
  retryCount: 3,
  retryDelay: 100,
  timeout: 10_000,
});
```

## `PromiseHttpClient.create(factory, options?)`

静态工厂，用异步配置创建客户端。`factory` 可以同步返回部分配置，也可以返回 Promise；不会在 `create` 时调用，只在第一次请求时初始化。并发首请求共享一次初始化；成功配置会缓存，失败不会缓存，后续请求可以再次初始化。初始化重试次数使用同步 `options.retryCount`，工厂返回配置中的 `retryCount` 只影响后续请求。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = PromiseHttpClient.create(
  async () => ({
    baseUrl: await Promise.resolve("https://api.example.com"),
    retryCount: 3,
  }),
  { retryCount: 2, retryDelay: 100 },
);
```

## 统一处理请求头和成功结果

`constructor` 的第一个参数和 `create(factory, options)` 的第二个参数都支持这两个字段。它们属于客户端选项，不放在配置工厂返回的 `PromiseHttpClientConfig` 中。

```ts
import { PromiseHttpClient, type PromiseHttpSuccess, type PromiseHttpClientOptions } from "@axutils/common/axios/http";

interface UserResponse {
  user: { id: number; name: string };
}

let token = "initial-token";
const options = {
  transformHeaders: (headers) => ({
    ...headers,
    Authorization: `Bearer ${token}`,
  }),
  transformResponse: (result: PromiseHttpSuccess<UserResponse>) => result.data.user,
} satisfies PromiseHttpClientOptions;

const client = new PromiseHttpClient(options);
const configured = PromiseHttpClient.create(async () => ({ baseUrl: "/api" }), options);
// 两者均推导为 Promise<{ id: number; name: string }>
const user = await client.get("/user");
console.log(user.name, (await configured.get("/user")).id);

token = "refreshed-token";
await client.get("/user", {
  headers: { authorization: "Bearer request-token" },
}); // 此请求使用 request-token
```

### 请求头优先级与执行时机

- `transformHeaders` 收到当前请求 headers 的副本；未传 headers 时为空对象，`common` 和当前方法分组会展开。可以返回普通 headers 对象或 `AxiosHeaders`。
- 回调在每次调用请求方法后、配置解析完成后执行，网络重试沿用本次处理结果。构造客户端不会执行回调。
- 合并顺序为 Axios 实例默认 headers → 回调结果 → 请求级 headers。同名 header 不区分大小写，请求级 `false`、`null` 等屏蔽值也保留。
- 回调输入不包含 Axios 实例默认 headers；未提供的字段由配置解析时的 Axios 默认头补齐。默认头、回调结果和请求级字段合并后固定到本次请求，内部重试不重新读取其值，也不加入期间新增的默认字段。要屏蔽默认字段，可在返回值中将它设为 `false` 或 `null`。
- 回调中的对象和多值数组修改不会影响调用方原 headers。请求级字段始终最后覆盖，所以回调不能删除或改写调用方明确指定的同名字段。
- 最终 headers（包括 Axios 实例默认头）在自动去重前参与身份计算；不同 token 的请求会独立执行。使用显式 `dedupeKey` 且请求参数不可稳定序列化时，仍由调用方负责 key 的业务身份。

### 返回类型推导

没有 `transformResponse` 时，`get<T>` 等方法继续返回 `Promise<PromiseHttpSuccess<T>>`。传入后返回处理函数的结果；例如返回 `string` 就得到 `Promise<string>`，返回 `Promise<User>` 则得到 `Promise<User>`。`request`、`get`、`post`、`put`、`patch`、`delete` 都采用相同规则。

回调只处理成功结果，网络重试结束后才执行；去重时底层请求共享，每个调用方分别转换。异步转换等待期间仍可使用 `signal` 取消接收结果，但已启动的用户 Promise 自身不会被中止。

### 使用 Promise 转换

```ts
import { PromiseHttpClient, type PromiseHttpSuccess } from "@axutils/common/axios/http";

interface ApiUser {
  user_id: number;
  user_name: string;
}

interface User {
  id: number;
  name: string;
}

const client = new PromiseHttpClient({
  transformHeaders: (headers) => ({ ...headers, test: "123" }),
  transformResponse: async (result: PromiseHttpSuccess<ApiUser>): Promise<User> => ({
    id: result.data.user_id,
    name: result.data.user_name,
  }),
});

// 自动等待转换完成，get 返回 Promise<User>，await 后是 User
const user = await client.get<ApiUser>("/user");
console.log(user.name);
```

回调内可以使用 `await` 完成异步业务处理，也可以直接返回一个 Promise。`create(factory, options)` 的第二个参数接受同样的处理函数。此客户端按 Promise 语义展开返回值；如需使用 RxJS 转换流，可在回调中通过 `firstValueFrom` 或 `lastValueFrom` 将其转为 Promise。

未标注参数的回调收到 `PromiseHttpSuccess<unknown>`，其中 `code`、`success` 和 `error` 有明确类型。读取业务字段时，在回调参数上声明响应体类型，或先校验 `unknown`；这不会自动校验服务器返回的数据。

将选项保存为变量时，使用上例的 `satisfies PromiseHttpClientOptions` 保留处理函数的具体返回类型。直接标注宽泛的 `PromiseHttpClientOptions` 会丢失具体返回类型，结果只能推导为 `unknown`。可选处理函数用 `PromiseHttpClientOptions<typeof transformResponse>` 描述，结果会保留转换类型与 `PromiseHttpSuccess<T>` 的联合。导出的 `PromiseHttpResponseTransformer` 和 `PromiseHttpResponseResult<T, Options>` 可用于声明处理函数和提取结果类型。

TypeScript 无法把任意泛型函数重新应用到每次请求的 `T`：`<T>(result: PromiseHttpSuccess<T>) => result.data` 的返回类型会推导为 `unknown`。需要统一拆业务结构时，使用上面的具体响应体类型。请求方法的 `T` 始终表示原始响应体；传入处理函数后，最终结果由该函数决定。

处理函数本身类型错误会在构造客户端时同步抛出 `TypeError`。`transformHeaders` 必须同步返回 headers 对象，执行失败走统一错误通道，`error.kind` 为 `config`，且不会发网络请求；`transformResponse` 抛错或 Promise 拒绝也走统一错误通道，原始错误保存在 `error.cause`，不会触发网络重试。

## 请求结果和错误

未配置 `transformResponse` 时，成功请求的 Promise resolve 为 `PromiseHttpSuccess<T>`：`{ code, success: true, data, error: null }`，其中 `code` 是 HTTP 状态码，不读取后端响应体中的业务 code。

类型参数 `T` 只声明预期的响应数据类型，不会按 `T` 对实际数据做结构校验或转换。调用方需要确认 `result.data` 的结构；处理不可信响应时可使用 `unknown`，在业务边界校验后再使用字段。

错误按发生阶段处理：

- 构造客户端、调用 `create` 或请求方法时，参数校验可能同步抛出 `TypeError`；例如 `timeout: -1`。超过 Promise 客户端的重试次数或计时上限时抛出 `RangeError`。请求校验发生在返回 Promise 前，单独使用 `client.get(...).catch(...)` 接不到这些同步异常。
- 返回 Promise 后，异步配置初始化失败、请求执行失败及请求取消通过 rejection 传递，错误值为 `PromiseHttpRequestError`。用 `try` 包住客户端创建与 `await client.get(...)`，可以处理两个阶段的错误。

`PromiseHttpRequestError` 暴露：

- `code`：HTTP 状态码；没有响应时为 `0`。
- `success`：固定 `false`。
- `data`：固定 `null`。
- `error.kind`：`config`、`http`、`network`、`timeout`、`cancel` 或 `unknown`。
- `error.message`：统一错误消息。
- `error.cause` / `cause`：Axios、配置工厂或其他原始错误。

```ts
import {
  PromiseHttpClient,
  PromiseHttpRequestError,
} from "@axutils/common/axios/http";

try {
  const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
  const result = await client.get<{ id: number }>("/users/1");
  console.log(result.code, result.data.id);
} catch (error) {
  if (error instanceof PromiseHttpRequestError) {
    console.error(error.error.kind, error.code, error.error.cause);
  } else if (error instanceof TypeError || error instanceof RangeError) {
    console.error("参数校验失败", error.message);
  } else {
    throw error;
  }
}
```

### `new PromiseHttpRequestError(code, error)`

错误类构造函数通常由客户端内部调用；业务代码只需要用 `instanceof` 判断。若要构造与客户端一致的错误，可以传入状态码和 `PromiseHttpErrorInfo`：

```ts
import { PromiseHttpRequestError } from "@axutils/common/axios/http";

const error = new PromiseHttpRequestError(503, {
  kind: "http",
  message: "服务暂不可用",
  cause: new Error("upstream"),
});
console.log(error.code, error.success, error.data); // 503 false null
```

## `client.request<T, D>(config)`

发起通用请求，默认返回 `Promise<PromiseHttpSuccess<T>>`；配置 `transformResponse` 后返回其处理结果。调用时立即开始配置解析和请求。`config` 必须包含字符串 `url` 和 `method`；`data` 是请求体，`params` 交给 Axios。请求头会合并实例默认值、转换回调和请求级覆盖，生成参与去重且在内部重试间复用的快照；显式将 `common` 或当前方法分组设为 `null`、`false` 或 `undefined` 会屏蔽该默认组。其余输入做浅复制，请求头及多值数组独立复制，不会修改调用方的对象。

可覆盖的 `PromiseHttpRequestOptions`：`params`、`headers`、`timeout`、`retryCount`、`retryDelay`、`retryable`、`retryNonIdempotent`、`dedupe`、`dedupeKey`、`signal`。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.request<{ ok: boolean }, { name: string }>({
  method: "POST",
  url: "/users",
  data: { name: "Ada" },
  headers: { "content-type": "application/json" },
  params: { dryRun: true },
});
console.log(result.data.ok);
```

使用同一方法发起 HEAD 和 OPTIONS：

```ts
const head = await client.request({ method: "HEAD", url: "/health" });
const options = await client.request({ method: "OPTIONS", url: "/users" });
console.log(head.code, options.code);
```

## `client.get<T>(url, options?)`

发起 GET 请求，默认返回 `Promise<PromiseHttpSuccess<T>>`，配置 `transformResponse` 后返回其处理结果；`options` 可覆盖 params、headers、timeout、重试、去重和 signal 等请求配置。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.get<{ id: number }>("/users/1", {
  params: { include: "roles" },
});
console.log(result.data.id);
```

## `client.post<T, D>(url, data?, options?)`

发起 POST 请求；`data` 存在时作为 Axios request body，不传则不写入 `data` 字段。POST 默认不重试，除非请求或客户端显式设置 `retryNonIdempotent: true`。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.post<{ id: number }, { name: string }>(
  "/users",
  { name: "Ada" },
  { retryNonIdempotent: true },
);
console.log(result.data.id);
```

## `client.put<T, D>(url, data?, options?)`

发起 PUT 请求，参数和重试边界与 `post` 相同；只有显式允许非幂等重试时才会重试。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.put<{ ok: boolean }, { name: string }>(
  "/users/1",
  { name: "Ada Lovelace" },
);
console.log(result.data.ok);
```

## `client.patch<T, D>(url, data?, options?)`

发起 PATCH 请求；请求体可选，默认不重试，显式 `retryNonIdempotent: true` 后才允许重试。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.patch<{ updated: boolean }, { enabled: boolean }>(
  "/users/1",
  { enabled: true },
);
console.log(result.data.updated);
```

## `client.delete<T>(url, options?)`

发起 DELETE 请求。它不接收独立 `data` 参数；如确实需要带请求体，可使用 `request({ method: "DELETE", data })`。默认不重试，除非显式允许非幂等重试。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const result = await client.delete("/users/1");
console.log(result.success, result.code);
```

## 重试、取消和去重边界

默认只对 GET、HEAD、OPTIONS 的明确 Axios 网络错误（`ERR_NETWORK`）、超时、429 和 5xx 重试；POST、PUT、PATCH、DELETE 只有 `retryNonIdempotent: true` 才允许重试。4xx（429 除外）、取消、普通 `Error` 和无 response 的未知 AxiosError 不重试。`retryCount` 是总尝试次数，不是额外重试次数。

`signal` 同时可以取消 Axios 网络请求、异步配置等待和 `retryDelay`。已 abort 的 signal 会立即 reject 为 `kind: "cancel"`。带 `signal` 的请求始终不参与自动去重。

默认去重只覆盖可稳定 JSON 序列化的 params、headers、data 和请求配置；Map、Set、FormData、流、类实例和循环引用会自动放弃去重。此类请求可以使用 `dedupeKey` 声明业务身份，但 method、完整 URL 和重试选项仍会参与区分。成功、失败或取消后 in-flight key 都会清理，不会缓存响应。

```ts
import { PromiseHttpClient } from "@axutils/common/axios/http";

const client = new PromiseHttpClient({ baseUrl: "https://api.example.com" });
const controller = new AbortController();
const request = client.get("/profile", {
  signal: controller.signal,
  dedupeKey: "profile:demo",
});
controller.abort();
await request.catch((error) => console.log(error.error.kind)); // cancel
```
