# `@axutils/common` Node.js 加密与字节转换

本文档对应 `packages/common/src/node/crypto`。它使用 Node.js 内置 `node:crypto` 计算 MD5，不依赖 `spark-md5`，适合 Node.js 服务、脚本和构建工具。包最低运行时版本为 Node.js `>=14.18.0`。

公开子路径必须精确导入：

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";
import {
  bytesToBase64,
  bytesToHex,
  decodeBase64,
  decodeHex,
  normalizeMd5Input,
  toByteArray,
} from "@axutils/common/node/crypto/convert";
```

`@axutils/common/node` 聚合导出同一套方法和类型；`@axutils/common/node/crypto` 本身不是 `package.json.exports` 中的公开路径。

## 公开导出与所有合法使用方式

Node 加密模块不需要第三方 peer，MD5 实现使用 Node.js 内置 `node:crypto`；它只适用于 Node.js 运行时。`@axutils/common` 根入口不导出任何 Node API，UMD 浏览器构建也不包含这些入口。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer / 运行时 |
| --- | --- | --- | --- |
| `@axutils/common/node` | `Md5`（`update`、`toBytes`、`toHex`、`toBase64`）、`normalizeMd5Input`、`toByteArray`、`binaryStringToBytes`、`decodeHex`、`decodeBase64`、`bytesToHex`、`bytesToBase64` | `Md5Input`、`Md5StringEncoding`（Node 聚合入口还导出缓存类型，见 [Node.js 进程内缓存文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/object.md)） | 无第三方 peer；Node.js `>=14.18.0`，内置 `node:crypto` |
| `@axutils/common/node/crypto/md5` | `Md5` | `Md5Input`、`Md5StringEncoding` | 无第三方 peer；Node.js 内置 `node:crypto` |
| `@axutils/common/node/crypto/convert` | `normalizeMd5Input`、`toByteArray`、`binaryStringToBytes`、`decodeHex`、`decodeBase64`、`bytesToHex`、`bytesToBase64` | `Md5Input`、`Md5StringEncoding` | 无 |
| `@axutils/common` (`.`) | 不导出 Node `Md5` 或转换 API | 不导出 Node 加密类型 | 根入口无第三方运行时依赖 |

ESM 可以从两个精确子路径导入，也可以从 Node 聚合入口导入；`@axutils/common/node/crypto` 目录入口未声明，不能使用：

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";
import {
  binaryStringToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBase64,
  decodeHex,
  normalizeMd5Input,
  toByteArray,
} from "@axutils/common/node/crypto/convert";
import {
  Md5 as AggregatedMd5,
  bytesToHex as aggregatedBytesToHex,
} from "@axutils/common/node";
import type {
  Md5Input,
  Md5StringEncoding,
} from "@axutils/common/node/crypto/md5";
```

CJS 使用对应的 `require` 入口：

```js
const { Md5 } = require("@axutils/common/node/crypto/md5");
const {
  binaryStringToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBase64,
  decodeHex,
  normalizeMd5Input,
  toByteArray,
} = require("@axutils/common/node/crypto/convert");
const {
  Md5: AggregatedMd5,
  bytesToHex: aggregatedBytesToHex,
} = require("@axutils/common/node");
```

`Md5Input` 和 `Md5StringEncoding` 在 `node/crypto/md5`、`node/crypto/convert` 以及 Node 聚合入口均可作为类型导入；它们不能从根入口导入：

```ts
import type {
  Md5Input as AggregatedMd5Input,
  Md5StringEncoding as AggregatedMd5StringEncoding,
} from "@axutils/common/node";
import type {
  Md5Input as ConvertMd5Input,
  Md5StringEncoding as ConvertMd5StringEncoding,
} from "@axutils/common/node/crypto/convert";
```

Node API 没有 `AxutilsCommon` UMD 用法；请勿在浏览器脚本中调用 `AxutilsCommon.Md5` 期待得到 Node 实现，浏览器侧如需 MD5 应使用 [通用加密文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/crypto.md) 中的 UMD API。

## 输入与编码

`Md5Input` 是 `string | readonly number[] | Uint8Array`；`Md5StringEncoding` 是 `"utf8" | "hex" | "base64"`。字符串默认按 UTF-8；hex 必须是连续偶数位十六进制；Base64 使用标准字母表并允许先移除空白。字节值必须是 `0` 到 `255` 的整数。

