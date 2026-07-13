# @axutils/common

`@axutils/common` 是 `axutils` monorepo 中的公共工具子包，当前提供一组常用类型判断、格式校验、运行时平台判断、对象工具、JSON 序列化与 MD5 工具方法，作为后续公共工具集合的基础能力。

## 兼容性

- 包消费运行时：`Node.js >= 14.18.0`

## 安装

```bash
pnpm add @axutils/common
```

如果需要使用 RxJS HTTP 子路径，请按需安装：

```bash
pnpm add @axutils/common rxjs axios safe-stable-stringify spark-md5
```

`@axutils/common/rxjs/http` 不会从包主入口加载；不使用该功能时无需安装这些依赖。

如果需要使用可选子路径依赖，请额外安装对应 peer 依赖：

| 子路径 | 需要安装的方法 | peer 依赖 | 安装命令 |
| --- | --- | --- | --- |
| `@axutils/common/rxjs/http` | `RxHttpClient`、`HttpRequestError` | `rxjs`、`axios`、`safe-stable-stringify`、`spark-md5` | `pnpm add rxjs axios safe-stable-stringify spark-md5` |
| `@axutils/common/object/json` | `jsonStringify`、`jsonStringifySafe` | `safe-stable-stringify` | `pnpm add safe-stable-stringify` |
| `@axutils/common/crypto/md5` | `Md5` | `spark-md5` | `pnpm add spark-md5` |

> `jsonParse`、`jsonParseSafe` 不依赖第三方库；Node 侧 `@axutils/common/node/crypto/md5` 基于 `node:crypto`，均无需额外安装。

## RxJS HTTP 请求

从 `@axutils/common/rxjs/http` 按需导入。请求方法返回 Observable，只有订阅时才会读取异步配置并调用 Axios；Axios 的默认适配器兼容浏览器、Node.js 和 Nuxt SSR。

```ts
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = new RxHttpClient({
  baseUrl: "https://api.example.com",
  retryCount: 3, // 最多三次总尝试，不是额外重试三次
  retryDelay: 100,
  timeout: 10_000,
});

client.get<{ id: number }>("/users/1").subscribe({
  next: (result) => {
    console.log(result.code, result.data);
  },
  error: (error) => {
    console.error(error);
  },
});
```

如果配置需要异步获取，可以使用静态 `create`；工厂返回 Observable，首次请求成功后配置会缓存，失败时默认最多按同步选项的 `retryCount` 尝试三次：

```ts
import { of } from "rxjs";
import { RxHttpClient } from "@axutils/common/rxjs/http";

const client = RxHttpClient.create(
  () => of({ baseUrl: "https://api.example.com", retryCount: 3 }),
  { retryCount: 3 },
);
```

相同 method、完整 URL、params、data、headers、timeout 和重试选项的请求，在上一个请求结束前只会执行一次；订阅者共享同一个成功结果对象或错误实例。默认情况下，即使最后一个订阅者提前取消订阅，仍会等待底层请求结束并复用它，避免重复发起；开启 `cancelOnNoSubscribers` 后才会在最后一个订阅者离开时中止请求。请求结束后不会保留响应缓存，下一次调用会重新请求。传入 `signal` 的请求不会自动去重，以保证每个调用方都能独立取消；`abort()` 也会立即终止异步配置和 `retryDelay` 等尚未发起网络请求的等待阶段。

```ts
const request$ = client.get("/profile", { params: { tenant: "demo" } });
request$.subscribe(renderProfile);
client.get("/profile", { params: { tenant: "demo" } }).subscribe(renderProfile);
```

失败通过 Observable 的 `error` 通道发出 `HttpRequestError`，其 `code` 只表示 HTTP 状态码；无 HTTP 响应时为 `0`，错误分类为 `config`、`http`、`network`、`timeout`、`cancel` 或 `unknown`。默认只对 GET、HEAD、OPTIONS 的网络错误、超时、429 和 5xx 重试，4xx 不重试；可用 `retryable: false` 关闭单个请求的重试。POST、PUT、PATCH、DELETE 默认不重试；只有明确传入 `retryNonIdempotent: true` 时才允许这些方法重试，以避免网络异常但服务端已完成写入时造成重复提交。

