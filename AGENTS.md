# axutils 项目指令

本文件补充 `axutils` 仓库规则，与用户级 `AGENTS.md` 叠加生效。

## 项目定位

- 本仓库是 `@axutils/*` TypeScript 工具库 monorepo；所有可发布包均位于 `packages/*`。
- `packages/common` 是首个可发布模板包；新增子包应尽量复用其结构。

## AI 任务前必读

- 开发命令、环境要求、源配置或发布流程：`docs/development.md`
- 新增 `packages/*` 子包：`docs/skills/add-axutils-package/SKILL.md`
- 项目审查：`docs/skills/review-axutils-project/SKILL.md`

## 包、导出与构建

- 根目录统一维护 pnpm workspace、TypeScript、Biome、Changesets 和 CI 配置。
- 每个可发布子包至少包含 `package.json`、`README.md`、`tsconfig.json`、源码目录和测试目录；包名统一使用 `@axutils/*`。新增子包时，必须同步更新根 `tsconfig.json#references`。
- 公共 API 必须经 `package.json#exports` 显式声明，禁止依赖未声明的深层内部路径。默认使用命名导出，避免默认导出；保持 tree-shaking 友好，避免包级副作用，优先纯函数和按模块导出。
- 无第三方运行时依赖且兼容浏览器与 Node.js 的公共工具，除子路径外还必须从包主入口命名导出；仅当引入可选依赖、依赖 Node 专属能力或明显增加主入口负担时，才可仅提供子路径导出。
- `packages/common` 的源码与测试应按功能分组镜像，例如 `src/check/*`、`src/object/*` 分别对应 `test/check/*`、`test/object/*`。
- 发布产物目标为 ES2020；新增或修改代码应尽量使用 ES2020 兼容的语法和运行时能力，避免依赖 ES2021+。面向用户的 Node.js 包最低运行时版本保持为 `>=14.18.0`；仓库本地开发版本以根 `package.json` 为准。
- `packages/common/scripts/build.mjs` 会先删除再重建 `dist`，不得绕过该脚本手写构建流程。
- `packages/common/scripts/smoke-esm.mjs`、`smoke-cjs.cjs`、`smoke-umd.cjs` 均属发布产物验证；除非同步替换 `test:dist`、根 `check` 和 CI，否则不得删除。
- `packages/common` 同时产出 ESM（`.js`）、CJS（`.cjs`）和 UMD（`index.umd.cjs`）：UMD 内置第三方依赖，供浏览器 `<script>` 直接引入；ESM/CJS 将第三方依赖 external 化。
- 第三方功能优先使用可选 peer（`peerDependencies` + `peerDependenciesMeta.optional: true`），实现按需安装，不影响未使用该功能的用户。对应的开发/测试依赖须放在声明该 peer 的子包 `devDependencies`，不得放在根目录；根 `devDependencies` 仅保留全 workspace 共享工具链。

## 包管理器与依赖安装

- 仓库不固定 pnpm 版本，也不在根 `package.json` 声明 `packageManager`；本地命令直接使用系统 `PATH` 中的 pnpm，CI 通过 `pnpm/action-setup` 安装执行时可用的最新版。
- 缺少 pnpm 时先报告环境阻塞，不得静默改用其他包管理器；重建依赖目录时使用 `pnpm install --frozen-lockfile`。

## 实现注释

- 公开方法和关键实现必须有中文注释；注释应优先说明意图、范围、边界和已知限制，不得只逐句复述代码。
- 类型守卫、正则校验、复杂条件和边界值处理还须说明判断依据及刻意排除项；轻量校验必须明确其非完整规范实现的能力边界。

## 文档与测试

- 新增公共导出时，必须同步补测试和 `docs/examples/<包名>/` 下的详细使用文档；发布面、目录结构或构建策略变更时，必须同步更新相关文档。
- 根 README 面向仓库使用者；子包 README 面向 npm 包使用者，只能包含包定位、基础安装、运行时兼容性、简要能力说明和详细文档跳转，不得写方法明细或开发、构建、测试、发布、CI、协作者流程等开发者信息。
- 详细文档统一放在 `docs/examples/<包名>/`，并镜像源码功能目录：一级目录对应同名 Markdown 文件，嵌套目录保持层级。例如 `src/axios/*` 对应 `docs/examples/<包名>/axios.md`，`src/node/crypto/*` 对应 `docs/examples/<包名>/node/crypto.md`。
- 子包 README 和详细使用文档中的跳转必须使用指向 Git 仓库文件的绝对 URL，不得依赖 npm 包内不存在的 `docs/examples/` 相对路径；`docs/examples/` 不随 npm 包发布。
- 详细文档必须覆盖对应模块的全部公共函数、类、对象方法、实例方法、常量和类型。每个运行时方法须逐一写明用途、导入方式、关键参数与返回值、边界或限制，并至少提供一个示例；公开常量和类型须说明用途。
- 合法使用方式以 `package.json#exports`、主入口和聚合入口源码为准，必须列出该 API 全部合法且适用的根入口、精确子路径、Node 聚合入口、ESM `import`、CJS `require`、TypeScript `import type` 和 UMD 全局名称。未导出的入口须明确说明，禁止将 UMD 聚合导出误写为 ESM/CJS 根入口导出。
- 可选 peer API 不得从包主入口导出，以保持 `@axutils/common` 根入口零第三方运行时依赖。详细文档须说明根入口不可用的原因、所需 peer、替代子路径和 UMD 是否内置依赖；Node 专属限制须单独说明，不得笼统归因于第三方依赖。
- 每份详细文档必须提供“公开导出/API → 所需第三方 peer”映射，可按依赖完全相同的明确导出组归类；无第三方运行时依赖的导出也须标为“无”。审查时须双向核对源码静态导入与 `peerDependencies`，确保每个 peer 均可追溯到受影响 API，每个公开 API 均有明确依赖状态。
- 使用第三方 peer 的方法，还必须在对应详细文档和源码方法注释中同时写明依赖包、安装命令和受影响方法；子包 README 只提示存在可选依赖并链接详细文档。
- 修改子包公开 API、子路径导出或构建脚本时，必须同步更新 `package.json#exports`、子包 README 文档跳转、对应详细文档和测试。
- 修改 `docs/skills/*` 时，必须同步更新对应 `AGENTS.md` 中的引用、约束或说明；已沉淀为 skill 的约定变更不得只改代码而不改 skill。

## 项目内 skills

- 新增子包：[docs/skills/add-axutils-package/SKILL.md](./docs/skills/add-axutils-package/SKILL.md)
- 项目审查：[docs/skills/review-axutils-project/SKILL.md](./docs/skills/review-axutils-project/SKILL.md)
