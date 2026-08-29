---
name: add-axutils-package
description: 为 axutils monorepo 新增一个可发布的 @axutils/* 子包时使用
---

# add-axutils-package

## 目标

在 `packages/*` 下新增一个符合 `axutils` 约定的可发布子包，并保持根配置、导出、文档和测试的一致性。

## 包与发布契约

1. 新包目录使用 `packages/<name>`，发布名使用 `@axutils/<name>`；复用 `packages/common` 的基础结构，不得从零随意创建。
2. 新包至少包含 `package.json`、`README.md`、`tsconfig.json`、必要构建配置、`src/` 和 `test/`。
3. `package.json` 以 `packages/common` 的实际配置为准，并满足：
   - 核心字段：`name`、`version`、`type: "module"`、一句话 `description`、`sideEffects: false`。首次发布前也由 Changesets 维护 `version`，不得手动修改。
   - 产物入口：用 `main`、`module`、`types` 分别声明 CJS、ESM 和类型入口；`files` 声明发布白名单；`exports` 显式声明 `.` 及全部公共子路径，每个子路径均提供 `import`、`require` 及对应 `types`，禁止暴露内部路径。若产出 UMD，`unpkg`、`jsdelivr` 必须指向 UMD 产物，例如 `./dist/index.umd.cjs`。
   - 发布信息：`repository`（含 `directory`）、`bugs`、`homepage`、消费方 `engines` 和至少为 `access: public` 的 `publishConfig`。产物目标为 ES2020，`engines.node` 默认 `>=14.18.0`；需要更高版本时须明确说明，且不得与仓库开发环境要求混淆。
   - 脚本：至少包含 `build`、`test`、`test:dist`、`typecheck`、`publint`。
4. 第三方功能须按需声明：
   - 用 `peerDependencies` 声明依赖及版本，并在 `peerDependenciesMeta` 中设 `optional: true`，不得放入 `dependencies` 强制安装。
   - 对应的开发/测试依赖须放在该子包 `devDependencies`，不得放在根目录；根 `devDependencies` 仅保留全 workspace 共享工具链，如 TypeScript、Vite、Vitest、Biome。
5. 新增或修改代码应尽量保持 ES2020 兼容，避免依赖 ES2021+ 的语法或运行时能力。

## 导出、文档与测试契约

1. 公共 API 必须经 `package.json#exports` 显式声明，禁止暴露或依赖未声明的内部路径；默认使用命名导出并保持 tree-shaking 友好。
2. 无第三方运行时依赖且兼容浏览器与 Node.js 的公共工具，除子路径外还必须从包主入口命名导出；仅当引入可选依赖、依赖 Node 专属能力或明显增加主入口负担时，才可仅提供子路径导出。
3. 每个新增公共导出必须同步补齐：
   - 单元测试和构建后导入验证。
   - `docs/examples/<name>/` 下的详细文档。文档须镜像源码功能目录并保留嵌套层级，例如 `src/axios/*` 对应 `docs/examples/<name>/axios.md`，`src/node/crypto/*` 对应 `docs/examples/<name>/node/crypto.md`。
   - 子包 README 中指向详细文档的 Git 仓库文件绝对 URL；`docs/examples/` 不随 npm 包发布。README 只能保留包定位、基础安装、兼容性、简要能力和文档跳转，不得写方法明细或开发者流程。
4. 详细文档必须覆盖对应模块的全部公共函数、类、对象方法、实例方法、常量和类型。每个运行时方法须写明用途、导入方式、关键参数与返回值、边界或限制，并至少提供一个示例；常量和类型须说明用途。
5. 合法使用方式以 `package.json#exports`、主入口和聚合入口源码为准，须列出该 API 全部合法且适用的根入口、精确子路径、Node 聚合入口、ESM `import`、CJS `require`、TypeScript `import type` 和 UMD 全局名称；未导出的入口须明确说明。
6. 可选 peer API 不得从包主入口导出。详细文档须说明根入口不可用的原因、所需 peer、替代子路径及 UMD 是否内置依赖；Node 专属运行时限制须单独说明。
7. 每份详细文档必须提供“公开导出/API → 所需第三方 peer”映射，可按依赖完全相同的明确导出组归类；无第三方依赖也须标为“无”。双向核对源码静态导入与 `peerDependencies`，确保每个 peer 均对应受影响 API，每个公开 API 均有明确依赖状态。
8. 使用第三方 peer 的方法，须在详细文档和源码方法注释中同时写明依赖包、安装命令和受影响方法。

## 根配置同步

- 新包必须加入根 `tsconfig.json#references` 和根 README 的子包列表。
- 新增子包后，如需同步 `AGENTS.md` 中的相关事实、约束或说明，必须更新对应条目。

## 推荐流程

1. 复制 `packages/common` 的配置骨架，按实际包名调整 `package.json` 和精简版 README，并创建 `docs/examples/<name>/`。
2. 先写测试，再补最小实现。
3. 依次验证：
   - `pnpm --filter @axutils/<name> test`
   - `pnpm --filter @axutils/<name> build`
   - 导出声明与 `publint`
   - `pnpm --filter @axutils/<name> test:dist`，确认 ESM/CJS/UMD 冒烟测试全部通过
4. 确认根 `tsconfig.json#references` 已包含新包，并验证根 `pnpm typecheck`。

## 验收重点

- 命名导出且 tree-shaking 友好。
- 子包单独打开时仍能使用根继承配置。
- README 仅保留简要说明和绝对文档链接；详细文档镜像源码目录并逐方法补齐内容与示例。
- 单元测试、构建后导入验证、`publint`、产物冒烟测试和根类型检查均通过。