```ts
import { HttpRequestError } from "@axutils/common/rxjs/http";

client.get("/profile").subscribe({
  error: (error) => {
    if (error instanceof HttpRequestError) {
      console.log(error.error.kind, error.code, error.error.cause);
    }
  },
});
```

FormData、流、Map、Set 和循环引用等无法稳定 JSON 序列化的请求体默认不会自动去重；需要显式传入相同的 `dedupeKey`。显式 key 只负责声明不稳定请求体的去重身份；method、完整 URL、重试选项以及可稳定序列化的 params、headers 仍会参与区分，因此不同 URL 不会因为复用了同一个 key 而错误合并。如果 params 或 headers 本身也无法稳定序列化，应由 key 一并表达其业务身份：

```ts
client.post("/upload", formData, { dedupeKey: "upload:avatar:1" });
```

如果希望在最后一个订阅者取消时中止底层 Axios 请求，可以开启 `cancelOnNoSubscribers`；默认值为 `false`，取消订阅时只停止当前订阅者接收结果。使用请求去重时，只有所有订阅者都取消后才会触发 abort：

```ts
const request$ = client.get("/search", {
  params: { keyword: "rxjs" },
  cancelOnNoSubscribers: true,
});

const firstSubscription = request$.subscribe(renderResult);
const secondSubscription = request$.subscribe(renderResult);
firstSubscription.unsubscribe(); // 请求继续执行
secondSubscription.unsubscribe(); // 最后一个订阅者离开，取消 Axios 请求
```

写请求或后台任务如果需要在调用方取消订阅后继续执行，请保持 `cancelOnNoSubscribers: false`。

UMD 全量包会内置 RxJS、Axios、`safe-stable-stringify` 和 `spark-md5`；ESM/CJS 的 `rxjs/http` 子路径则将这些依赖作为可选 peer 依赖按需安装。

## 防抖、节流与深拷贝

三个工具均不依赖第三方包，可从主入口或对应子路径导入：

```ts
import { debounce, deepClone, throttle } from "@axutils/common";

const saveDraft = debounce((content: string) => {
  console.log("保存草稿", content);
}, 300);
saveDraft("latest");
saveDraft.cancel(); // 取消尚未执行的保存

const handleResize = throttle(() => {
  console.log("处理一次尺寸变化");
}, 100);
handleResize(); // 首次调用立即执行，周期内最后一次调用会在周期末补执行

const copiedState = deepClone({ user: { id: 1 }, tags: ["common"] });
```

也可以按需导入：

```ts
import { debounce, throttle } from "@axutils/common/object/timing";
import { deepClone } from "@axutils/common/object/object";
```

`debounce` 和 `throttle` 的 `wait` 必须是 `0` 到 `2_147_483_647` 之间的有限数字；非有限值、负数或超出定时器上限的值分别抛出 `TypeError` 或 `RangeError`，`0` 合法。两个包装函数都会保留调用时的 `this` 和参数，并提供 `cancel()`；防抖默认只执行停止调用后的最后一次，节流默认首次立即执行并在周期末执行最后一次。如果周期边界仍有待执行的 trailing 定时器，边界调用会并入该调度并返回 `undefined`；其他节流周期内排队的调用也返回 `undefined`，只有同步执行的回调结果会返回给调用方。

`deepClone` 支持原始值、数组、当前或其他 Realm 创建的普通对象、`Date`、`RegExp`、`Map`、`Set`、循环引用和共享引用，复制可枚举自有字符串/Symbol 属性并保留 `Object.create(null)` 原型。函数、自定义 class 实例、TypedArray、`WeakMap`、`WeakSet` 和 `Promise` 等未声明支持的对象会原样保留；属性描述符和非枚举属性不会复制。

## 缓存

通用缓存从主入口或 `@axutils/common/object/storage` 导入。浏览器中默认使用 `localStorage`，传入 `type: "session"` 时使用 `sessionStorage`；实例创建时会用临时 key 探测目标 Web Storage 是否真正可读写，在 Node 或探测失败时固定降级为对应类型的进程内 Map。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils({
  prefix: "app:",
  expired: 300, // 默认 300 秒；小于等于 0 表示不过期
  type: "local",
});

