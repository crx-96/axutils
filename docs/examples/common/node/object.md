# `@axutils/common` Node.js 进程内缓存

本文档对应 `packages/common/src/node/object/storage`，适用于 Node.js `>=14.18.0`。它不依赖浏览器 `localStorage`，也不做 JSON 编解码：缓存值直接保留对象引用，因此支持循环对象、`BigInt`、函数等内存值，但只在当前 Node.js 进程内有效，不跨进程或重启持久化。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";
```

`@axutils/common/node` 也聚合导出 `StorageUtils` 及相关类型；`@axutils/common/node/object` 本身不是公开 exports 路径。基础通用缓存见 [对象工具文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/object.md)。

## 公开导出与所有合法使用方式

Node 缓存只使用进程内 `Map`，没有第三方 peer；它不是通用对象缓存的 JSON/Web Storage 实现。`@axutils/common` 根入口不导出 Node `StorageUtils`，UMD 浏览器构建也不包含 Node 入口。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer / 运行时 |
| --- | --- | --- | --- |
| `@axutils/common/node` | `StorageUtils`（`set`、`get`、`remove`、`clear`、`getSafe`、`setSafe`、`removeSafe`、`clearSafe`）；同一入口还聚合 Node 加密 API，见 [Node.js 加密文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/crypto.md) | `StorageKeyHandler`、`StorageOptions` | 无第三方 peer；Node.js `>=14.18.0` |
| `@axutils/common/node/object/storage` | `StorageUtils`（上述全部实例方法） | `StorageKeyHandler`、`StorageOptions` | 无第三方 peer；Node.js `>=14.18.0` |
| `@axutils/common` (`.`) | 不导出 Node `StorageUtils` | 不导出 Node 缓存类型 | 根入口无第三方运行时依赖 |

ESM 可以使用 Node 聚合入口或精确子路径；`@axutils/common/node/object` 目录入口未声明，不能使用：

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";
import { StorageUtils as AggregatedStorageUtils } from "@axutils/common/node";
import type {
  StorageKeyHandler,
  StorageOptions,
} from "@axutils/common/node/object/storage";
```

CJS 使用对应的 `require` 入口：

```js
const { StorageUtils } = require("@axutils/common/node/object/storage");
const { StorageUtils: AggregatedStorageUtils } = require("@axutils/common/node");
```

`StorageKeyHandler` 和 `StorageOptions` 也可以从 `@axutils/common/node` 进行类型导入，但不能从根入口导入：

```ts
import type {
  StorageKeyHandler as AggregatedStorageKeyHandler,
  StorageOptions as AggregatedStorageOptions,
} from "@axutils/common/node";
```

Node 缓存没有 `AxutilsCommon` UMD 用法；浏览器应使用 [通用缓存文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/object.md) 中的 `StorageUtils`。

## `new StorageUtils(options?)`

创建 Node 进程内缓存实例。所有实例共享同一个进程内 Map，但 `prefix` 命名空间相互隔离。

- `expired`：默认过期时间，单位为秒；小于等于 `0` 表示不过期；非有限值抛 `TypeError`。
- `prefix`：默认空字符串，用于隔离业务 key。
- `key`：可选 key 处理函数，接收已经拼接 `prefix` 的字符串，返回底层 Map key。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils({
  prefix: "worker:",
  expired: 60,
  key: (key) => key.toLowerCase(),
});
storage.set("Job", { id: 1 });
```

## 实例方法

### `storage.set<T>(key, value, expired?)`

写入值；第三个参数按秒覆盖实例默认过期时间，小于等于 `0` 表示不过期。Node 侧不序列化值，因此对象引用本身会被保存。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
const value = { id: 1 };
storage.set("job", value);
console.log(storage.get("job") === value); // true
```

### `storage.get<T>(key)`

读取值；不存在或已过期时返回 `null`，过期条目会被删除。泛型只用于调用方类型提示，不做运行时校验。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
storage.set("job", { id: 1 });
const job = storage.get<{ id: number }>("job");
console.log(job?.id); // 1
```

### `storage.remove(key)`

删除一个缓存条目；不存在时也不会抛异常。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
storage.set("temporary", true);
storage.remove("temporary");
console.log(storage.get("temporary")); // null
```

### `storage.clear()`

只删除当前 `prefix` 命名空间，不影响其他前缀的实例或条目。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const first = new StorageUtils({ prefix: "first:" });
const second = new StorageUtils({ prefix: "second:" });
first.set("value", 1);
second.set("value", 2);
first.clear();
console.log(first.get("value")); // null
console.log(second.get("value")); // 2
```

### `storage.getSafe<T>(key)`

安全读取版本；捕获任何异常并返回 `null`，成功读取和未命中也都可能得到 `null`。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
console.log(storage.getSafe<{ ok: boolean }>("missing")); // null
```

### `storage.setSafe<T>(key, value, expired?)`

安全写入版本；成功返回 `true`，参数校验或底层操作异常返回 `false`。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
console.log(storage.setSafe("job", { id: 1 })); // true
```

### `storage.removeSafe(key)`

安全删除版本；成功返回 `true`，异常返回 `false`。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils();
console.log(storage.removeSafe("job")); // true
```

### `storage.clearSafe()`

安全清空版本；成功返回 `true`，异常返回 `false`。

```ts
import { StorageUtils } from "@axutils/common/node/object/storage";

const storage = new StorageUtils({ prefix: "worker:" });
console.log(storage.clearSafe()); // true
```

`StorageKeyHandler` 和 `StorageOptions` 是公开类型导出；Node 版本的 `StorageOptions` 不包含浏览器专用的 `type` 字段。Node 聚合入口示例：

```ts
import { StorageUtils } from "@axutils/common/node";

const storage = new StorageUtils({ prefix: "api:" });
storage.set("health", { ok: true });
console.log(storage.get("health"));
```
