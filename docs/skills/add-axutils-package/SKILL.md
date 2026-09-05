---
name: add-axutils-package
description: 在 axutils workspace 新增可发布的 @axutils 子包，并接入共享构建、导出和消费验证时使用
---

# 新增 axutils 子包

先读 [架构契约](../../architecture.md) 与 [开发入口](../../development.md)。复用 common 的包清单与薄工具入口，不复制其业务实现、全部可选 peer 或专属测试。

## 建立发布单元

- 在 packages/<name> 建立 package.json、README、AGENTS.md、tsconfig.json、tsconfig.build.json、src、test 和 scripts；AGENTS 只登记本包入口与回到根规则的路由。
- 包名使用 @axutils/<name>，声明描述、仓库 directory、许可/发布信息、type:module、sideEffects:false 和 files 白名单；版本交给 Changesets。
- 在根 tsconfig references 和 README 包列表登记新包；继承共享 TypeScript/Biome 选项，不复制配置实现。
- 工具配置文件加入所在目录的 tsconfig；Node 工具使用 node 类型，浏览器测试的 DOM 类型留在各自配置中。需要单独打开子包时，复用 common 的工作区格式化设置并调整相对路径，使编辑器解析同一份根 Biome 配置和本地版本。

## 入口、依赖与构建

- exports 显式列出公共路径；每项提供 import.types/default 和 require.types/default，分别对应 dist 下 .d.ts/.js 与 .d.cts/.cjs。
- 当前共享构建从产物目标派生同位置源码：dist/feature/index.js 对应 src/feature/index.ts。相对源码模块引用使用 .js。
- scripts/build.mjs 调用根 scripts/build/package.mjs 的 buildPackage(packageRoot, options)。需要 UMD 时提供入口和全局名称，同时声明一致的 unpkg/jsdelivr；不需要时省略 UMD 配置。
- 默认 ES2020、Node >=14.18.0。通用主入口不加载 Node 能力或可选 peer；对应功能的 peer 与开发依赖放本包。

## 验证接入

- 提供 build、typecheck、test、test:dist、test:consumer、publint；浏览器能力提供 test:browser。缺少必要脚本会使根 pnpm check 失败。
- scripts/smoke-esm.mjs 和 smoke-cjs.cjs 各自加载全部公开入口，共用本包行为契约和独立导出快照；UMD 包另提供 smoke-umd.cjs，供 root test:runtime 使用。
- test:dist 只消费 dist，单独组合命令可串联 build 与 test:dist。不要在根 check 的后续阶段再构建包。
- 建立本包最小 peer 映射和真实 tarball 消费 fixture，验证无 peer 主入口及 NodeNext ESM/CJS 类型。common 的消费脚本可作为实现参考，包名和业务类型断言必须替换为本包契约。
- 依次运行本包测试、根 build、产物/消费验证与 publint，最后根 pnpm check。对最低运行时使用 AXUTILS_TEST_NODE 验证同一产物。
- 修改结束先用本地 Biome 格式化改动文件并修复对象键排序，再运行根 `pnpm lint`，修复全部诊断后进入其余验证；package.json 使用 useSortedPackageJson，保留 exports 的条件次序。

## 使用文档

包 README 提供定位、安装、兼容性和详细文档链接；API 说明放 docs/examples/<name>，按公开功能组织并保持现有链接可用。逐项说明真实入口、参数、返回值、边界、示例和 peer 需求；指向仓库文档的链接使用绝对 Git URL，文档不随 npm 包发布。
