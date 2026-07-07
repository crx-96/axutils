---
name: review-axutils-project
description: 审查 axutils 仓库中的子包、配置和文档是否符合项目约定时使用
---

# review-axutils-project

## 审查范围

适用于检查 `axutils` 仓库内的包结构、导出边界、构建配置、测试、文档和代码风格一致性。

## 审查清单

1. 结构
   - 可发布包是否位于 `packages/*`
   - 子包是否具备独立的 `package.json`、`README.md`、`tsconfig.json`
2. 命名
   - 包名是否使用 `@axutils/*`
   - 对外导出是否使用清晰稳定的命名
3. 导出边界
   - `exports` 是否显式声明
   - 是否暴露了不应公开的内部文件路径
   - 根入口是否仅做无副作用转发
4. tree-shaking
   - 是否声明 `sideEffects: false`
   - 是否避免了包级副作用
   - 是否优先按模块命名导出
5. 配置一致性
   - 子包是否继承根 TypeScript/Biome 规则
   - 根脚本是否仍能统一驱动 lint、test、build、typecheck
6. 测试与构建
   - 是否存在最小单元测试
   - 是否存在构建后导入验证
   - `publint` 是否可通过
7. 文档
   - 根 README 是否反映当前包列表和开发命令
   - 子包 README 是否包含安装、导入和最小示例

## 输出要求

审查结论应优先报告：

- 会导致发布或使用错误的问题
- 会破坏导出边界和兼容性的风险
- 缺失的测试或文档
- 与本仓库既有约定不一致的点
