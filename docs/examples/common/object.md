# `@axutils/common` 对象工具

本文档对应 `packages/common/src/object`，包含对象复制、JSON、缓存、计时器和 query 工具。公共导入路径如下：

- `@axutils/common`：`deepClone`、`StorageUtils`、`debounce`、`throttle`、`objectToQuery`、`queryToObject`。
- `@axutils/common/object/object`：`deepClone`。
- `@axutils/common/object/json`：JSON 方法和 `JsonCircularReferenceError`。
- `@axutils/common/object/storage`：通用 `StorageUtils`。
- `@axutils/common/object/timing`：`debounce`、`throttle`。
- `@axutils/common/object/url`：query 方法。

基础对象工具不需要额外运行时依赖：

```bash
pnpm add @axutils/common
```

JSON 子路径的配置化序列化需要可选 peer 依赖：

```bash
pnpm add safe-stable-stringify
```

## 公开导出与所有合法使用方式

`@axutils/common` 根入口只聚合不需要第三方运行时依赖的对象工具。JSON 配置化工具保持在精确的 `object/json` 子路径中，因为该模块静态依赖可选 peer `safe-stable-stringify`；根入口不会加载它，也不会加载 Axios、RxJS、日期、通用加密或 Node 专用模块。以下表格覆盖 `package.json#exports` 中与对象工具有关的每个入口。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common` (`.`) | `deepClone`、`StorageUtils`、`debounce`、`throttle`、`objectToQuery`、`queryToObject` | `StorageType`、`StorageKeyHandler`、`StorageOptions`、`DebouncedFunction`、`ThrottledFunction` | 无 |
| `@axutils/common/object/object` | `deepClone` | 无 | 无 |
| `@axutils/common/object/json` | `jsonStringify`、`jsonParse`、`jsonStringifySafe`、`jsonParseSafe`、`JsonCircularReferenceError` | `JsonStringifyOptions`、`JsonParseOptions` | `safe-stable-stringify` |
| `@axutils/common/object/storage` | `StorageUtils` | `StorageType`、`StorageKeyHandler`、`StorageOptions` | 无 |
| `@axutils/common/object/timing` | `debounce`、`throttle` | `DebouncedFunction`、`ThrottledFunction` | 无 |
| `@axutils/common/object/url` | `objectToQuery`、`queryToObject` | `QueryScalar`、`QueryValue`、`QueryRecord`、`SortQueryKeysOption`、`ObjectToQueryOptions`、`QueryObject` | 无 |

ESM 的合法导入方式如下；表中没有列出的目录入口（例如 `@axutils/common/object`）没有被 `package.json#exports` 声明：

```ts
import {
  deepClone,
  StorageUtils,
  debounce,
  throttle,
  objectToQuery,
  queryToObject,
} from "@axutils/common";
import { deepClone as deepCloneFromObject } from "@axutils/common/object/object";
import {
  JsonCircularReferenceError,
  jsonParse,
  jsonParseSafe,
  jsonStringify,
  jsonStringifySafe,
} from "@axutils/common/object/json";
import { StorageUtils as StorageUtilsFromObject } from "@axutils/common/object/storage";
import {
  debounce as debounceFromTiming,
  throttle as throttleFromTiming,
} from "@axutils/common/object/timing";
import {
  objectToQuery as objectToQueryFromUrl,
  queryToObject as queryToObjectFromUrl,
} from "@axutils/common/object/url";
```

对应的 CJS `require` 方式如下：

```js
const {
  deepClone,
  StorageUtils,
  debounce,
  throttle,
  objectToQuery,
  queryToObject,
} = require("@axutils/common");
const { deepClone: deepCloneFromObject } = require("@axutils/common/object/object");
const {
  JsonCircularReferenceError,
  jsonParse,
  jsonParseSafe,
  jsonStringify,
  jsonStringifySafe,
} = require("@axutils/common/object/json");
const { StorageUtils: StorageUtilsFromObject } = require("@axutils/common/object/storage");
const {
  debounce: debounceFromTiming,
  throttle: throttleFromTiming,
} = require("@axutils/common/object/timing");
const {
  objectToQuery: objectToQueryFromUrl,
  queryToObject: queryToObjectFromUrl,
} = require("@axutils/common/object/url");
```

公开类型只能从下表列出的入口导入。JSON 配置类型和 URL query 类型不会从根入口导出；`StorageUtils` 与计时器类型则同时从根入口和各自精确子路径导出：

