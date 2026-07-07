# axutils 项目指令

本文件是 `axutils` 仓库级补充规则，和用户级 `AGENTS.md` 叠加生效。

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
- `packages/common` 当前源码结构是 `src/index.ts + src/check/*`；测试目录应镜像源码分组，保持 `test/check/*` 与之对应。
- `packages/common/scripts/build.mjs` 会先删除 `dist` 再重建；不要绕过这个脚本手写构建流程。
- `packages/common/scripts/smoke-esm.mjs` 和 `smoke-cjs.cjs` 是发布产物验证的一部分，除非同步替换 `test:dist`、根 `check` 和 CI，否则不要删除。

## 实现注释规则

- 工具库中的公开方法和关键实现逻辑必须写中文注释，不能只保留无说明的裸实现。
- 注释应优先解释实现意图、适用范围、边界条件和已知限制，而不是简单把代码逐句翻译成自然语言。
- 类型守卫、正则校验、复杂条件判断、边界值处理这类实现，注释需要比普通工具函数更详细，说明为什么这样判断，以及刻意排除了哪些情况。
- 如果某个实现属于“轻量校验”而不是完整规范实现，必须在注释里明确写出，避免调用方误判能力边界。

## 文档与测试规则

- 新增公共导出时，必须同时补测试和对应 README 示例。
- 修改发布面、目录结构或构建策略时，必须同步更新相关文档。
- 根 README 面向仓库使用者；子包 README 面向包使用者。
- 子包 README 必须至少覆盖安装方式、公开导出示例，以及该子包需要直接暴露给协作者的命令说明。
- 修改子包公开 API、子路径导出或构建脚本时，必须同步更新 `package.json` 的 `exports`、README 示例和测试。
- 改动 `docs/skills/*` 下的 skill 时，必须同步更新对应 `AGENTS.md` 中引用的约束或说明；如果某个仓库约定已经沉淀为 skill，后续变更不能只改代码不改 skill。

## 项目内 skills

以下 skill 文档为仓库内操作规范，AI 在对应场景下应优先读取：

- 新增子包流程：[docs/skills/add-axutils-package/SKILL.md](./docs/skills/add-axutils-package/SKILL.md)
- 项目审查流程：[docs/skills/review-axutils-project/SKILL.md](./docs/skills/review-axutils-project/SKILL.md)
