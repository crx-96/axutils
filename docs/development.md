# 开发总览

> 本文描述的是 `axutils` 仓库的开发与构建环境要求；各发布子包的消费兼容性请以对应子包 README 为准。

## 环境要求

- `Node.js >= 20.19.0`
- 系统 `PATH` 中已安装可用的 `pnpm`；项目不固定其版本

## 获取源码与安装依赖

首次开发时，克隆仓库并在根目录安装整个 workspace 的依赖：

```bash
git clone https://github.com/crx-96/axutils.git
cd axutils
pnpm install
```

常用安装方式：

- `pnpm install`：按 `pnpm-lock.yaml` 安装或更新整个 workspace 的依赖。
- `pnpm install --frozen-lockfile`：严格按锁文件安装；锁文件与 `package.json` 不一致时直接失败，适合 CI 或发布前复现环境。
- `pnpm add -Dw <包名>`：向仓库根目录添加全 workspace 共用的开发工具。
- `pnpm --filter <子包名> add <包名>`：向指定子包添加运行时依赖。
- `pnpm --filter <子包名> add -D <包名>`：向指定子包添加开发依赖。

例如，只给 `@axutils/common` 添加开发依赖：

```bash
pnpm --filter @axutils/common add -D <包名>
```

如果是使用本仓库已经发布的 npm 包，请在消费方项目中安装，而不是在本仓库根目录执行：

```bash
pnpm add @axutils/common
```

部分方法依赖可选 peer dependency；使用相关功能时，还需要按照子包 README 一并安装对应依赖。

## npm / pnpm 源说明

- 当前仓库通过项目级 `.npmrc` 指定源配置，默认依赖安装使用镜像源。
- `@axutils` scope 已在项目级 `.npmrc` 中显式指向官方 npm：`https://registry.npmjs.org/`。
- 本仓库继续使用 `pnpm` 作为 workspace 包管理器；不要改为 `npm install`。
- 执行 `npm login` 时请显式使用官方源：`npm login --registry=https://registry.npmjs.org/`。
- 执行发布时请显式使用官方源，避免受全局镜像配置影响。

## 目录结构

```text
.
├─ .changeset/
│  └─ config.json
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ .npmrc
├─ docs/
│  ├─ development.md
│  └─ skills/
├─ packages/
│  └─ common/
├─ AGENTS.md
├─ LICENSE
├─ README.md
├─ biome.jsonc
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ tsconfig.json
```

> `tsconfig.json`（根）是项目引用入口，其 `references` 指向各子包；`tsconfig.base.json` 是共享编译选项。新增 `packages/*` 子包时，必须在根 `tsconfig.json` 的 `references` 中添加该包。

## CI 环境说明

CI（`.github/workflows/ci.yml`）运行在 `ubuntu-latest`，使用 `pnpm/action-setup` 安装执行时可用的最新版 `pnpm`，Node.js 版本为 `24`。本地和 CI 命令都直接调用 `pnpm`，仓库不通过 `packageManager` 或 Corepack 固定其版本。

CI 的验证步骤与根 `check` 脚本对齐：`lint` → `typecheck` → `test` → `build` → `@axutils/common test:dist` → `@axutils/common publint`。

关于 Node.js 版本口径：

- **CI 运行版本**：Node.js `24`（CI 实际执行环境）
- **仓库开发要求**：`Node.js >= 20.19.0`（根 `package.json` 的 `engines.node`，本地开发最低版本）
- **消费方运行时兼容**：各子包 `package.json` 的 `engines.node`（当前 `@axutils/common` 声明 `>= 14.18.0`），面向包使用者，与仓库开发要求不同

## 根目录命令

