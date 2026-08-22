# `@axutils/common` 通用加密与字节转换

本文档对应 `packages/common/src/crypto`，运行在浏览器和 Node.js 通用环境。`package.json#exports` 只公开两个精确子路径；`@axutils/common` 根入口不导出 `Md5` 或任何转换函数。

使用 `Md5` 需要安装可选 peer 依赖 `spark-md5`：

```bash
pnpm add @axutils/common spark-md5
```

不使用 `@axutils/common/crypto/md5` 时无需安装 `spark-md5`。Node 专用的 `node:crypto` 实现见 [Node.js 加密与字节转换](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/crypto.md)。

## 公开导出与所有合法使用方式

通用加密模块的 peer 依赖只影响对应的精确子路径：`crypto/md5` 静态依赖 `spark-md5`，`crypto/convert` 不依赖第三方包。当前 `package.json#exports` 仍只为这两个模块声明精确子路径，因此二者都不属于 `@axutils/common` 根入口；Node 专用实现也只能从 `node` 入口导入。根入口因此继续保持零第三方运行时依赖。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common/crypto/md5` | `Md5`（`update`、`toBytes`、`toHex`、`toBase64`） | `Md5Input`、`Md5StringEncoding` | `spark-md5` |
| `@axutils/common/crypto/convert` | `normalizeMd5Input`、`toByteArray`、`binaryStringToBytes`、`decodeHex`、`decodeBase64`、`bytesToHex`、`bytesToBase64` | `Md5Input`、`Md5StringEncoding` | 无 |
| `@axutils/common` (`.`) | 不导出本节任何 API | 不导出 `Md5Input` 或 `Md5StringEncoding` | 根入口无第三方运行时依赖 |

ESM 导入必须使用已声明的精确路径：

```ts
import { Md5 } from "@axutils/common/crypto/md5";
import {
  binaryStringToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBase64,
  decodeHex,
  normalizeMd5Input,
  toByteArray,
} from "@axutils/common/crypto/convert";
import type {
  Md5Input,
  Md5StringEncoding,
} from "@axutils/common/crypto/convert";
```

CJS 使用同样的两个精确路径：

```js
const { Md5 } = require("@axutils/common/crypto/md5");
const {
  binaryStringToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBase64,
  decodeHex,
  normalizeMd5Input,
  toByteArray,
} = require("@axutils/common/crypto/convert");
```

`Md5Input` 和 `Md5StringEncoding` 可以从 `crypto/md5` 或 `crypto/convert` 的类型入口导入；它们不是根入口类型：

```ts
import type {
  Md5Input,
  Md5StringEncoding,
} from "@axutils/common/crypto/md5";
import type {
  Md5Input as ConvertMd5Input,
  Md5StringEncoding as ConvertMd5StringEncoding,
} from "@axutils/common/crypto/convert";
```

UMD 构建包含通用 `Md5` 和转换函数，并把 `spark-md5` 打包进浏览器产物；浏览器中使用 `AxutilsCommon`，而不是根入口的伪造导入：

```js
const digest = new AxutilsCommon.Md5().update("payload").toHex();
const bytes = AxutilsCommon.decodeHex("6869");
console.log(digest, AxutilsCommon.bytesToBase64(bytes));
```

## 输入与编码

`Md5Input` 是 `string | readonly number[] | Uint8Array`；字符串编码 `Md5StringEncoding` 是 `"utf8" | "hex" | "base64"`。字符串默认按 UTF-8 处理；`hex` 要求连续偶数位十六进制，`base64` 使用标准 RFC 4648 字母表，不接受 URL-safe 变体。所有字节数组方法都要求每个值为 `0` 到 `255` 的整数。

## `Md5`

### `new Md5()`

创建可增量更新的 MD5 实例。实例首次调用摘要方法后会固定摘要，后续 `update` 会抛错；`toBytes()` 每次返回新的数组副本。

```ts
import { Md5 } from "@axutils/common/crypto/md5";

const md5 = new Md5();
console.log(md5 instanceof Md5); // true
```

### `md5.update(input, encoding?)`

追加字符串、`number[]` 或 `Uint8Array`，返回实例自身以支持链式调用。字符串默认 `utf8`，也可传 `"hex"` 或 `"base64"`；摘要生成后调用会抛 `Error`。

```ts
import { Md5 } from "@axutils/common/crypto/md5";