```ts
import type {
  DebouncedFunction,
  StorageKeyHandler,
  StorageOptions,
  StorageType,
  ThrottledFunction,
} from "@axutils/common";
import type {
  JsonParseOptions,
  JsonStringifyOptions,
} from "@axutils/common/object/json";
import type {
  ObjectToQueryOptions,
  QueryObject,
  QueryRecord,
  QueryScalar,
  QueryValue,
  SortQueryKeysOption,
} from "@axutils/common/object/url";
import type {
  StorageKeyHandler as StorageKeyHandlerFromStorage,
  StorageOptions as StorageOptionsFromStorage,
  StorageType as StorageTypeFromStorage,
} from "@axutils/common/object/storage";
import type {
  DebouncedFunction as DebouncedFunctionFromTiming,
  ThrottledFunction as ThrottledFunctionFromTiming,
} from "@axutils/common/object/timing";
```

UMD 聚合包含上述浏览器侧对象工具；`safe-stable-stringify` 等 UMD 所需依赖已打包进产物，浏览器通过全局名访问运行时 API：

```js
const copy = AxutilsCommon.deepClone({ value: 1 });
const text = AxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true });
const storage = new AxutilsCommon.StorageUtils();
const later = AxutilsCommon.debounce(() => console.log(text), 10);
console.log(copy, storage, AxutilsCommon.objectToQuery({ page: 1 }));
later();
```

## 深拷贝：`deepClone`

### `deepClone(value)`

递归复制原始值、数组、普通对象、`Date`、`RegExp`、`Map`、`Set`、循环引用和共享引用。只复制可枚举自有字符串/Symbol 属性；函数、自定义 class 实例、TypedArray、`WeakMap`、`WeakSet`、`Promise` 等未声明支持的对象原样返回。属性描述符和非枚举属性不会复制。

返回值类型为输入类型 `T`，支持类型会解除嵌套引用；`Object.create(null)` 会保留 null 原型。

```ts
import { deepClone } from "@axutils/common";

const source = { user: { id: 1 }, tags: new Set(["common"]) };
const copy = deepClone(source);
copy.user.id = 2;
console.log(source.user.id); // 1
console.log(copy.tags instanceof Set); // true

const cyclic: { self?: unknown } = {};
cyclic.self = cyclic;
const cyclicCopy = deepClone(cyclic);
console.log(cyclicCopy.self === cyclicCopy); // true
```

## 防抖与节流：`object/timing`

### `debounce(fn, wait)`

创建 trailing 防抖函数：连续调用时只保留最后一次，停止调用 `wait` 毫秒后执行。返回包装函数的 `this` 和参数会传给 `fn`，但包装函数本身不返回回调结果。`wait` 必须是 `0` 到 `2_147_483_647` 之间的有限数字；非法类型抛 `TypeError`，负数或超过定时器上限抛 `RangeError`。实现不提供 leading、flush 或 maxWait 配置。

```ts
import { debounce } from "@axutils/common/object/timing";

const save = debounce((value: string) => {
  console.log("保存", value);
}, 100);
save("draft-1");
save("draft-2"); // 100ms 后只输出 draft-2
```

### `debounced.cancel()`

取消当前尚未执行的 trailing 调用；取消后不会再触发回调。

```ts
import { debounce } from "@axutils/common/object/timing";

const send = debounce((value: string) => console.log(value), 100);
send("待发送");
send.cancel();
```

### `throttle(fn, wait)`

创建 leading + trailing 节流函数：第一次调用立即执行，周期内调用只保留最后一次并在周期结束时补执行。`wait` 使用与 `debounce` 相同的边界校验。同步立即执行的调用返回 `fn` 的结果；被排到 trailing 阶段的调用返回 `undefined`。

```ts
import { throttle } from "@axutils/common/object/timing";

const handleScroll = throttle((top: number) => top, 100);
console.log(handleScroll(10)); // 10，立即执行
console.log(handleScroll(20)); // undefined，等待 trailing 调度
```

### `throttled.cancel()`

清除待执行的 trailing 调用并重置节流状态；下一次调用会重新立即执行。

```ts
import { throttle } from "@axutils/common/object/timing";

const refresh = throttle(() => console.log("refresh"), 100);
refresh();
refresh.cancel();
refresh(); // 重新作为一个周期的 leading 调用
```

`DebouncedFunction<T>` 和 `ThrottledFunction<T>` 是公开类型导出，只描述包装函数参数、`this`、返回值和 `cancel()`；它们不对应额外的运行时对象。

## URL query：`object/url`

### `objectToQuery(value, options?)`

将对象转换为不带前导 `?` 的 query 字符串。单值和数组元素通过 `URLSearchParams.append` 写入，因此数组会展开成重复 key 并保持元素顺序。默认过滤顶层及数组中的 `null`/`undefined`；保留时会按 `String(item)` 转换。`sortKeys` 只排序 key，不改变同一 key 的数组顺序。

参数：

