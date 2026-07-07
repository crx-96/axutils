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
4. `package.json` 必须包含：
   - `name`
   - `version`
   - `type`
   - `sideEffects`
   - `exports`
   - `types`
   - `repository`
   - `bugs`
   - `homepage`
5. 导出必须显式声明，不直接暴露内部目录。
6. 新增公共导出后，同步补：
   - 单元测试
   - 构建后导入验证
   - README 使用示例
7. 如新增包会影响根文档或仓库约定，同步更新根 `README.md` 与 `AGENTS.md`。

## 推荐流程

1. 复制 `packages/common` 的配置骨架
2. 按实际包名调整 `package.json` 和 README
3. 先写测试，再补最小实现
4. 验证 `pnpm --filter @axutils/<name> test`
5. 验证 `pnpm --filter @axutils/<name> build`
6. 验证导出声明与 `publint`

## 审查重点

- 是否仍然是命名导出
- 是否保持 tree-shaking 友好
- 是否让子包单独打开时仍能使用根配置
- 是否补齐文档和测试
