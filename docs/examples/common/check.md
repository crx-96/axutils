# `@axutils/common` 检查工具

本文档对应 `packages/common/src/check`，记录可从以下公开路径导入的运行时方法：

- `@axutils/common`：主入口同时导出全部检查方法。
- `@axutils/common/check/type`：类型判断方法。
- `@axutils/common/check/reg`：常用格式校验方法。
- `@axutils/common/check/platform`：当前运行时平台判断方法。

这些方法都不需要额外运行时依赖：

```bash
pnpm add @axutils/common
```

## 公开导出与所有合法使用方式

检查工具没有第三方运行时依赖。包根入口 `@axutils/common` 只聚合这些无依赖的检查方法；下面的三个精确子路径也都是 `package.json#exports` 明确声明的入口。根入口不会加载 Axios、RxJS、日期、加密或 Node 专用模块。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common` (`.`) | `isNumber`、`isString`、`isBoolean`、`isArray`、`isObject`、`isNil`、`isFunction`、`isAsyncFunction`、`isNormalFunction`、`isArrowFunction`、`isAsyncArrowFunction`、`isDate`、`isPlainObject`、`isPhoneCn`、`isEmail`、`isHttpUrl`、`isIpv4`、`isIdCardCn`、`isHexColor`、`isBrowser`、`isNode`、`isWebWorker`、`isBrowserLike`、`isServer`、`isDeno`、`isBun` | 无独立命名类型；类型守卫由函数返回类型提供 | 无 |
| `@axutils/common/check/type` | 上述 `check/type` 的 13 个类型判断方法 | 无独立命名类型 | 无 |
| `@axutils/common/check/reg` | `isPhoneCn`、`isEmail`、`isHttpUrl`、`isIpv4`、`isIdCardCn`、`isHexColor` | 无独立命名类型 | 无 |
| `@axutils/common/check/platform` | `isBrowser`、`isNode`、`isWebWorker`、`isBrowserLike`、`isServer`、`isDeno`、`isBun` | 无独立命名类型 | 无 |

ESM 可以按功能子路径导入，也可以从根入口导入根入口聚合的全部检查方法：

```ts
import {
  isEmail,
  isNode,
  isPlainObject,
} from "@axutils/common";
import {
  isArray,
  isAsyncArrowFunction,
  isAsyncFunction,
  isArrowFunction,
  isBoolean,
  isDate,
  isFunction,
  isNil,
  isNormalFunction,
  isNumber,
  isObject,
  isPlainObject as isPlainObjectFromType,
  isString,
} from "@axutils/common/check/type";
import {
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
  isServer,
  isWebWorker,
} from "@axutils/common/check/platform";
```

CJS 使用对应的 `require` 入口；不要拼接未声明的 `@axutils/common/check` 目录入口：

```js
const { isEmail, isNode, isPlainObject } = require("@axutils/common");
const {
  isArray,
  isAsyncArrowFunction,
  isAsyncFunction,
  isArrowFunction,
  isBoolean,
  isDate,
  isFunction,
  isNil,
  isNormalFunction,
  isNumber,
  isObject,
  isPlainObject: isPlainObjectFromType,
  isString,
} = require("@axutils/common/check/type");
const {
  isHexColor,
  isHttpUrl,
  isIdCardCn,
  isIpv4,
  isPhoneCn,
} = require("@axutils/common/check/reg");
const {
  isBrowser,
  isBrowserLike,
  isBun,
  isDeno,
  isServer,
  isWebWorker,
} = require("@axutils/common/check/platform");
```

这些模块没有独立命名类型；如果需要在类型层面引用一个模块的导出集合，可以使用合法的类型空间导入：

```ts
import type * as CheckTypeExports from "@axutils/common/check/type";

type CheckTypeExportName = keyof typeof CheckTypeExports;
```

UMD 构建会把无依赖的检查方法挂到 `AxutilsCommon`；浏览器中不能使用 Node 专用入口：

```js
console.log(AxutilsCommon.isNumber(1));
console.log(AxutilsCommon.isBrowser());
```

## 类型判断：`check/type`

以下方法均接收 `unknown`，返回布尔值；带 `is` 的返回类型是 TypeScript 类型守卫。它们只做运行时判断，不是安全边界或完整语法解析器。

### `isNumber(value)`

判断值是否为 `number` 且不是 `NaN`。`Infinity` 和 `-Infinity` 会返回 `true`，如需有限数字校验请在调用方另行使用 `Number.isFinite`。

```ts
import { isNumber } from "@axutils/common/check/type";

const value: unknown = 42;
if (isNumber(value)) {
  console.log(value + 1); // 43
}
console.log(isNumber(Number.NaN)); // false
```

### `isString(value)`

只判断原始字符串（`typeof value === "string"`）；`new String("text")` 不通过。

```ts
import { isString } from "@axutils/common/check/type";

