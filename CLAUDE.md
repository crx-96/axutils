# axutils 项目 CLAUDE.md

本文件是 `axutils` 仓库级 Claude 补充规则，和用户级 `~/.claude/CLAUDE.md` 叠加生效。

> **同步约定**：本文件与项目根目录的 `AGENTS.md` 共同构成项目级 AI 规范。修改任一文件时，必须同步检查另一个文件是否需要对应更新，确保 Claude 侧的 `CLAUDE.md` 和 Codex/ZCode 侧的 `AGENTS.md` 在项目约定上保持一致。工具特有能力的部分（如子代理类型、skill 引用语法）按各自工具实际能力独立维护，但项目专属规则（目录结构、包管理、构建流程、文档测试要求）必须双向同步。

## 项目目标

- 本仓库是 `@axutils/*` 命名空间下的 TypeScript 工具库 monorepo。
- 所有可发布包统一放在 `packages/*`。
- 当前 `packages/common` 是首个可发布模板包，后续新增子包应尽量复用它的结构。

## AI 任务前必读入口

- 涉及仓库开发命令、环境要求、源配置、发布流程时，先读 `docs/development.md`。
- 新增 `packages/*` 子包时，先读 `docs/skills/add-axutils-package/SKILL.md`。
- 进行项目审查时，先读 `docs/skills/review-axutils-project/SKILL.md`。

## 目录与包规则

- 根目录统一维护 `pnpm workspace`、TypeScript、Biome、Changesets、CI 等配置。
- 每个可发布子包都必须至少包含：`package.json`、`README.md`、`tsconfig.json`、源码目录、测试目录。
- 新增 `packages/*` 子包时，必须同步更新根 `tsconfig.json` 的 `references`。
- npm 包名统一使用 `@axutils/*`。
- 默认使用命名导出，避免默认导出。
- 公共 API 必须通过 `package.json` 的 `exports` 显式声明，禁止依赖未声明的深层内部路径。
- 代码应保持 tree-shaking 友好：避免包级副作用，优先纯函数和按模块导出。
- 无第三方运行时依赖、且同时兼容浏览器与 Node.js 的公共工具，除提供子路径导出外，还必须从包主入口提供命名导出。仅当该工具会引入可选依赖、依赖 Node 专属能力，或明显增加主入口负担时，才允许仅提供子路径导出。
- `packages/common` 当前源码结构是 `src/index.ts + src/check/* + src/object/*`；测试目录应镜像源码分组，保持 `test/check/*`、`test/object/*` 与之对应。
- 本项目打包产物的目标 JavaScript 版本为 ES2020；新增或修改代码时应尽量使用 ES2020 兼容的语法与运行时能力，避免依赖 ES2021 及更高版本的特性。面向用户发布的 Node.js 包最低运行时版本保持为 `>=14.18.0`；仓库本地开发环境仍按根 `package.json` 的要求使用更高版本。
- `packages/common/scripts/build.mjs` 会先删除 `dist` 再重建；不要绕过这个脚本手写构建流程。
- `packages/common/scripts/smoke-esm.mjs`、`smoke-cjs.cjs`、`smoke-umd.cjs` 是发布产物验证的一部分，除非同步替换 `test:dist`、根 `check` 和 CI，否则不要删除。
- `packages/common` 产出三种格式：ESM（`.js`）、CJS（`.cjs`）、UMD（`index.umd.cjs`）。UMD 全量包将第三方依赖打包进去供浏览器 `<script>` 直接引入；ESM/CJS 产物将第三方依赖 external 化。
- 当功能依赖第三方库时，优先声明为 `peerDependencies` + `peerDependenciesMeta.optional: true`，实现按需安装，不影响不使用该功能的用户。
- 可选 peer 依赖对应的 `devDependencies`（用于本地开发与测试）应放在声明该 peer 的子包 `package.json` 中，不要放到根目录；根目录 `devDependencies` 只保留全 workspace 共享的工具链依赖。

## 包管理器与依赖安装