- `value`：键为字符串、值为 `string | number | boolean | null | undefined` 或只读数组的对象。
- `options.filterNullish`：默认 `true`。
- `options.sortKeys`：不传/`false` 保持插入顺序；`true`/`"asc"` 按 Unicode 代码点升序；`"desc"` 降序；也可以传 `Array.sort` 风格比较函数。

```ts
import { objectToQuery } from "@axutils/common/object/url";

console.log(
  objectToQuery(
    { page: 1, tag: ["typescript", "utils"], empty: null },
    { sortKeys: "asc" },
  ),
); // empty=... 会被过滤，输出 page=1&tag=typescript&tag=utils（具体 key 顺序取决于排序）

console.log(objectToQuery({ value: null }, { filterNullish: false })); // value=null
```

### `queryToObject(value)`

解析裸 query、带 query 的相对/绝对路径或 HTTP(S) URL，返回 `Record<string, string | string[]>`。hash 及其后的片段会忽略；重复 key 按出现顺序提升为数组；没有 query 的路径返回空对象。相对路径与裸 query 在没有前导斜杠时存在歧义：问号前含 `=` 或 `&` 时优先按裸 query 处理，裸 query 的 key 若含未编码问号可加前导 `?`。

```ts
import { queryToObject } from "@axutils/common/object/url";

const result = queryToObject("https://example.com/users?tag=a&tag=b#details");
console.log(result); // { tag: ["a", "b"] }
console.log(queryToObject("/users")); // {}
console.log(queryToObject("?q=a%20b")); // { q: "a b" }
```

`QueryScalar`、`QueryValue`、`QueryRecord`、`SortQueryKeysOption`、`ObjectToQueryOptions` 和 `QueryObject` 是公开类型导出，集中用于约束上述两个函数的输入输出。

## JSON：`object/json`

### `jsonStringify(value, options?)`

将值序列化为 JSON。无配置或仅传默认配置时走原生 `JSON.stringify`；配置化路径支持：

- `sortKeys`：`true`/`"asc"` 升序、`"desc"` 降序或自定义比较函数，只影响对象 key。
- `filterNullish`：过滤对象字段中的 `null` 和 `undefined`，不删除数组元素，根值也不过滤。
- `space`：数字缩进空格数或字符串缩进。
- `onCycle`：默认/显式 `"throw"` 检测循环引用后抛 `JsonCircularReferenceError`；`"skip"` 将循环字段替换为 `null`。

无配置时根值为 `undefined`、函数或 Symbol 会像原生一样返回 `undefined`；FastPath 遇到 `BigInt` 会抛原生 `TypeError`。配置化路径底层 `safe-stable-stringify` 会把 `BigInt` 序列化为数字。如需稳定排序或循环引用策略，务必显式传对应配置。

```ts
import { jsonStringify } from "@axutils/common/object/json";

const text = jsonStringify(
  { z: 1, user: { name: "Ada", unused: null }, a: 2 },
  { sortKeys: true, filterNullish: true, space: 2 },
);
console.log(text);
```

### `jsonParse<T = unknown>(text, options?)`

解析 JSON 文本；非法文本抛 `SyntaxError`。配置化路径可以递归排序结果对象 key，或删除值为 `null` 的对象字段；JSON 文本没有 `undefined`，所以 `filterNullish` 只过滤 `null`。排序会创建新对象，不保证引用相等。

```ts
import { jsonParse } from "@axutils/common/object/json";

const value = jsonParse<{ a: number; nested: { b: number } }>(
  '{"nested":{"b":2},"a":1}',
  { sortKeys: "asc" },
);
console.log(value.a, value.nested.b); // 1 2
```

### `jsonStringifySafe(value, options?)`

行为与 `jsonStringify` 相同，但吞掉所有异常并返回 `null`。根值本身不可序列化时仍可能返回 `undefined`，因此返回类型是 `string | null | undefined`。适合日志、缓存等不需要区分错误原因的场景。

```ts
import { jsonStringifySafe } from "@axutils/common/object/json";

const cyclic: { self?: unknown } = {};
cyclic.self = cyclic;
console.log(jsonStringifySafe(cyclic, { onCycle: "throw" })); // null
console.log(jsonStringifySafe(undefined)); // undefined
```

### `jsonParseSafe<T = unknown>(text, options?)`

行为与 `jsonParse` 相同，但任何异常都返回 `null`。合法文本 `"null"` 的解析结果也为 `null`，调用方不能只凭返回值区分解析失败和原文就是 `null`。

```ts
import { jsonParseSafe } from "@axutils/common/object/json";

console.log(jsonParseSafe<{ ok: boolean }>("{bad json}")); // null
console.log(jsonParseSafe<null>("null")); // null，同样表示合法 JSON null
```

### `JsonCircularReferenceError`

