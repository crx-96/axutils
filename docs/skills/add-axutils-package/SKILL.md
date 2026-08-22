---
name: add-axutils-package
description: 为 axutils monorepo 新增一个可发布的 @axutils/* 子包时使用
---

# add-axutils-package

## 目标

在 `packages/*` 下新增一个符合 `axutils` 约定的可发布子包，并保持根配置、导出、文档和测试的一致性。

## 必做检查

1. 确认包目录名与 npm 包名：目录使用 `packages/<name>`，发布名使用 `@axutils/<name>`。
2. 复用 `packages/common` 的基础结构，而不是从零随意创建。
3. 新包至少包含：
   - `package.json`
   - `README.md`
   - `tsconfig.json`
   - 必要的构建配置
   - `src/`
   - `test/`
4. `package.json` 必须包含以下字段（参考 `packages/common` 实际配置）：

   **核心字段：**
   - `name`：发布名，使用 `@axutils/<name>`
   - `version`：初始版本，首次发布前由 Changesets 维护，不要手动改
   - `type`：统一使用 `module`
   - `description`：包的一句话描述
   - `sideEffects`：设为 `false`，保证 tree-shaking 友好

   **产物入口：**
   - `main`：CJS 入口，如 `./dist/index.cjs`
   - `module`：ESM 入口，如 `./dist/index.js`
   - `types`：类型声明入口，如 `./dist/index.d.ts`
   - `exports`：显式声明所有公共子路径（`.` 及各 `./<sub>`），每个子路径提供 `import`/`require` 双条件及对应 `types`
   - `files`：发布文件白名单，如 `["dist", "README.md"]`
   - `unpkg` / `jsdelivr`：如产出 UMD 包，指向 UMD 产物路径（如 `./dist/index.umd.cjs`）

   **发布元信息：**
   - `repository`：Git 仓库地址及 `directory` 字段
   - `bugs`：issue 反馈地址
   - `homepage`：包主页
   - `engines`：声明消费方运行时最低版本要求；本项目打包产物目标为 ES2020，默认使用 `node >= 14.18.0`，如子包需要更高版本应明确说明。该消费方版本要求与仓库本地开发环境要求区分开。
   - `publishConfig`：至少 `access: public`
   - `scripts`：至少包含 `build`、`test`、`test:dist`、`typecheck`、`publint`

   **按需依赖（当功能依赖第三方库时）：**
   - `peerDependencies`：声明第三方库及版本范围
   - `peerDependenciesMeta`：对应依赖设 `optional: true`，实现按需安装，不影响不使用该功能的用户
   - 不要把第三方库放进 `dependencies`，避免强制安装
   - 可选 peer 依赖对应的 `devDependencies`（用于本地开发与测试）应放在声明该 peer 的子包 `package.json` 中，不要放到根目录；根目录 `devDependencies` 只保留全 workspace 共享的工具链依赖（如 typescript、vite、vitest、biome 等）
5. 导出必须显式声明，不直接暴露内部目录。
6. 新增公共导出后，同步补：
   - 单元测试
   - 构建后导入验证
   - `docs/examples/<name>/` 下对应的详细使用文档
   - 子包 README 中指向详细使用文档的跳转链接；链接必须使用指向 Git 仓库文件的绝对 URL，因为 `docs/examples/` 不随 npm 包发布；README 只保留包定位、基础安装、兼容性和简要能力说明，不直接写方法明细
   - 若该导出依赖第三方 peer 依赖，详细使用文档中需列出"子路径/方法 -> 需安装的包 -> 安装命令"对照，源码方法注释中也需说明依赖
   - 详细文档按源码功能目录映射：一级目录写入 `docs/examples/<name>/<目录名>.md`，嵌套目录保持层级。例如 `src/axios/*` 对应 `docs/examples/<name>/axios.md`，`src/node/crypto/*` 对应 `docs/examples/<name>/node/crypto.md`
   - 详细文档必须覆盖对应模块的全部公共 API，包括公开函数、类、对象方法、实例方法、常量和类型；每个运行时方法都必须有用途、导入方式、关键参数与返回值、边界或限制以及至少一个使用示例，公开常量和类型也要说明用途
   - 以 `package.json#exports`、主入口和聚合入口源码为准，列出对应 API 的全部合法使用方式，包括根入口、精确子路径、ESM `import`、CJS `require`、TypeScript `import type`、Node 聚合入口和 UMD 全局名称（适用时）；未导出的入口必须明确说明
   - 依赖可选第三方 peer 的 API 不得从包主入口导出，以保证根入口零第三方运行时依赖；详细文档需说明根入口不可用的原因、所需 peer、替代子路径及 UMD 是否内置依赖。Node 专属 API 的运行时限制需单独说明
   - 每份详细文档必须提供“公开导出/API -> 所需第三方 peer”映射，可按依赖完全相同的明确导出组归类；无第三方依赖的导出也要标明“无”。必须双向核对源码静态导入与 `peerDependencies`，确保每个 peer 都对应受影响 API、每个公开 API 都有依赖状态
7. 新增子包后，必须同步更新根 `tsconfig.json` 的 `references`，使新包纳入项目引用体系。
8. 新增任何 `@axutils/*` 子包后，必须在根 `README.md` 的子包列表中添加对应链接，并在必要时更新 `AGENTS.md` 中的相关约定。

## 推荐流程

1. 复制 `packages/common` 的配置骨架
2. 按实际包名调整 `package.json` 和精简版 README，并建立 `docs/examples/<name>/` 详细文档目录
3. 先写测试，再补最小实现
4. 验证 `pnpm --filter @axutils/<name> test`
5. 验证 `pnpm --filter @axutils/<name> build`
6. 验证导出声明与 `publint`
7. 验证 `pnpm --filter @axutils/<name> test:dist`，确认构建产物的 ESM/CJS/UMD 冒烟测试全部通过
8. 确认根 `tsconfig.json` 的 `references` 已包含新包，并验证根 `pnpm typecheck` 通过

## 审查重点

- 是否仍然是命名导出
- 是否保持 tree-shaking 友好
- 是否让子包单独打开时仍能使用根配置
- README 是否只保留简要说明和文档跳转，详细文档是否按源码目录映射并逐方法补齐示例
- 是否补齐测试