storage.set("user", { id: 1 });
console.log(storage.get<{ id: number }>("user"));
storage.remove("user");
storage.clear(); // 只清理 prefix 为 "app:" 的缓存
```

通用缓存值通过 JSON 编解码，不支持循环引用、`BigInt`、`undefined`、函数和 `Symbol`。其中 `undefined`、函数和 `Symbol` 即使位于对象字段或数组元素中也会被拒绝：`set` 抛出 `TypeError`，`setSafe` 返回 `false` 且不会写入数据。`Date`、`NaN`、`Infinity` 和返回可序列化值的自定义 `toJSON()` 保持原生 `JSON.stringify` 语义；`Map`、`Set`、Symbol 属性键等其他类型仍按原生 JSON 规则转换或忽略。

过期时间单位为秒，小于等于 `0` 表示不过期；非有限数字会抛出 `TypeError`，计算后的绝对时间超出 JavaScript 安全整数范围时会抛出 `RangeError`。对应的 `setSafe` 会吞掉异常并返回 `false`。

配置 `key` 处理函数时，函数接收已经拼接 `prefix` 的 key；例如使用 MD5 时可以这样写（需要先安装 `spark-md5`）：

```ts
import { Md5 } from "@axutils/common/crypto/md5";
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils({
  prefix: "app:",
  key: (key) => new Md5().update(key).toHex(),
});
```

Node 端如需明确使用高性能 Map 实现，可从 `@axutils/common/node/object/storage` 导入。它不做 JSON 编解码，直接保存值引用；缓存仅在当前 Node 进程内有效，不跨进程或重启持久化。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils({ prefix: "worker:" });
storage.set("job", { id: 1 });
```

两套实现都提供 `get`、`set`、`remove`、`clear` 以及对应的 `getSafe`、`setSafe`、`removeSafe`、`clearSafe`。safe 方法不会抛错：`getSafe` 失败返回 `null`，其他 safe 方法失败返回 `false`，成功返回 `true`。

## 使用方式

从包主入口导入：

```ts
import {
    isBoolean,
    isArrowFunction,
    isAsyncArrowFunction,
    isAsyncFunction,
    isBrowser,
    isBrowserLike,
    isBun,
    isDate,
    isDeno,
    isEmail,
    isFunction,
    isHexColor,
    isHttpUrl,
    isIdCardCn,
    isIpv4,
    isNil,
    isNode,
    isNormalFunction,
  isNumber,
  isObject,
  isPhoneCn,
  isPlainObject,
  objectToQuery,
  queryToObject,
  isServer,
    isString,
    isWebWorker,
} from "@axutils/common";

console.log(isNumber(1));
console.log(isString("common"));
console.log(isBoolean(true));
console.log(isNil(null));
console.log(isFunction(() => {}));
console.log(isNormalFunction(function () {}));
console.log(isArrowFunction(() => {}));
console.log(isAsyncFunction(async () => {}));
console.log(isAsyncArrowFunction(async () => {}));
console.log(isDate(new Date()));
console.log(isObject({ name: "common" }));
console.log(isPlainObject({}));
console.log(objectToQuery({ page: 1, tag: ["typescript", "utils"] }));
console.log(queryToObject("?tag=typescript&tag=utils"));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
console.log(isHttpUrl("https://example.com"));
console.log(isIpv4("192.168.1.1"));
console.log(isIdCardCn("11010519491231002X"));
console.log(isHexColor("#ffffff"));
console.log(isBrowser());
console.log(isNode());
console.log(isServer());
```

从子路径导入：

