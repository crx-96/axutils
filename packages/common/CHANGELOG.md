# @axutils/common

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
