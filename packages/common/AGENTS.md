# @axutils/common 局部入口

这是 axutils workspace 的公共工具包。需要共享规则、公共文档或跨包关系时，可从[根 AGENTS.md](../../AGENTS.md) 定位相关主题；单独打开本目录时也可由该入口查找开发命令，已知内容可直接复用。

## 本包结构

- src 下现有公开文件是兼容入口，合法子路径只由 package.json#exports 声明。
- axios/http 与 rxjs/http 各自维护类型、配置、错误及执行生命周期；真正相同的纯逻辑在 internal/http。
- internal/crypto 共享字节算法；node/crypto 与 crypto 保留各自摘要实现。
- object/storage 分离后端与记录处理；Node 存储保留原引用，通用存储使用 JSON。
- date/internal 按日历字段、解析、时区、时长和校验分工；目标时区歧义行为遵从现有 peer。
- test 按功能与行为分组，test/helpers 只存测试工具；test-browser 验证真实消费页面。
- scripts/smoke 验证全部公开导出；scripts/consumer 验证发布包与最小 peer 组合；构建复用根 scripts/build。

## 本包契约

- 保留显式 /node 选择方式，UMD 全局名为 AxutilsCommon。UMD 包含通用可选依赖，不包含 Node 实现。
- 根入口保持无第三方运行时依赖。新增导出时同步导出快照、peer 映射、产物/消费测试与使用文档。
- Promise 与 RxJS 的重试范围、配置上限、错误结构及取消时机有区别，不因内部共享而统一。
- deepClone 保留可枚举键快照、跨 Realm、共享引用和不支持类型的既有行为；评估 structuredClone 等实现替换时，以这些差异的兼容性证据判断适用性。
- 验证范围与命令见[开发文档](../../docs/development.md#验证范围)。单独打开本包时，`.vscode/settings.json` 仍指向根 Biome 配置与依赖；顶层工具配置纳入本层 tsconfig，浏览器测试使用 test-browser 的 DOM 配置。