- `pnpm install`：安装整个 workspace 的依赖
- `pnpm lint`：运行全仓 `biome check .`
- `pnpm biome:check`：直接执行 Biome 检查脚本
- `pnpm typecheck`：递归执行各子包的 TypeScript 类型检查
- `pnpm test`：递归执行各子包测试
- `pnpm build`：递归执行各子包构建
- `pnpm check`：串行执行 `lint`、`typecheck`、`test`、`build`、`@axutils/common test:dist`、`@axutils/common publint`
- `pnpm changeset`：创建版本变更记录
- `pnpm version-packages`：根据 changeset 计算并写入版本号
- `pnpm release`：执行 npm 发布流程

## 发布流程

本仓库通过 Changesets 管理版本号和发布。不要手动修改子包 `package.json` 中的 `version`，也不要逐个直接执行 `npm publish`。

发布前确认以下条件：

- 当前分支包含准备发布的全部改动，工作区没有误带的文件。
- 已为需要发布的包创建 changeset。
- npm 账号具有 `@axutils` scope 的发布权限。
- 发布命令使用官方 npm registry。

登录并检查当前 npm 身份：

```bash
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

### 发布单个包

当只需要发布一个子包的新版本时，changeset 中只能选择这个包。以 `@axutils/common` 为例：

```bash
pnpm check
pnpm changeset
pnpm changeset status
pnpm version-packages
pnpm check
pnpm release
```

步骤说明：

1. `pnpm check`
    - 先完成代码质量、类型检查、测试、构建和发布产物校验。
2. `pnpm changeset`
    - 选择需要发布的包。
    - 选择版本升级类型：`patch`、`minor` 或 `major`。
    - 填写本次变更说明。
3. `pnpm changeset status`
    - 在写入版本号前检查 Changesets 计算出的待发布包及版本，确认列表中没有其他包。
4. `pnpm version-packages`
    - 根据 changeset 把版本号和 changelog 写回仓库文件。
5. 再执行一次 `pnpm check`
    - 确认版本写回后，构建与测试仍然通过。
6. `pnpm release`
    - 触发 `changeset publish`，发布 workspace 中所有版本高于 npm 已发布版本的包。

`pnpm release` 本身没有“只发布指定包”的过滤语义。单包发布依赖前面的版本变更范围控制：如果 `pnpm changeset status` 显示多个待发布包，执行该命令会一起发布它们，应先检查 changeset 和版本变更是否符合预期。

如果 npm 账号启用了发布 OTP，在发布时传入当次验证码：

```bash
pnpm release --otp=123456
```

请将示例中的 `123456` 替换为当次验证码。

### 多个包一起发布

当一次需要发布多个包时，不需要逐个手工执行 `npm publish`。仍然使用 Changesets 统一管理。

常见做法有两种：

- 执行一次 `pnpm changeset`，在交互过程中一次选择多个包。
- 执行多次 `pnpm changeset`，分别为不同包生成多个 changeset 文件，最后统一发布。

推荐顺序：

```bash
pnpm check
pnpm changeset
pnpm changeset
pnpm changeset status
pnpm version-packages
pnpm check
pnpm release
```

说明：

- 上面的 `pnpm changeset` 可以是一条，也可以是多条，取决于你要拆成几个 changeset 记录。
- `pnpm changeset status` 用于在写入版本号前核对全部待发布包及预期版本。
- `pnpm version-packages` 会统一计算所有受影响包的新版本并写回文件。
- `pnpm release` 会统一发布 workspace 中所有尚未发布的新版本，无需为每个包分别运行发布命令。

### 发布完成后确认

发布完成后，可从官方 registry 查询版本，确认 npm 已可见：

```bash
npm view @axutils/common version --registry=https://registry.npmjs.org/
```

多个包一起发布时，对每个目标包分别执行一次查询。发布产生的版本号、changelog 和 changeset 删除记录必须提交到仓库，避免 npm 已发布新版本而仓库仍保留旧版本信息；这些文件是并入代码提交还是单独作为发布提交，按当次发布安排执行。是否创建 Git tag 或 GitHub Release，也按仓库当次发布安排执行。

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
