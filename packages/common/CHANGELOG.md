# @axutils/common

## 2.0.0

### Major Changes

- 为 `RxHttpClient` 和 `PromiseHttpClient` 的构造函数及 `create` 新增 `transformHeaders` 和 `transformResponse`。请求头处理支持动态注入 Authorization 等字段，请求级 headers 按大小写不敏感规则优先覆盖；响应处理自动推导最终类型，RxJS 客户端展开 Observable 和 Promise，Promise 客户端展开 Promise。转换错误不会触发网络重试，Observable 转换支持多次发值及取消订阅。

  类型迁移：显式标注为宽泛 `HttpClientOptions` / `PromiseHttpClientOptions` 的配置变量，现在可能包含响应处理函数，因此请求结果会推导为 `unknown`。请使用 `satisfies HttpClientOptions` / `satisfies PromiseHttpClientOptions` 保留具体推导；明确不使用响应转换时，可标注为 `HttpClientOptions<undefined>` / `PromiseHttpClientOptions<undefined>`。未配置响应转换的直接构造用法仍保留原成功结果类型和运行时行为。

## 1.1.0

### Minor Changes

- 为通用及 Node 版 `StorageUtils` 新增 key 泛型，支持通过 `StorageUtils<"key1" | "key2">` 为 `set`、`get`、`remove` 及对应的 `Safe` 方法提供 key 补全和类型约束。省略泛型时仍接受任意字符串，原有值类型泛型和运行时存储行为保持兼容。

### Patch Changes

- StorageUtils添加泛型

## 1.0.0

### Major Changes

- 重构

## 0.1.0

### Minor Changes

- eed7322: 新增不依赖 RxJS 的 `@axutils/common/axios/http` Axios Promise HTTP 子路径，提供统一成功/失败结果、请求重试、AbortSignal 取消、in-flight Promise 去重和异步配置初始化能力。
- dd311de: 放宽日期时间输入的分隔符，支持 `T`、`t` 和空格；新增 `DATE_FORMAT` 与全球主要国家及地区常用的 `TIMEZONE` 常量，方便格式化和跨时区场景复用。
- 5630327: 新增 `@axutils/common/date` 时间工具子路径，提供按 Temporal 命名组织的纯日期、纯时间、无时区日期时间、带时区日期时间、绝对时间点、时间长度和当前时间 API。
- 6b2416f: 新增 `@axutils/common/object/json` 子路径，提供带配置项的 JSON 序列化/反序列化工具（`jsonStringify`、`jsonParse`、`jsonStringifySafe`、`jsonParseSafe`、`JsonCircularReferenceError`），底层使用 optional peer 依赖 `safe-stable-stringify`。
- 94d7066: 新增无第三方依赖的对象工具扩展：`object/timing` 提供 `debounce`、`throttle`，`object/object` 提供 `deepClone`，同时支持主入口导入。
- e14381a: 新增基于 Axios + RxJS 的跨端 HTTP 客户端子路径 `@axutils/common/rxjs/http`，支持异步配置、请求重试、in-flight 请求去重，以及最后一个订阅者取消时中止底层请求。修复无订阅者时的重复请求、显式去重 key 串请求和 AbortSignal 共享问题；AbortSignal 现在也能终止异步配置和 `retryDelay` 等等待阶段；非幂等方法默认不重试，可通过 `retryNonIdempotent` 显式开启。
- 1a35680: 新增 URL 查询字符串互转能力，可通过 `@axutils/common/object/url` 使用 `objectToQuery` 和 `queryToObject`。
- 1cf25dd: 新增通用与 Node 端缓存工具：可从主入口、`@axutils/common/object/storage` 和 `@axutils/common/node/object/storage` 导入 `StorageUtils`，支持命名空间、过期时间、安全方法、浏览器 Web Storage 探测降级和 Node 进程内 Map 存储。

### Patch Changes

- eed7322: 修复 Axios Promise HTTP 子路径中请求取消错误影响共享异步配置初始化的问题。
- eed7322: 修复 Axios Promise HTTP 子路径的配置初始化取消、错误重试判定、AbortSignal 形状校验和重试参数边界处理。
- 通用工具