const md5 = new Md5();
md5.update("hel").update("lo");
console.log(md5.toHex()); // 5d41402abc4b2a76b9719d911017c592

const fromHex = new Md5().update("68656c6c6f", "hex");
console.log(fromHex.toHex()); // 5d41402abc4b2a76b9719d911017c592
```

### `md5.toBytes()`

完成摘要并返回 16 个字节的 `number[]`。重复调用结果一致但数组不是同一引用。

```ts
import { Md5 } from "@axutils/common/crypto/md5";

const md5 = new Md5().update("hello");
const bytes = md5.toBytes();
console.log(bytes.length, bytes[0]); // 16 93
```

### `md5.toHex()`

返回 32 位小写十六进制摘要字符串。

```ts
import { Md5 } from "@axutils/common/crypto/md5";

console.log(new Md5().update("hello").toHex()); // 5d41402abc4b2a76b9719d911017c592
```

### `md5.toBase64()`

返回标准 Base64 摘要字符串。

```ts
import { Md5 } from "@axutils/common/crypto/md5";

console.log(new Md5().update("hello").toBase64()); // XUFAKrxLKna5cZ2REBfFkg==
```

## 字节转换：`crypto/convert`

### `normalizeMd5Input(input, encoding?)`

把 MD5 输入统一为新的 `Uint8Array`。字符串按指定编码解码；数组和 `Uint8Array` 会复制为独立的字节数组，因此修改原输入不会影响返回值。

```ts
import { normalizeMd5Input } from "@axutils/common/crypto/convert";

console.log([...normalizeMd5Input("hello")]); // [104, 101, 108, 108, 111]
console.log([...normalizeMd5Input("6869", "hex")]); // [104, 105]
```

### `toByteArray(input)`

把 `readonly number[]` 或 `Uint8Array` 复制为新的 `Uint8Array`，并检查数组元素为 `0` 到 `255` 的整数；非法值抛 `TypeError`。

```ts
import { toByteArray } from "@axutils/common/crypto/convert";

const source = [0, 127, 255] as const;
const bytes = toByteArray(source);
console.log(bytes instanceof Uint8Array, [...bytes]); // true [0, 127, 255]
```

### `binaryStringToBytes(value)`

把 raw 二进制字符串按每个 UTF-16 code unit 的低 8 位拆为 `number[]`。它主要适配 `spark-md5` 的 raw 摘要结果，不是通用文本解码器。

```ts
import { binaryStringToBytes } from "@axutils/common/crypto/convert";

console.log(binaryStringToBytes("\x00\xff")); // [0, 255]
```

### `decodeHex(value)`

解码连续标准十六进制字符串为 `Uint8Array`。不支持 `0x` 前缀、分隔符或奇数长度；非法输入抛 `TypeError`。

```ts
import { decodeHex } from "@axutils/common/crypto/convert";

console.log([...decodeHex("68656c6c6f")]); // [104, 101, 108, 108, 111]
```

### `decodeBase64(value)`

解码标准 RFC 4648 Base64 为 `Uint8Array`。输入空白会移除；空字符串返回空数组。只接受规范 padding，不支持 URL-safe `-`/`_` 字母。

```ts
import { decodeBase64 } from "@axutils/common/crypto/convert";

console.log([...decodeBase64("aGVsbG8=")]); // [104, 101, 108, 108, 111]
console.log(decodeBase64("\n").length); // 0
```

### `bytesToHex(bytes)`

把字节数组编码为小写十六进制，每个字节始终占两位；输入字节非法时抛 `TypeError`。

```ts
import { bytesToHex } from "@axutils/common/crypto/convert";

console.log(bytesToHex([0, 10, 255])); // 000aff
```

### `bytesToBase64(bytes)`

把字节数组编码为标准 Base64，输出包含必要的 `=` padding；不生成 URL-safe 变体。

```ts
import { bytesToBase64 } from "@axutils/common/crypto/convert";

console.log(bytesToBase64([104, 105])); // aGk=
```

## 常见流程

```ts
import {
  bytesToBase64,
  bytesToHex,
  decodeBase64,
} from "@axutils/common/crypto/convert";
import { Md5 } from "@axutils/common/crypto/md5";

const digest = new Md5().update("payload");
const bytes = digest.toBytes();
console.log(bytesToHex(bytes));
console.log(bytesToBase64(bytes));
console.log([...decodeBase64(bytesToBase64(bytes))]);
```
