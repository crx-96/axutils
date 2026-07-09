# @axutils/common

`@axutils/common` 是 `axutils` monorepo 中的公共工具子包，当前提供一组常用类型判断、格式校验、运行时平台判断、JSON 序列化与 MD5 工具方法，作为后续公共工具集合的基础能力。

## 兼容性

- 包消费运行时：`Node.js >= 14.18.0`
- 仓库开发与构建：请以仓库 [开发总览](../../docs/development.md) 为准，当前仍要求更高版本 Node.js

## 安装

```bash
pnpm add @axutils/common
```

如果需要使用可选子路径依赖，请额外安装对应 peer 依赖：

- `@axutils/common/object/json`：`pnpm add safe-stable-stringify`
- `@axutils/common/crypto/md5`：`pnpm add spark-md5`

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
import { isEmail, isHexColor, isHttpUrl, isIdCardCn, isIpv4, isPhoneCn } from "@axutils/common/check/reg";
import { isBrowser, isBrowserLike, isBun, isDeno, isNode, isServer, isWebWorker } from "@axutils/common/check/platform";
import { Md5 } from "@axutils/common/crypto/md5";
import { bytesToBase64, bytesToHex } from "@axutils/common/crypto/convert";
import { Md5 as NodeMd5 } from "@axutils/common/node/crypto/md5";
import { decodeBase64, decodeHex, normalizeMd5Input } from "@axutils/common/node/crypto/convert";
import { jsonParse, jsonParseSafe, jsonStringify, jsonStringifySafe } from "@axutils/common/object/json";

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
console.log(new Md5().update("hello").toHex());
console.log(bytesToHex([93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146]));
console.log(bytesToBase64([93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146]));
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
  console.log(AxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true }));
  console.log(new AxutilsCommon.Md5().update("hello").toHex());
</script>
```

> **注意**：
> - ESM/CJS 主入口 `@axutils/common` 只暴露主入口工具，不包含 `object/json`、`crypto/md5` 和 `crypto/convert`
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

### MD5（`@axutils/common/crypto/md5` / `@axutils/common/node/crypto/md5`）

提供一套增量 MD5 工具类，浏览器/通用侧基于 `spark-md5`，Node 侧基于 `node:crypto`，两边 API 和行为保持一致。

> **依赖提示**：
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