循环引用错误类继承 `Error`，可通过 `instanceof` 区分。`path` 属性目前始终为空字符串，仅为接口兼容，不应依赖它取得实际路径。构造函数参数是可选语义上的路径文本，通常由库内部传空字符串。

```ts
import {
  JsonCircularReferenceError,
  jsonStringify,
} from "@axutils/common/object/json";

const cyclic: { self?: unknown } = {};
cyclic.self = cyclic;
try {
  jsonStringify(cyclic, { onCycle: "throw" });
} catch (error) {
  if (error instanceof JsonCircularReferenceError) {
    console.log(error.name, error.path); // JsonCircularReferenceError ""
  }
}
```

`JsonStringifyOptions`、`JsonParseOptions` 是公开配置接口；排序配置的类型允许 `boolean | "asc" | "desc" | ((a, b) => number)`。这些类型可从 `@axutils/common/object/json` 导入，包主入口不再重复导出 JSON API。

## 通用缓存：`object/storage`

### `new StorageUtils(options?)`

创建通用缓存实例。浏览器优先使用 `localStorage`，`type: "session"` 使用 `sessionStorage`；Node 或 Web Storage 不可用时，实例创建时降级到对应类型的进程内 `Map`。缓存值走 JSON 编解码，因此不支持循环引用、`BigInt`、`undefined`、函数和 Symbol。`expired` 单位为秒，小于等于 `0` 表示不过期；非有限值抛 `TypeError`。

`prefix` 用于命名空间；`key` 回调收到已经拼接前缀的 key，返回值作为底层存储 key。`type` 只能是 `"local"` 或 `"session"`。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils({
  prefix: "app:",
  expired: 300,
  type: "local",
  key: (key) => key.toLowerCase(),
});
storage.set("User", { id: 1 });
console.log(storage.get<{ id: number }>("User"));
```

### `storage.set<T>(key, value, expired?)`

写入缓存。单次 `expired` 覆盖构造配置；小于等于 `0` 永不过期。值中出现 `undefined`、函数或 Symbol（包括嵌套字段/数组项）会抛 `TypeError`；循环引用、`BigInt` 等 JSON 不可表示值也会抛错；过期绝对时间超出安全整数范围抛 `RangeError`。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils({ prefix: "demo:" });
storage.set("token", { value: "abc" }, 60);
```

### `storage.get<T>(key)`

读取并 JSON 解码缓存；不存在、命名空间不匹配、过期或数据损坏时返回 `null`。过期条目会在读取时删除。类型参数只用于调用方声明预期结构，不会运行时校验。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils();
storage.set("user", { id: 1 });
const user = storage.get<{ id: number }>("user");
console.log(user?.id); // 1
```

### `storage.remove(key)`

删除一个缓存条目；条目不存在时也不会抛异常。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils();
storage.set("temporary", true);
storage.remove("temporary");
console.log(storage.get("temporary")); // null
```

### `storage.clear()`

只清理当前实例 `prefix` 命名空间下的条目，不调用底层 `Storage.clear()`，因此不会删除其他业务数据。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const app = new StorageUtils({ prefix: "app:" });
const other = new StorageUtils({ prefix: "other:" });
app.set("a", 1);
other.set("b", 2);
app.clear();
console.log(app.get("a")); // null
console.log(other.get("b")); // 2
```

### `storage.getSafe<T>(key)`

安全读取版本。捕获 `get` 的任何异常并返回 `null`；成功时返回缓存值或未命中的 `null`。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils();
const value = storage.getSafe<{ ok: boolean }>("possibly-invalid");
console.log(value); // null（未命中或读取失败）
```

### `storage.setSafe<T>(key, value, expired?)`

安全写入版本。成功返回 `true`；序列化、过期值校验或底层存储失败返回 `false`，不会抛异常。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils();
const ok = storage.setSafe("valid", { id: 1 });
const rejected = storage.setSafe("invalid", { value: undefined });
console.log(ok, rejected); // true false
```

### `storage.removeSafe(key)`

安全删除版本。成功返回 `true`，底层删除失败返回 `false`。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils();
console.log(storage.removeSafe("temporary")); // true
```

### `storage.clearSafe()`

安全清空版本。成功返回 `true`，底层清理失败返回 `false`。

```ts
import { StorageUtils } from "@axutils/common/object/storage";

const storage = new StorageUtils({ prefix: "app:" });
console.log(storage.clearSafe()); // true
```

`StorageType`、`StorageKeyHandler`、`StorageOptions` 是公开类型导出。通用 `StorageUtils` 的完整类型可从 `@axutils/common` 或 `@axutils/common/object/storage` 导入；Node 专用缓存见 [Node.js 缓存文档](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/object.md)。