- 根目录 `package.json` 中的 `packageManager` 是唯一包管理器版本来源；当前固定使用 `pnpm@10.34.4`，涉及安装、测试、构建和检查时统一通过 `corepack pnpm` 执行。
- 不要使用 Claude 自带、全局或其他版本的 `pnpm` 重建 `node_modules`。不同 pnpm 版本可能生成不兼容的依赖链接布局，导致 `corepack pnpm check` 或 UMD 构建出现依赖解析错误；如果依赖目录需要重建，应使用 `corepack pnpm install --frozen-lockfile`。
- 如果当前环境没有可用的 `corepack`，不要静默改用其他 pnpm 安装依赖；应先说明环境阻塞，或让用户在本机使用项目要求的 `corepack pnpm install`，再继续验证。

## 实现注释规则

- 工具库中的公开方法和关键实现逻辑必须写中文注释，不能只保留无说明的裸实现。
- 注释应优先解释实现意图、适用范围、边界条件和已知限制，而不是简单把代码逐句翻译成自然语言。
- 类型守卫、正则校验、复杂条件判断、边界值处理这类实现，注释需要比普通工具函数更详细，说明为什么这样判断，以及刻意排除了哪些情况。
- 如果某个实现属于"轻量校验"而不是完整规范实现，必须在注释里明确写出，避免调用方误判能力边界。

## 文档与测试规则

- 新增公共导出时，必须同时补测试和对应 README 示例。
- 修改发布面、目录结构或构建策略时，必须同步更新相关文档。
- 根 README 面向仓库使用者；子包 README 面向 npm 包使用者。
- 子包 README 只能包含安装方式、运行时兼容性、可选依赖、公开导出和使用示例等包使用信息；不得写入仓库开发、构建、测试、发布、CI 或协作者流程等任何开发者信息。
- 修改子包公开 API、子路径导出或构建脚本时，必须同步更新 `package.json` 的 `exports`、README 示例和测试。
- 改动 `docs/skills/*` 下的 skill 时，必须同步更新对应 `CLAUDE.md` 中引用的约束或说明；如果某个仓库约定已经沉淀为 skill，后续变更不能只改代码不改 skill。
- 子包方法用到第三方 peer 依赖时，必须在子包 README（安装章节或方法说明处）和源码方法注释中同时说明：需要安装哪个包、安装命令、哪些方法受影响。避免使用者只看 README 或只看代码注释时遗漏依赖信息。

## 项目内 Skills

以下 skill 文档为仓库内操作规范，AI 在对应场景下应优先读取：

- 新增子包流程：[docs/skills/add-axutils-package/SKILL.md](./docs/skills/add-axutils-package/SKILL.md)
- 项目审查流程：[docs/skills/review-axutils-project/SKILL.md](./docs/skills/review-axutils-project/SKILL.md)

## Claude 专项约定

### 代码修改流程

1. 修改前先确认影响范围：读取相关文件，确认 `exports`、测试和 README 是否需要同步更新。
2. 修改完成后，按以下顺序验证：
   - 运行 `corepack pnpm check` 确保 lint + 格式 + 测试 + 构建全部通过。
   - 如果改了公共 API，确认 `exports` 和 README 已同步更新。
   - 提交前使用 `/verify` 做端到端验证。

### 子代理使用

- 本仓库的代码探索和审查（跨包追踪、依赖分析、API 面审查）可委托 `Explore` 子代理。
- 具体实现和测试补充可委托 `general-purpose` 子代理。
- 新增子包这类涉及多文件、多步骤的任务，优先使用 `EnterPlanMode` 规划后再执行。

### 常用命令

| 场景               | 命令                                   |
| ------------------ | -------------------------------------- |
| 完整检查           | `corepack pnpm check`                  |
| 仅类型检查         | `corepack pnpm check:types`            |
| 仅 lint            | `corepack pnpm check:lint`             |
| 仅测试             | `corepack pnpm test`                   |
| 构建单个包         | `cd packages/common && node scripts/build.mjs` |
| 安装依赖           | `corepack pnpm install --frozen-lockfile` |