const value: unknown = "common";
if (isString(value)) {
  console.log(value.toUpperCase()); // COMMON
}
console.log(isString(new String("common"))); // false
```

### `isBoolean(value)`

只判断原始布尔值；布尔包装对象不通过。

```ts
import { isBoolean } from "@axutils/common/check/type";

const value: unknown = true;
if (isBoolean(value)) {
  console.log(value ? "enabled" : "disabled");
}
console.log(isBoolean(new Boolean(true))); // false
```

### `isArray<T = unknown>(value)`

使用 `Array.isArray` 判断数组，泛型 `T` 只用于类型收窄，不会在运行时检查元素类型。

```ts
import { isArray } from "@axutils/common/check/type";

const value: unknown = ["a", "b"];
if (isArray<string>(value)) {
  console.log(value.join(",")); // a,b
}
console.log(isArray({ 0: "a", length: 1 })); // false
```

### `isObject(value)`

排除 `null` 和数组后，判断是否为对象。它不是严格的 plain object 判断，因此 `Date`、`Map`、类实例和 `Object.create(null)` 也会通过。

```ts
import { isObject } from "@axutils/common/check/type";

const value: unknown = new Date();
if (isObject(value)) {
  console.log(typeof value); // object
}
console.log(isObject(null)); // false
console.log(isObject([])); // false
```

### `isNil(value)`

只判断 `null` 或 `undefined`；`0`、空字符串、`false` 和 `NaN` 都不是 nil。

```ts
import { isNil } from "@axutils/common/check/type";

const value: string | undefined = undefined;
if (isNil(value)) {
  console.log("没有值");
}
console.log(isNil(0)); // false
console.log(isNil(null)); // true
```

### `isFunction(value)`

判断值是否为函数，覆盖普通函数、箭头函数、`async` 函数、生成器函数和 `class` 构造函数。类型守卫收窄为无参可调用的宽泛函数类型。

```ts
import { isFunction } from "@axutils/common/check/type";

const value: unknown = () => "ok";
if (isFunction(value)) {
  console.log(value()); // ok
}
console.log(isFunction(class Example {})); // true
```

### `isNormalFunction(value)`

判断普通非箭头、非 `async`、非生成器、非 `class` 的函数形态，也支持对象方法简写。该方法依赖 `Function.prototype.toString` 做轻量源码扫描，bound 函数和 native 函数无法识别，会返回 `false`。

```ts
import { isNormalFunction } from "@axutils/common/check/type";

function normal() {
  return "normal";
}
const arrow = () => "arrow";
console.log(isNormalFunction(normal)); // true
console.log(isNormalFunction(arrow)); // false
```

### `isArrowFunction(value)`

判断箭头函数，包含 `async` 箭头函数。它同样依赖源码扫描，bound/native 函数返回 `false`；函数体中的 `=>` 不会被当作声明头部。

```ts
import { isArrowFunction } from "@axutils/common/check/type";

const arrow = (value: number) => value * 2;
function normal(value: number) {
  return value * 2;
}
console.log(isArrowFunction(arrow)); // true
console.log(isArrowFunction(normal)); // false
```

### `isAsyncFunction(value)`

判断所有 `async` 函数，包括 `async function` 和 `async` 箭头函数；同步函数、生成器函数和 `async function*` 不通过。bound async 函数可以识别。

```ts
import { isAsyncFunction } from "@axutils/common/check/type";

const value: unknown = async () => 1;
if (isAsyncFunction(value)) {
  console.log(await value()); // 1
}
console.log(isAsyncFunction(function () { return 1; })); // false
```

### `isAsyncArrowFunction(value)`

只判断 `async` 箭头函数；`async function` 会返回 `false`。该方法结合 async 标签和源码扫描，bound/native 函数无法识别。

```ts
import { isAsyncArrowFunction } from "@axutils/common/check/type";

const arrow = async () => "arrow";
async function normalAsync() {
  return "function";
}
console.log(isAsyncArrowFunction(arrow)); // true
console.log(isAsyncArrowFunction(normalAsync)); // false
```

### `isDate(value)`

判断当前 Realm 的有效 `Date` 实例；`Invalid Date` 返回 `false`。由于实现使用 `instanceof Date`，来自其他 Realm 的 `Date` 可能无法识别。

```ts
import { isDate } from "@axutils/common/check/type";

console.log(isDate(new Date("2024-01-01"))); // true
console.log(isDate(new Date("invalid"))); // false
```

### `isPlainObject(value)`

严格判断原型为 `Object.prototype` 或 `null` 的对象。`Date`、`RegExp`、`Map`、`Set`、包装对象和 class 实例都不通过；`Object.create(null)` 会通过。

```ts
import { isPlainObject } from "@axutils/common/check/type";

