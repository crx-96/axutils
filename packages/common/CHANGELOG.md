# @axutils/common

## 2.3.0

### Minor Changes

- 完善跨运行时兼容、边界校验与构建声明工具链：
  
  - **HTTP 客户端**：移除 `./axios/http` 与 `./rxjs/http` 的 `import.node` 门面以统一模块格式与 `axios` 实例；支持跨包/跨 Realm `AxiosHeaders` 识别与分组头大小写归一化、屏蔽及合并；修复异步配置合并 `undefined` 覆盖、`PromiseHttpClient` 响应前微任务取消窗口、`RxHttpClient` 缺省配置防护及 `transformResponse` 异常分类。
  - **日期与时间**：统一带偏移字符串在 `PlainDate`/`PlainTime`/`PlainDateTime` 的 UTC 归一化语义，严格校验 `[IANA]` 时区与日期分隔符；必填时区参数统一由 `assertTimezone` 校验并修复极限日期转换边界；补齐 `Duration` 容器校验、消除 `-0`、优化 `PlainDate.isBetween` 与大整数 `BigInt` 精确计算及溢出防护，并补充 `Europe/Kyiv` 兼容说明。
  - **缓存、JSON、校验与对象**：修复 v2 损坏缓存记录锁死、亚毫秒 TTL 与时间戳哨兵碰撞、非法存储类型校验及 Firefox/旧 WebKit 配额异常识别；校验 `jsonStringify` 非法 `onCycle` 与原生一致的 `space` 归一化，并将 `jsonParse` 后处理改为显式栈迭代以防深层嵌套栈溢出；完善函数源码词法扫描、`deepClone` 跨 Realm/`null` 原型判定及平台全局对象守卫。
  - **构建与工作区**：修复声明词法扫描的模板边界与 Unicode 标识符处理，支持 `declare module`、`import = require` 与 `.json` 校验并拒绝裸目录导入；完善 `nodeFacades` 纯默认导出与去重、`removeDirectory` 符号链接安全清理，并将 `pnpm check` 调整为先构建再执行类型检查、测试与产物消费校验。

## 2.2.0

### Minor Changes

- 改进 Axios 和 RxJS 客户端的并发去重、取消和重试。请求身份区分目标地址、查询参数及响应配置，重试保留初次传输的目标，一次性上传流遇错保留首次失败。

  修复 JSON 排序和 getter 读取、缓存前缀隔离与旧记录迁移、深拷贝、查询解析及函数识别的边界行为。改进 Base64 编解码和跨块 UTF-8 的 MD5 计算。

  修正日期时间对显式偏移、夏令时和历史时区的处理，时长字段支持原型 getter。Node 端的 ESM 与 CJS 共享存储和错误类，日期格式化保留各自的 date-fns 默认设置。UMD 附带本包和内置依赖的许可正文。

  TypeScript 调用方请留意：`isFunction` 也识别只能用 `new` 调用的构造器，对 `unknown` 使用后需先确定签名再调用。Promise HTTP 的 `signal` 应传入 `AbortController.signal` 或具备取消监听能力的对象。Node ESM 项目如需沿用应用配置的 Axios 默认值和拦截器，请通过 `axiosInstance` 传入实例。

## 2.1.1

### Patch Changes

- 修复 HTTP 默认请求头参与去重、重试快照和取消资源清理，保留请求级整组屏蔽默认鉴权头的语义；修复日期时间点范围、整数时长单次读取校验、公元 0 年月长及扩展年份序列化；修复 JSON 循环检测中的重复读取与 toJSON 边界、编码转换和损坏缓存记录处理。拆分内部源码识别与 JSON 实现，完善 Unicode 函数识别、双格式声明模板扫描、公共契约文档及回归测试。

## 2.1.0

### Minor Changes

- 新增无第三方运行时依赖的同步操作间隔守卫 `createActionGate`、RGB 颜色混合 `mixRgbColor` 和树节点路径查找 `findTreePath`，支持根入口、对应功能子路径及 UMD 消费。

  完善默认时钟能力检测，在 `performance.now` 不可用时回退到 `Date.now()`；补充参数与边界测试、ESM/CJS 类型及打包消费验证、真实浏览器用例和使用文档。

## 2.0.2

### Patch Changes

- 为 RxJS HTTP 客户端新增每次订阅独立的 `createContext`，并向请求头、成功响应和错误转换提供业务上下文与只读请求头快照。上下文在配置等待前捕获，内部重试复用，网络去重仍保留各订阅的独立转换与取消语义。

  修复 Axios 再次合并默认请求头时，默认 `false` 压过请求级显式凭据，以及重试期间混入新增默认字段的问题；收紧成功转换回调的上下文类型检查，同时保留已有响应体类型标注和请求泛型用法。

  补充会话隔离与凭据更新示例、上下文生命周期和类型回归测试，并通过真实打包产物验证示例的 ESM/CJS 声明消费。

## 2.0.1

### Patch Changes

- 完善 RxJS HTTP 客户端的统一转换能力：新增实例级 `transformError`，在重试结束后处理请求、配置和转换异常，并保留错误原因及取消语义。

  新增 `RxHttpClient.withTypes` 响应类型映射，使成功和错误转换结果保留单次请求泛型，支持直接使用各请求方法返回业务结果，同时保留原有客户端用法。

  补充运行时、编译期和打包消费测试，以及动态 Bearer Token、统一响应和错误转换的完整使用示例。

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