```ts
import {
    isBoolean,
    isArrowFunction,
    isAsyncArrowFunction,
    isAsyncFunction,
    isDate,
    isFunction,
    isNil,
    isNormalFunction,
    isNumber,
    isObject,
    isPlainObject,
    isString,
} from "@axutils/common/check/type";
import {
    isEmail,
    isHexColor,
    isHttpUrl,
    isIdCardCn,
    isIpv4,
    isPhoneCn,
} from "@axutils/common/check/reg";
import {
    isBrowser,
    isBrowserLike,
    isBun,
    isDeno,
    isNode,
    isServer,
    isWebWorker,
} from "@axutils/common/check/platform";
import { Md5 } from "@axutils/common/crypto/md5";
import { bytesToBase64, bytesToHex } from "@axutils/common/crypto/convert";
import { Md5 as NodeMd5 } from "@axutils/common/node/crypto/md5";
import {
    decodeBase64,
    decodeHex,
    normalizeMd5Input,
} from "@axutils/common/node/crypto/convert";
import {
    jsonParse,
    jsonParseSafe,
    jsonStringify,
    jsonStringifySafe,
} from "@axutils/common/object/json";
import { objectToQuery, queryToObject } from "@axutils/common/object/url";

console.log(isBoolean(true));
console.log(isObject({ source: "subpath" }));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
console.log(isHttpUrl("https://example.com"));
console.log(isIpv4("192.168.1.1"));
console.log(isIdCardCn("11010519491231002X"));
console.log(isHexColor("#ffffff"));
console.log(isBrowser());
console.log(isNode());
console.log(isServer());
console.log(jsonStringify({ b: 2, a: 1 }, { sortKeys: true }));
console.log(jsonParse('{"a":1}'));
console.log(objectToQuery({ page: 1, tag: ["typescript", "utils"] }));
console.log(queryToObject("https://example.com/?tag=typescript&tag=utils"));
console.log(new Md5().update("hello").toHex());
console.log(
    bytesToHex([
        93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
    ]),
);
console.log(
    bytesToBase64([
        93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
    ]),
);
console.log(new NodeMd5().update("hello").toBase64());
console.log(decodeHex("68656c6c6f"));
console.log(decodeBase64("aGVsbG8="));
console.log(normalizeMd5Input("hello"));
```

浏览器端也可通过 UMD 全量包直接引入所有浏览器侧工具（无需模块系统）：

```html
<script src="https://unpkg.com/@axutils/common/dist/index.umd.cjs"></script>
<script>
    console.log(AxutilsCommon.isNumber(1));
    console.log(AxutilsCommon.isEmail("user@example.com"));
    console.log(
        AxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true }),
    );
    console.log(
        AxutilsCommon.objectToQuery({ page: 1, tag: ["typescript", "utils"] }),
    );
    console.log(new AxutilsCommon.Md5().update("hello").toHex());
</script>
```

> **注意**：
>
> - ESM/CJS 主入口 `@axutils/common` 不包含 `object/json`、`crypto/md5` 和 `crypto/convert`
> - `object/json`、`crypto/md5`、`crypto/convert` 需要走子路径按需导入
> - UMD 全量包会内联 `safe-stable-stringify`、`spark-md5` 等第三方依赖，体积大于 ESM/CJS 产物。若仅需局部能力且对体积敏感，建议使用 ESM 按需导入

## 方法说明

### 类型判断（`@axutils/common/check/type`）

- `isNumber(value)`：判断是否为有效数字，`NaN` 返回 `false`
- `isString(value)`：判断是否为字符串
- `isBoolean(value)`：判断是否为布尔值
- `isArray(value)`：判断是否为数组
- `isObject(value)`：判断是否为普通对象语义下的对象值，不包含 `null` 和数组，但不严格区分字面量对象与 `Date`、`RegExp`、包装对象等
- `isNil(value)`：判断是否为 `null` 或 `undefined`，`0`、`""`、`false` 等“假值”不视为 nil
- `isFunction(value)`：判断是否为函数，覆盖普通函数、箭头函数、`async` 函数、生成器函数和 `class` 声明
- `isNormalFunction(value)`：判断是否为常规非箭头函数形态，覆盖 `function` 声明/表达式及对象方法简写；轻量校验，bound 包装后或 native 函数无法识别
- `isArrowFunction(value)`：判断是否为箭头函数（含 `async` 箭头函数）；轻量校验，依赖函数源码扫描，bound 包装后或 native 函数无法识别
- `isAsyncFunction(value)`：判断是否为 `async` 函数（含 `async` 箭头函数），普通函数、生成器函数和 `class` 声明返回 `false`
- `isAsyncArrowFunction(value)`：判断是否为 `async` 箭头函数，对 `async function` 声明和同步箭头返回 `false`；轻量校验，依赖函数源码扫描，bound 包装后或 native 函数无法识别
- `isDate(value)`：判断是否为有效的 `Date` 实例，`Invalid Date` 返回 `false`
- `isPlainObject(value)`：判断是否为字面量对象（plain object），严格区分 `Date`、`RegExp`、`Map`、`Set`、包装对象和 `class` 实例，`Object.create(null)` 视为字面量对象