## `Md5`

### `new Md5()`

创建基于 `node:crypto.createHash("md5")` 的增量摘要实例。摘要生成后状态会固定，不能再 `update`。

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";

const md5 = new Md5();
console.log(md5 instanceof Md5); // true
```

### `md5.update(input, encoding?)`

追加字符串、字节数组或 `Uint8Array`，返回自身以支持链式调用。摘要已生成后再次调用会抛 `Error`。

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";

const md5 = new Md5().update("hel").update("lo");
console.log(md5.toHex()); // 5d41402abc4b2a76b9719d911017c592

const fromBase64 = new Md5().update("aGVsbG8=", "base64");
console.log(fromBase64.toHex()); // 5d41402abc4b2a76b9719d911017c592
```

### `md5.toBytes()`

完成摘要并返回 16 字节 `number[]`；每次返回新的数组副本。

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";

const bytes = new Md5().update("hello").toBytes();
console.log(bytes.length, bytes[0]); // 16 93
```

### `md5.toHex()`

返回 32 位小写十六进制 MD5 摘要。

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";

console.log(new Md5().update("hello").toHex()); // 5d41402abc4b2a76b9719d911017c592
```

### `md5.toBase64()`

返回标准 Base64 MD5 摘要。

```ts
import { Md5 } from "@axutils/common/node/crypto/md5";

console.log(new Md5().update("hello").toBase64()); // XUFAKrxLKna5cZ2REBfFkg==
```

## 转换函数：`node/crypto/convert`

Node 侧转换函数与通用侧 API 有意保持一致，方便按运行时切换实现。

### `normalizeMd5Input(input, encoding?)`

按字符串编码解码或复制字节输入，返回新的 `Uint8Array`。

```ts
import { normalizeMd5Input } from "@axutils/common/node/crypto/convert";

console.log([...normalizeMd5Input("6869", "hex")]); // [104, 105]
```

### `toByteArray(input)`

将 `readonly number[]` 或 `Uint8Array` 复制为新的 `Uint8Array`，并校验每个元素的字节范围。

```ts
import { toByteArray } from "@axutils/common/node/crypto/convert";

const input = new Uint8Array([1, 2, 3]);
const copy = toByteArray(input);
console.log(copy !== input, [...copy]); // true [1, 2, 3]
```

### `binaryStringToBytes(value)`

把 raw 二进制字符串按低 8 位转换为 `number[]`，用于摘要 raw 结果适配，不是通用文本解码器。

```ts
import { binaryStringToBytes } from "@axutils/common/node/crypto/convert";

console.log(binaryStringToBytes("\x01\xff")); // [1, 255]
```

### `decodeHex(value)`

解码连续偶数长度的十六进制字符串；非法字符、`0x` 前缀、分隔符或奇数长度抛 `TypeError`。

```ts
import { decodeHex } from "@axutils/common/node/crypto/convert";

console.log([...decodeHex("6869")]); // [104, 105]
```

### `decodeBase64(value)`

解码标准 Base64；空白会忽略，空字符串返回空 `Uint8Array`，非法 padding 或非规范未使用位抛 `TypeError`。

```ts
import { decodeBase64 } from "@axutils/common/node/crypto/convert";

console.log([...decodeBase64("aGk=")]); // [104, 105]
```

### `bytesToHex(bytes)`

把字节数组转换为小写十六进制字符串；输入值必须是合法字节。

```ts
import { bytesToHex } from "@axutils/common/node/crypto/convert";

console.log(bytesToHex([0, 10, 255])); // 000aff
```

### `bytesToBase64(bytes)`

把字节数组转换为标准 Base64 字符串，不生成 URL-safe 变体。

```ts
import { bytesToBase64 } from "@axutils/common/node/crypto/convert";

console.log(bytesToBase64([104, 105])); // aGk=
```

## 聚合入口示例

```ts
import {
  Md5,
  bytesToHex,
  decodeHex,
} from "@axutils/common/node";

const bytes = decodeHex("68656c6c6f");
console.log(bytesToHex(bytes)); // 68656c6c6f
console.log(new Md5().update(bytes).toHex()); // 5d41402abc4b2a76b9719d911017c592
```
