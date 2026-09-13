# @axutils/common 局部入口

这是 axutils workspace 的公共工具包。需要共享规则、公共文档或跨包关系时，可从[根 AGENTS.md](../../AGENTS.md) 定位相关主题；单独打开本目录时也可由该入口查找开发命令，已知内容可直接复用。

目录落位、拆分和依赖遵循[架构基线](../../docs/architecture.md)；本文只维护 common 的功能地图和特有契约。

## 功能与契约

以下路径相对于本包 `src/`，表示内部职责；消费者合法入口以 [package.json 的 exports](./package.json) 为准。

| 功能与位置 | 职责及兼容要求 |
| --- | --- |
| `index.ts`、`check/`、`object/` | 根入口选择无第三方运行时依赖的基础能力；不汇入 `object/json.ts` 及其可选 peer |
| `axios/http.ts` → `axios/http/` | Promise HTTP 门面与类型、配置、错误、取消、身份、客户端实现；请求调用即执行 |
| `rxjs/http.ts` → `rxjs/http/` | Observable HTTP 的对应职责；订阅时执行；重试范围、配置上限、错误字段和取消时机保留与 Promise 客户端的差异 |
| `internal/http/` | 共享原语、底层错误识别和身份序列化；错误识别依赖 Axios，身份序列化复用 JSON/MD5。各客户端决定最终策略，共享模块不引用客户端实现 |
| `internal/crypto/`、`crypto/`、`node/crypto/` | 字节校验与编解码共用；通用摘要使用 spark-md5，Node 摘要使用 node:crypto |
| `object/storage.ts` → `object/storage/` | 公共 API 与编排、后端和 JSON 记录/过期处理；读取 JSON 副本，local/session 各有降级空间 |
| `node/object/storage.ts` | 进程内 Map 保存原引用；不因方法相似而与通用存储合并值语义 |
| `date/` → `date/internal/` | 公开日期能力复用日历、解析、时区、时长与校验；日期字段以 UTC 对齐，目标时区重复/缺失时间和历史年份保留 date-fns-tz 的限制 |
| `object/object.ts` | deepClone 保留可枚举键快照、getter 读取顺序、内部槽判断、跨 Realm、共享引用和不支持类型的既有行为；替换算法时验证这些差异 |
| `node/index.ts`、`umd.ts` | Node 通过显式 `/node` 选择；UMD 全局名为 `AxutilsCommon`，内置通用可选依赖，不包含 Node 实现 |

根入口的日期常量通过 `date/constant.ts` 直接导出，避免引入整个日期模块及其 peer。当前所有入口的最小依赖由 [peer 映射](./scripts/consumer/peers.json)记录，公开符号基线由[导出快照](./scripts/smoke/exports.json)记录。

## 验证与编辑器

验证范围与命令见[开发文档](../../docs/development.md#验证范围)。本包 `test/` 按功能与行为分组，日期宿主时区检查使用独立进程；`test-browser/` 验证真实包消费。

单独打开本包时，`.vscode/settings.json` 仍指向根 Biome 配置与依赖；顶层工具配置纳入本层 tsconfig，浏览器测试使用 `test-browser/tsconfig.json` 的 DOM 配置。
