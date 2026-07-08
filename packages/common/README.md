# @axutils/common

`@axutils/common` 是 `axutils` monorepo 中的公共工具子包，当前提供一组常用类型判断和格式校验方法，作为后续公共工具集合的基础能力。

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
  isAsyncFunction,
  isDate,
  isEmail,
  isFunction,
  isHexColor,
  isHttpUrl,
  isIdCardCn,
  isIpv4,
  isNil,
  isNumber,
  isObject,
  isPhoneCn,
  isPlainObject,
  isString,
} from "@axutils/common";

console.log(isNumber(1));
console.log(isString("common"));
console.log(isBoolean(true));
console.log(isNil(null));
console.log(isFunction(() => {}));
console.log(isAsyncFunction(async () => {}));
console.log(isDate(new Date()));
console.log(isObject({ name: "common" }));
console.log(isPlainObject({}));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
console.log(isHttpUrl("https://example.com"));
console.log(isIpv4("192.168.1.1"));
console.log(isIdCardCn("11010519491231002X"));
console.log(isHexColor("#ffffff"));
```

从子路径导入：

```ts
import {
  isBoolean,
  isAsyncFunction,
  isDate,
  isFunction,
  isNil,
  isNumber,
  isObject,
  isPlainObject,
  isString,
} from "@axutils/common/check/type";
import { isEmail, isHexColor, isHttpUrl, isIdCardCn, isIpv4, isPhoneCn } from "@axutils/common/check/reg";

console.log(isBoolean(true));
console.log(isObject({ source: "subpath" }));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
console.log(isHttpUrl("https://example.com"));
console.log(isIpv4("192.168.1.1"));
console.log(isIdCardCn("11010519491231002X"));
console.log(isHexColor("#ffffff"));
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
- `isAsyncFunction(value)`：判断是否为 `async` 函数（含 `async` 箭头函数），普通函数、生成器函数和 `class` 声明返回 `false`
- `isDate(value)`：判断是否为有效的 `Date` 实例，`Invalid Date` 返回 `false`
- `isPlainObject(value)`：判断是否为字面量对象（plain object），严格区分 `Date`、`RegExp`、`Map`、`Set`、包装对象和 `class` 实例，`Object.create(null)` 视为字面量对象

### 格式校验（`@axutils/common/check/reg`）

- `isPhoneCn(value)`：判断是否为中国大陆 11 位手机号，不支持 `+86`、空格或分隔符
- `isEmail(value)`：判断是否为国际通用邮箱格式，`@` 前后必须有内容、不允许空白字符、域名至少含一个 `.`，且点不能出现在首尾或连续出现，支持任意 Unicode 字符
- `isHttpUrl(value)`：判断是否为 `http://` 或 `https://` 开头的 URL，不校验域名合法性、端口范围或路径合法性
- `isIpv4(value)`：判断是否为合法的 IPv4 地址，每段取值 `0-255`，不允许前导零
- `isIdCardCn(value)`：判断是否为合法的中国大陆 18 位居民身份证号，校验末位校验码（GB 11643-1999），不校验出生日期真实性和地区码
- `isHexColor(value)`：判断是否为十六进制颜色值，支持 `#fff`（3 位）和 `#ffffff`（6 位），不支持 alpha 通道

## common 包命令

- `corepack pnpm --filter @axutils/common build`：先删除 `dist` 再重新构建当前包
- `corepack pnpm --filter @axutils/common typecheck`：检查当前包的 TypeScript 类型
- `corepack pnpm --filter @axutils/common test`：运行当前包的 Vitest 用例
- `corepack pnpm --filter @axutils/common test:dist`：验证构建产物的主入口、`check/type`、`check/reg` 在 ESM/CJS 下都能正常导入
- `corepack pnpm --filter @axutils/common publint`：检查发布产物与导出声明是否一致