class User {
  name = "Ada";
}
console.log(isPlainObject({ name: "Ada" })); // true
console.log(isPlainObject(Object.create(null))); // true
console.log(isPlainObject(new User())); // false
```

## 格式校验：`check/reg`

这些方法都是轻量校验，非字符串输入直接返回 `false`。

### `isPhoneCn(value)`

判断中国大陆常见 11 位手机号：首位为 `1`、第二位为 `3` 到 `9`，不接受 `+86`、空格或分隔符。

```ts
import { isPhoneCn } from "@axutils/common/check/reg";

console.log(isPhoneCn("13800138000")); // true
console.log(isPhoneCn("+8613800138000")); // false
```

### `isEmail(value)`

判断常见邮箱格式：`@` 前后有内容，域名至少有一个点，不允许空白、连续点或首尾点。它不是 RFC 完整校验器，不验证域名是否真实存在。

```ts
import { isEmail } from "@axutils/common/check/reg";

console.log(isEmail("user@example.com")); // true
console.log(isEmail("user..name@example.com")); // false
```

### `isHttpUrl(value)`

只接受以 `http://` 或 `https://` 开头且协议头后存在非空白字符的字符串；不验证域名、端口或路径的完整合法性，也不支持其他协议。

```ts
import { isHttpUrl } from "@axutils/common/check/reg";

console.log(isHttpUrl("https://example.com/api")); // true
console.log(isHttpUrl("ftp://example.com")); // false
```

### `isIpv4(value)`

判断四段点分十进制 IPv4，每段为 `0` 到 `255`，不允许前导零；不支持 IPv6、CIDR 或区间写法。

```ts
import { isIpv4 } from "@axutils/common/check/reg";

console.log(isIpv4("192.168.1.1")); // true
console.log(isIpv4("192.168.01.1")); // false
```

### `isIdCardCn(value)`

判断中国大陆 18 位居民身份证号，并校验 GB 11643-1999 末位校验码。它不验证出生日期真实性、地区码，也不支持 15 位旧号。

```ts
import { isIdCardCn } from "@axutils/common/check/reg";

console.log(isIdCardCn("11010519491231002X")); // true
console.log(isIdCardCn("110105194912310021")); // false
```

### `isHexColor(value)`

判断 `#fff` 或 `#ffffff` 形式的十六进制颜色；不支持 alpha 通道的 4/8 位写法以及 `rgb()`、`hsl()`。

```ts
import { isHexColor } from "@axutils/common/check/reg";

console.log(isHexColor("#fff")); // true
console.log(isHexColor("#ffffffff")); // false
```

## 平台判断：`check/platform`

以下方法不接收参数，只读取当前运行时的全局对象并返回 `boolean`。polyfill、测试框架或 Electron 兼容层可能改变判断结果。

### `isBrowser()`

要求存在 `window`、`document`，且 `window === globalThis`；用于判断浏览器主线程，jsdom 等模拟环境可能返回 `true`。

```ts
import { isBrowser } from "@axutils/common/check/platform";

console.log(isBrowser()); // 在真实浏览器主线程通常为 true
```

### `isNode()`

要求 `process.versions.node` 是字符串。Electron 主进程也会返回 `true`。

```ts
import { isNode } from "@axutils/common/check/platform";

console.log(isNode()); // 在 Node.js 中为 true
```

### `isWebWorker()`

要求存在 `self`、`importScripts`，且 `self.window` 不存在；Service Worker 和 Shared Worker 不保证会被识别。

```ts
import { isWebWorker } from "@axutils/common/check/platform";

console.log(isWebWorker()); // 在 Dedicated Web Worker 中通常为 true
```

### `isBrowserLike()`

只判断是否存在全局 `window`，语义比 `isBrowser` 宽松，适合快速判断是否可能使用浏览器 API。

```ts
import { isBrowserLike } from "@axutils/common/check/platform";

console.log(isBrowserLike());
```

### `isServer()`

定义为 `!isBrowser()`；Node.js、Deno、Bun、Web Worker 等非浏览器主线程环境都会返回 `true`。

```ts
import { isServer } from "@axutils/common/check/platform";

if (isServer()) {
  console.log("当前不是浏览器主线程");
}
```

### `isDeno()`

要求存在 `Deno.version.deno`。Deno 兼容层可能同时满足 `isNode()`，需要区分时优先使用本方法。

```ts
import { isDeno } from "@axutils/common/check/platform";

console.log(isDeno()); // 在 Deno 中通常为 true
```

### `isBun()`

要求存在 `Bun.version` 字符串。Bun 兼容 Node.js API，因此 `isNode()` 也可能为 `true`。

```ts
import { isBun } from "@axutils/common/check/platform";

console.log(isBun()); // 在 Bun 中通常为 true
```

## 主入口导出

以上所有运行时方法都可以改为从主入口导入，例如：

```ts
import { isEmail, isNode, isPlainObject } from "@axutils/common";

console.log(isPlainObject({}));
console.log(isEmail("user@example.com"));
console.log(isNode());
```
