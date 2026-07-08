# @axutils/common

`@axutils/common` 是 `axutils` monorepo 中的公共工具子包，当前提供一组常用类型判断、格式校验和运行时平台判断方法，作为后续公共工具集合的基础能力。

## 兼容性

- 包消费运行时：`Node.js >= 14.18.0`
- 仓库开发与构建：请以仓库 [开发总览](../../docs/development.md) 为准，当前仍要求更高版本 Node.js

## 安装

```bash
pnpm add @axutils/common
```

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
```

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
