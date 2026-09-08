---
name: add-axutils-package
description: 在 axutils workspace 新增可发布的 @axutils 子包，并接入共享构建、导出和消费验证时使用
---

# 新增 axutils 子包

根据新包职责和现有上下文建立发布单元。入口与依赖设计可查[架构契约](../../architecture.md)，命令与环境可查[开发文档](../../development.md) 对应章节；已明确的部分直接实施。以 common 的包清单与薄工具入口为参考，业务实现、可选 peer 和专属测试按新包需求选择。

以下按职责列出接入要点，可结合已有文件和依赖关系安排工作；会影响包名、公共行为或发布范围的未决选择按[项目任务判断](../../../AGENTS.md#任务判断)处理。

## 建立发布单元

- 在 packages/<name> 建立 package.json、README、AGENTS.md、tsconfig.json、tsconfig.build.json、src、test 和 scripts；AGENTS 登记本包入口、特有契约与回到根规则的路由。
- 包名使用 @axutils/<name>，声明描述、仓库 directory、许可/发布信息、type:module、sideEffects:false 和 files 白名单；版本交给 Changesets。
- 在根 tsconfig references 和 README 包列表登记新包；继承共享 TypeScript/Biome 选项，集中复用配置实现。
- 工具配置文件加入所在目录的 tsconfig；Node 工具使用 node 类型，浏览器测试的 DOM 类型留在各自配置中。需要单独打开子包时，复用 common 的工作区格式化设置并调整相对路径，使编辑器解析同一份根 Biome 配置和本地版本。

## 入口、依赖与构建

- exports 显式列出公共路径；每项提供 import.types/default 和 require.types/default，分别对应 dist 下 .d.ts/.js 与 .d.cts/.cjs。
- 按[构建与声明](../../architecture.md#构建与声明)组织源码和双格式引用，沿用 exports 产物目标派生入口的共享机制。
- scripts/build.mjs 调用根 scripts/build/package.mjs 的 buildPackage(packageRoot, options)。需要 UMD 时提供入口和全局名称，同时声明一致的 unpkg/jsdelivr；不需要时省略 UMD 配置。
- 兼容目标沿用[项目工程约定](../../../AGENTS.md#工程约定)，依赖按[职责与依赖方向](../../architecture.md#职责与依赖方向)隔离；对应功能的可选 peer 与开发依赖放本包。

## 验证接入

- 提供 build、typecheck、test、test:dist、test:consumer、publint；浏览器能力提供 test:browser。缺少必要脚本会使根 pnpm check 失败。
- scripts/smoke-esm.mjs 和 smoke-cjs.cjs 各自加载全部公开入口，共用本包行为契约和独立导出快照；UMD 包另提供 smoke-umd.cjs，供 root test:runtime 使用。
- test:dist 消费已有 dist，单独组合命令可串联 build 与 test:dist；根 check 的后续阶段复用前面构建的同一份产物。
- 建立本包最小 peer 映射和真实 tarball 消费 fixture，验证无 peer 主入口及 NodeNext ESM/CJS 类型。common 的消费脚本可作为实现参考，包名和业务类型断言对应本包契约。
- 验收按[验证范围](../../development.md#验证范围)的新包场景完成集成与最低运行时检查；格式与 lint 的处理见[修改后检查](../../development.md#编辑器与修改后检查)。

## 使用文档

包 README 提供定位、安装、兼容性和详细文档链接；API 说明放 docs/examples/<name>，按公开功能组织并保持现有链接可用。逐项说明真实入口、参数、返回值、边界、示例和 peer 需求；指向仓库文档的链接使用绝对 Git URL，文档不随 npm 包发布。