### 格式校验（`@axutils/common/check/reg`）

- `isPhoneCn(value)`：判断是否为中国大陆 11 位手机号，不支持 `+86`、空格或分隔符
- `isEmail(value)`：判断是否为国际通用邮箱格式，`@` 前后必须有内容、不允许空白字符、域名至少含一个 `.`，且点不能出现在首尾或连续出现，支持任意 Unicode 字符
- `isHttpUrl(value)`：判断是否为 `http://` 或 `https://` 开头的 URL，不校验域名合法性、端口范围或路径合法性
- `isIpv4(value)`：判断是否为合法的 IPv4 地址，每段取值 `0-255`，不允许前导零
- `isIdCardCn(value)`：判断是否为合法的中国大陆 18 位居民身份证号，校验末位校验码（GB 11643-1999），不校验出生日期真实性和地区码
- `isHexColor(value)`：判断是否为十六进制颜色值，支持 `#fff`（3 位）和 `#ffffff`（6 位），不支持 alpha 通道

### 平台判断（`@axutils/common/check/platform`）

- `isBrowser()`：判断当前运行时是否为浏览器主线程，同时要求存在 `window`/`document` 且 `window === globalThis`，jsdom 等模拟环境可能误判
- `isNode()`：判断当前运行时是否为 Node.js，校验 `process.versions.node` 为字符串，Electron 主进程也返回 `true`
- `isWebWorker()`：判断当前运行时是否为 Web Worker，要求存在 `self` 和 `importScripts` 且 `self.window` 不存在，不覆盖 Service Worker
- `isBrowserLike()`：判断当前运行时是否为类浏览器环境，仅校验 `window` 存在，语义宽松，适合「能否使用浏览器 API」的快速预判
- `isServer()`：判断当前运行时是否为服务端环境，即 `isBrowser()` 取反，包含 Node.js/Deno/Bun/Worker 等非浏览器主线程环境
- `isDeno()`：判断当前运行时是否为 Deno，校验全局 `Deno` 对象和 `Deno.version.deno`
- `isBun()`：判断当前运行时是否为 Bun，校验全局 `Bun` 对象和 `Bun.version`

### JSON 序列化（`@axutils/common/object/json`）

