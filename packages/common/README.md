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
import { isArray, isEmail, isNumber, isObject, isPhoneCn, isString } from "@axutils/common";

console.log(isNumber(1));
console.log(isString("common"));
console.log(isArray(["common"]));
console.log(isObject({ name: "common" }));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
```

从子路径导入：

```ts
import { isBoolean, isObject } from "@axutils/common/check/type";
import { isEmail, isPhoneCn } from "@axutils/common/check/reg";

console.log(isBoolean(true));
console.log(isObject({ source: "subpath" }));
console.log(isPhoneCn("13800138000"));
console.log(isEmail("user@example.com"));
```

## 方法说明

- `isNumber(value)`：判断是否为有效数字，`NaN` 返回 `false`
- `isString(value)`：判断是否为字符串
- `isBoolean(value)`：判断是否为布尔值
- `isArray(value)`：判断是否为数组
- `isObject(value)`：判断是否为普通对象语义下的对象值，不包含 `null` 和数组
- `isPhoneCn(value)`：判断是否为中国大陆 11 位手机号，不支持 `+86`、空格或分隔符
- `isEmail(value)`：判断是否为常见邮箱格式，`@` 前后必须有内容、不允许空白字符、域名至少含一个 `.`，且点不能出现在首尾或连续出现

## common 包命令

- `corepack pnpm --filter @axutils/common build`：先删除 `dist` 再重新构建当前包
- `corepack pnpm --filter @axutils/common typecheck`：检查当前包的 TypeScript 类型
- `corepack pnpm --filter @axutils/common test`：运行当前包的 Vitest 用例
- `corepack pnpm --filter @axutils/common test:dist`：验证构建产物的主入口、`check/type`、`check/reg` 在 ESM/CJS 下都能正常导入
- `corepack pnpm --filter @axutils/common publint`：检查发布产物与导出声明是否一致
