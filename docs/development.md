# 开发总览

> 本文描述的是 `axutils` 仓库的开发与构建环境要求；各发布子包的消费兼容性请以对应子包 README 为准。

## 环境与版本口径

- 仓库开发：`Node.js >= 20.19.0`。
- CI：`ubuntu-latest`、Node.js `24`，通过 `pnpm/action-setup` 安装执行时可用的最新版 pnpm。
- 包消费：以各子包 `package.json#engines.node` 和 README 为准；当前 `@axutils/common` 为 `>=14.18.0`，不得与仓库开发版本混淆。
- 本地和 CI 均直接调用 pnpm；系统 `PATH` 中须有可用的 pnpm，仓库不通过 `packageManager` 或 Corepack 固定版本。

## 获取源码与依赖

首次开发时，在仓库根目录安装整个 workspace：

```bash
git clone https://github.com/crx-96/axutils.git
cd axutils
pnpm install
```

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 安装或更新 workspace | `pnpm install` | 按 `pnpm-lock.yaml` 解析依赖 |
| 严格复现依赖 | `pnpm install --frozen-lockfile` | 锁文件与 `package.json` 不一致时直接失败；用于 CI、发布前复现或重建依赖目录 |
| 添加共享开发工具 | `pnpm add -Dw <包名>` | 仅用于全 workspace 共享工具链 |
| 添加子包运行时依赖 | `pnpm --filter <子包名> add <包名>` | 仅用于普通运行时依赖 |
| 添加子包开发依赖 | `pnpm --filter <子包名> add -D <包名>` | 例如 `pnpm --filter @axutils/common add -D <包名>` |

第三方功能优先声明为可选 peer，并将本地开发/测试所需版本放入该子包 `devDependencies`。使用已发布包时，应在消费方项目而非本仓库根目录安装：

```bash
pnpm add @axutils/common
```

部分 API 依赖可选 peer；请按子包 README 跳转到对应详细使用文档，并按文档安装所需依赖。

## npm / pnpm 源

- 项目级 `.npmrc` 默认使用镜像源，`@axutils` scope 明确指向官方 npm `https://registry.npmjs.org/`。
- 仓库只使用 pnpm 管理 workspace，不得改用 `npm install`。
- 登录和发布时须显式使用官方源，避免受全局镜像配置影响；登录命令为 `npm login --registry=https://registry.npmjs.org/`。发布前还须确认项目 `.npmrc` 中 `@axutils` scope 仍指向官方 npm。

## 仓库结构与配置

- 可发布包位于 `packages/*`；文档和仓库内 Skills 位于 `docs/`。
- 根目录统一维护 workspace、TypeScript、Biome、Changesets、CI 和发布配置。
- 根 `tsconfig.json` 是项目引用入口，`tsconfig.base.json` 提供共享编译选项；新增子包时，必须将其加入根 `tsconfig.json#references`。

## CI 验证

CI 使用 `pnpm install --frozen-lockfile`，随后与根 `check` 脚本按同一顺序执行：`lint` → `typecheck` → `test` → `build` → `@axutils/common test:dist` → `@axutils/common publint`。

## 根目录命令

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装整个 workspace 的依赖 |
| `pnpm lint` | 运行全仓 `biome check .` |
| `pnpm biome:check` | 直接执行与 lint 相同的 Biome 检查 |
| `pnpm typecheck` | 递归执行各子包类型检查 |
| `pnpm test` | 递归执行各子包测试 |
| `pnpm build` | 递归执行各子包构建 |
| `pnpm check` | 串行执行 lint、typecheck、test、build、common 的 `test:dist` 和 `publint` |
| `pnpm changeset` | 创建版本变更记录 |
| `pnpm version-packages` | 按 changeset 计算并写入版本号 |
| `pnpm release` | 执行 npm 发布流程 |

## 发布流程

本仓库通过 Changesets 管理版本和发布。不得手动修改子包 `package.json#version`，也不得逐包执行 `npm publish`。

发布前确认以下条件：

- 当前分支包含全部待发布改动，工作区没有误带文件。
- 所有目标包均有 changeset，且范围正确；尚未创建时须在下方 `pnpm changeset` 步骤完成。
- npm 账号具有 `@axutils` scope 发布权限，登录和发布均使用官方 registry。

登录并检查当前 npm 身份：

```bash
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

### 标准流程

```bash
pnpm check
pnpm changeset
pnpm changeset status
pnpm version-packages
pnpm check
pnpm release
```

- 首次 `pnpm check` 验证发布前状态；`version-packages` 写回版本号和 changelog 后必须再执行一次，两个检查时点不得合并。
- `pnpm changeset` 选择包、升级类型并填写说明，可执行一次或多次：单包发布只能选择目标包；多包发布可一次选择多个包，或分别创建多条 changeset。
- `pnpm changeset status` 必须在写入版本号前核对全部待发布包和预期版本；范围不符时先修正 changeset 或版本变更。
- `pnpm release` 触发 `changeset publish`，会发布 workspace 中所有版本高于 npm 已发布版本的包，不支持通过该命令过滤为单包。

账号启用发布 OTP 时，传入当次验证码：

```bash
pnpm release --otp=123456
```

将示例中的 `123456` 替换为当次验证码。

### 发布完成后确认

从官方 registry 查询每个目标包，确认新版本已可见：

```bash
npm view @axutils/common version --registry=https://registry.npmjs.org/
```

发布产生的版本号、changelog 和 changeset 删除记录必须提交到仓库，避免 npm 与仓库状态不一致；并入代码提交或单独提交均按当次安排。Git tag 和 GitHub Release 也按当次发布安排执行。

### 版本号选择

| 类型 | 适用变更 | 示例 |
| --- | --- | --- |
| `patch` | 不影响既有公开 API 的 bug 修复、实现调整或文档修正 | `1.2.3 -> 1.2.4` |
| `minor` | 向后兼容地新增导出、工具函数或子路径等能力 | `1.2.3 -> 1.3.0` |
| `major` | 删除导出，或不兼容地修改函数签名、返回值语义、默认行为 | `1.2.3 -> 2.0.0` |

如果不确定升级类型，先按公开 API 是否兼容旧用法来判断：

- 旧代码无需改动：根据是否新增能力选择 `patch` 或 `minor`。
- 旧代码需要改动：使用 `major`。

## 开发约定

- 可发布子包位于 `packages/*`，包名使用 `@axutils/*`。
- 根目录维护共享的 TypeScript、Biome、发布和 CI 配置；子包单独打开时仍须使用继承配置。
- 公共 API 必须通过 `exports` 显式声明。

## 相关文档

- [仓库根 README](../README.md)
- [新增子包流程](./skills/add-axutils-package/SKILL.md)
- [项目审查流程](./skills/review-axutils-project/SKILL.md)