在原生 `JSON.stringify` / `JSON.parse` 基础上增加可配置项，未传入配置时走 FastPath 直接调用原生方法，性能与原生一致。配置化路径底层使用 [safe-stable-stringify](https://www.npmjs.com/package/safe-stable-stringify)（已知最快的稳定序列化实现）。

> **依赖提示**：使用 `@axutils/common/object/json` 子路径需要安装 peer 依赖 `safe-stable-stringify`（`npm i safe-stable-stringify`）。不使用 JSON 序列化功能的用户无需安装。`jsonParse` 不依赖任何第三方库。

- `jsonStringify(value, options?)`：序列化值为 JSON 字符串；当根值为 `undefined`、函数或 `Symbol` 时，与原生一致返回 `undefined`；支持以下配置：
    - `sortKeys`：对象 key 排序，`true`/`"asc"` 升序、`"desc"` 降序、或自定义比较函数，不影响数组元素顺序
    - `filterNullish`：过滤值为 `null`/`undefined` 的对象字段（不影响数组元素，也不影响根值）
    - `space`：缩进配置，`number` 为空格数、`string` 为缩进字符串
    - `onCycle`：循环引用处理，`"throw"` 抛错（默认）、`"skip"` 将循环引用值替换为 `null`

    > **BigInt 行为差异**：FastPath（无配置或仅传 `space`）走原生 `JSON.stringify`，遇到 `BigInt` 会抛 `TypeError`；配置化路径（传入 `sortKeys`/`filterNullish`/`onCycle` 等触发配置化的选项）底层 `safe-stable-stringify` 会将 `BigInt` 序列化为数字。如需序列化 `BigInt`，请显式传入这些配置项。

- `jsonParse(text, options?)`：反序列化 JSON 文本，支持以下配置：
    - `sortKeys`：对结果对象的 key 排序，语义同序列化
    - `filterNullish`：过滤值为 `null` 的字段（JSON 文本中不存在 `undefined`）
- `JsonCircularReferenceError`：循环引用错误类，当 `onCycle` 为 `"throw"`（默认）且显式传入配置时抛出；无配置时走 FastPath 抛原生 `TypeError`
- `jsonStringifySafe(value, options?)`：安全版 `jsonStringify`，参数和行为完全一致，区别是任何异常（循环引用、`TypeError` 等）都不抛出，直接返回 `null`。返回类型 `string | null | undefined`，适用于日志、缓存写入等容错场景。如需区分错误类型请使用 `jsonStringify`
- `jsonParseSafe(text, options?)`：安全版 `jsonParse`，参数和行为完全一致，区别是任何异常（如 `SyntaxError`）都不抛出，直接返回 `null`。返回类型 `T | null`，适用于解析不可信外部输入的容错场景。注意：合法 JSON 文本 `"null"` 解析结果也是 `null`，调用方无法仅凭返回值区分"解析失败"与"原文就是 null"

### URL 查询工具（`@axutils/common` / `@axutils/common/object/url`）

- `objectToQuery(value, options?)`：将对象序列化为不带前导问号的 query 字符串。默认过滤 `null` 和 `undefined`（包括数组元素）；数组会按原有元素顺序展开为重复 key。值使用标准 `URLSearchParams` 编码。
    - `filterNullish`：设为 `false` 时保留 `null` / `undefined`，并分别转换为字符串。
    - `sortKeys`：控制 key 排序；`false` 或不传时保留对象键顺序，`true` / `"asc"` 按 Unicode 代码点升序，`"desc"` 降序，也可传入自定义比较函数。同一 key 的数组元素顺序始终不变。
- `queryToObject(value)`：解析裸 query、带 query 的相对/绝对路径或完整 HTTP(S) URL；忽略 hash，重复 key 按出现顺序转换为字符串数组。没有 query 的 HTTP(S) URL 或绝对路径返回空对象。未带前导斜杠的相对路径与裸 query 存在歧义：问号前含 `=` 或 `&` 时按裸 query 处理；若裸 query 的 key 本身包含未编码问号，可加前导 `?` 明确按裸 query 解析。

### MD5（`@axutils/common/crypto/md5` / `@axutils/common/node/crypto/md5`）

提供一套增量 MD5 工具类，浏览器/通用侧基于 `spark-md5`，Node 侧基于 `node:crypto`，两边 API 和行为保持一致。

> **依赖提示**：
>
> - 使用 `@axutils/common/crypto/md5` 需要安装 peer 依赖 `spark-md5`（`pnpm add spark-md5`）
> - 使用 `@axutils/common/node/crypto/md5` 不需要额外运行时依赖

- `new Md5()`：创建一个可增量 `update()` 的 MD5 实例
- `update(input, encoding?)`：追加待摘要内容，支持 `string`、`number[]`、`Uint8Array`
    - 字符串默认按 `utf8` 处理
    - 也支持显式指定 `hex`、`base64`
    - 返回实例自身，便于链式调用
- `toBytes()`：返回摘要对应的 16 字节数组
- `toHex()`：返回 32 位小写十六进制字符串
- `toBase64()`：返回标准 base64 字符串

### 转换工具（`@axutils/common/crypto/convert` / `@axutils/common/node/crypto/convert`）

- `toByteArray(input)`：把 `number[]` 或 `Uint8Array` 归一化为新的 `Uint8Array`
- `normalizeMd5Input(input, encoding?)`：按 `utf8` / `hex` / `base64` 统一解码 MD5 输入
- `decodeHex(value)`：把十六进制字符串解码为字节数组
- `decodeBase64(value)`：把标准 base64 字符串解码为字节数组
- `binaryStringToBytes(value)`：把二进制字符串拆成字节数组，主要用于 raw 摘要适配
- `bytesToHex(bytes)`：把字节数组转成小写十六进制字符串
- `bytesToBase64(bytes)`：把字节数组转成标准 base64 字符串

行为边界：

- 非法字节值（非整数、负数、超过 `255`）会抛错
- `toBytes()` / `toHex()` / `toBase64()` 首次调用后会固定摘要结果
- 摘要生成后不可继续 `update()`
