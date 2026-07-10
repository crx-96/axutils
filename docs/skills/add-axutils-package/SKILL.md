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
   - `engines`：声明消费方运行时最低版本要求（如 `node >= 14.18.0`），与仓库开发要求区分
   - `publishConfig`：至少 `access: public`
   - `scripts`：至少包含 `build`、`test`、`test:dist`、`typecheck`、`publint`

   **按需依赖（当功能依赖第三方库时）：**
   - `peerDependencies`：声明第三方库及版本范围
   - `peerDependenciesMeta`：对应依赖设 `optional: true`，实现按需安装，不影响不使用该功能的用户
   - 不要把第三方库放进 `dependencies`，避免强制安装
5. 导出必须显式声明，不直接暴露内部目录。
6. 新增公共导出后，同步补：
   - 单元测试
   - 构建后导入验证
   - README 使用示例
   - 若该导出依赖第三方 peer 依赖，README 中需列出"子路径/方法 -> 需安装的包 -> 安装命令"对照，源码方法注释中也需说明依赖
7. 新增子包后，必须同步更新根 `tsconfig.json` 的 `references`，使新包纳入项目引用体系。
8. 新增任何 `@axutils/*` 子包后，必须在根 `README.md` 的子包列表中添加对应链接，并在必要时更新 `AGENTS.md` 中的相关约定。

## 推荐流程

1. 复制 `packages/common` 的配置骨架
2. 按实际包名调整 `package.json` 和 README
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
- 是否补齐文档和测试
