---
name: add-axutils-package
description: 在 axutils workspace 新增可发布子包，接入公共入口、共享构建、依赖与消费验证时使用
---

# 新增 axutils 子包

用户要求新增发布包时使用；已有包内增加普通工具无需启动本流程。开始时遵循[项目入口](../../../AGENTS.md)的 personal 必读要求。

## 确定发布边界

按[发布单元与公共入口](../../architecture.md#workspace-与公共入口)明确能力、消费环境及 peer，沿用职责匹配的已有包，或在独立发布确有意义时建立新包。目录只为真实能力创建，不复制 common 的全部业务结构。

## 建立与接入

1. 在 `packages/<name>/` 建立包清单、源码、测试和必要配置。清单要求见[依赖与发布](../../development.md#依赖与发布)，工具选项继承根配置。
2. 从新包自己的 `exports` 确认全部源码目标，按[构建与声明](../../architecture.md#构建与声明)调用共享构建。ESM、CJS 与两种声明使用一致的目标 stem，入口清单只维护在 package.json。
3. 按[依赖方向](../../architecture.md#职责与依赖方向)隔离通用、平台和可选 peer 能力；为每个公开入口记录最小 peer 集合，不跨包导入私有源码。
4. 按[子包接入要求](../../development.md#验证层次与子包接入)提供必需脚本、smoke 文件、独立导出快照和类型消费用例，登记根 TypeScript references 与 README 包列表。
5. 浏览器能力主动接入 `test:browser`，不能依赖调度器发现漏配。需要 UMD 才提供 UMD 入口、全局名、CDN 字段及对应验证。
6. 包内 AGENTS 只写功能地图、特殊契约与根规则链接；包 README 和 API 文档按[使用文档约定](../../coding-standards.md#依赖发布与使用文档)维护。

复用 common 脚本时检查包名、行为断言、peer 和类型用例，不保留原包业务假设。只有已经相同的构建机制才提升到根工具链。

## 验收

按[新增包验证范围](../../development.md#验证范围)执行集成和最低运行时消费检查，确认根调度输出实际包含新包。检查真实 tarball、无 peer/最小 peer 消费、双格式类型和文档导入路径，不能仅凭 dist 存在交付。

交付包职责、公共入口、实际验证及未覆盖范围；版本发布是[独立流程](../../releasing.md)，新增包本身不自动执行。
