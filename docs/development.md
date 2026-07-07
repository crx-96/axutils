# 开发总览

> 本文描述的是 `axutils` 仓库的开发与构建环境要求；各发布子包的消费兼容性请以对应子包 README 为准。

## 环境要求

- `Node.js >= 20.19.0`
- 建议使用 `corepack` 管理 `pnpm`

```bash
corepack enable
corepack pnpm install
```

## npm / pnpm 源说明

- 当前仓库通过项目级 `.npmrc` 指定源配置，默认依赖安装使用镜像源。
- `@axutils` scope 已在项目级 `.npmrc` 中显式指向官方 npm：`https://registry.npmjs.org/`。
- 本仓库继续使用 `pnpm` 作为 workspace 包管理器；不要改为 `npm install`。
- 执行 `npm login` 时请显式使用官方源：`npm login --registry=https://registry.npmjs.org/`。
- 执行发布时请显式使用官方源，避免受全局镜像配置影响。

## 目录结构

```text
.
├─ docs/
│  ├─ development.md
│  └─ skills/
├─ packages/
│  └─ common/
├─ AGENTS.md
├─ biome.jsonc
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 根目录命令

- `corepack pnpm install`：安装 workspace 依赖
- `corepack pnpm lint`：运行全仓 `biome check .`
- `corepack pnpm biome:check`：直接执行 Biome 检查脚本
- `corepack pnpm typecheck`：递归执行各子包的 TypeScript 类型检查
- `corepack pnpm test`：递归执行各子包测试
- `corepack pnpm build`：递归执行各子包构建
- `corepack pnpm check`：串行执行 `lint`、`typecheck`、`test`、`build`、`@axutils/common test:dist`、`@axutils/common publint`
- `corepack pnpm changeset`：创建版本变更记录
- `corepack pnpm version-packages`：根据 changeset 计算并写入版本号
- `corepack pnpm release`：执行 npm 发布流程

## 发布流程

### 发布单个包

当只需要发布一个包的新版本时，按下面顺序执行：

```bash
corepack pnpm check
corepack pnpm changeset
corepack pnpm version-packages
corepack pnpm check
npm login --registry=https://registry.npmjs.org/
corepack pnpm release
```

步骤说明：

1. `corepack pnpm check`
   - 先完成代码质量、类型检查、测试、构建和发布产物校验。
2. `corepack pnpm changeset`
   - 选择需要发布的包。
   - 选择版本升级类型：`patch`、`minor` 或 `major`。
   - 填写本次变更说明。
3. `corepack pnpm version-packages`
   - 根据 changeset 把版本号和 changelog 写回仓库文件。
4. 再执行一次 `corepack pnpm check`
   - 确认版本写回后，构建与测试仍然通过。
5. `npm login --registry=https://registry.npmjs.org/`
   - 使用官方 npm 登录。
6. `corepack pnpm release`
   - 触发 `changeset publish`，发布本次已变更版本的包。

### 多个包一起发布

当一次需要发布多个包时，不需要逐个手工执行 `npm publish`。仍然使用 Changesets 统一管理。

常见做法有两种：

- 执行一次 `corepack pnpm changeset`，在交互过程中一次选择多个包。
- 执行多次 `corepack pnpm changeset`，分别为不同包生成多个 changeset 文件，最后统一发布。

推荐顺序：

```bash
corepack pnpm check
corepack pnpm changeset
corepack pnpm changeset
corepack pnpm version-packages
corepack pnpm check
npm login --registry=https://registry.npmjs.org/
corepack pnpm release
```

说明：

- 上面的 `corepack pnpm changeset` 可以是一条，也可以是多条，取决于你要拆成几个 changeset 记录。
- `corepack pnpm version-packages` 会统一计算所有受影响包的新版本。
- `corepack pnpm release` 会统一发布本次有版本变更的包。

### 版本号选择

版本号由 Changesets 维护，不要手动修改各个 `package.json` 的 `version` 字段。

- `patch`
  - 用于修复 bug、实现细节调整、文档修正等不会影响既有公开 API 的改动。
  - 示例：`1.2.3 -> 1.2.4`
- `minor`
  - 用于向后兼容地新增能力，例如新增导出、新增工具函数、新增子路径导出。
  - 示例：`1.2.3 -> 1.3.0`
- `major`
  - 用于不兼容变更，例如删除导出、修改函数签名、修改返回值语义、改变默认行为导致旧代码需要调整。
  - 示例：`1.2.3 -> 2.0.0`

如果不确定升级类型，先按公开 API 是否兼容旧用法来判断：

- 旧代码不需要改动：优先考虑 `patch` 或 `minor`
- 旧代码需要改动：使用 `major`

## 开发约定

- 所有可发布子包统一放在 `packages/*`
- npm 包名统一使用 `@axutils/*`
- 根目录维护统一的 TypeScript、Biome、发布和 CI 配置
- 子包必须能够单独打开，并继续使用继承配置
- 公共 API 必须通过 `exports` 显式声明
- 根目录命令与开发环境说明统一维护在本文档

## 相关文档

- [仓库根 README](../README.md)
- [新增子包流程](./skills/add-axutils-package/SKILL.md)
