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
8. 实现注释规范
   - 公开方法和关键实现逻辑是否写有中文注释
   - 类型守卫、正则校验、复杂条件判断、边界值处理是否有比普通函数更详细的注释，说明判断依据和刻意排除的情况
   - 属于"轻量校验"而非完整规范实现的，是否在注释中明确标注，避免调用方误判能力边界
9. 按需依赖约定
   - 功能依赖第三方库时，是否声明为 `peerDependencies` + `peerDependenciesMeta.optional: true`
   - 是否避免将第三方库放入 `dependencies` 导致强制安装
   - 依赖第三方 peer 依赖的方法，是否在子包 README 和源码方法注释中说明了"需安装的包 + 安装命令 + 受影响的方法"
10. 构建产物验证
    - 是否存在 `smoke-esm.mjs`、`smoke-cjs.cjs`、`smoke-umd.cjs` 三个冒烟测试脚本
    - `test:dist` 是否串联调用全部三个 smoke 脚本
    - 除非同步替换 `test:dist`、根 `check` 和 CI，否则不应删除任何 smoke 脚本
11. 产物格式一致性
    - UMD 全量包是否将第三方依赖打包进去供浏览器 `<script>` 直接引入
    - ESM/CJS 产物是否将第三方依赖 external 化
    - UMD 产物文件名是否为 `index.umd.cjs`（不是 `.js`）
12. TypeScript 项目引用同步
    - 新增 `packages/*` 子包后，根 `tsconfig.json` 的 `references` 是否已包含该包
    - 子包 `tsconfig.json` 是否正确继承根 `tsconfig.base.json`
13. npm 源配置
    - `.npmrc` 中 `@axutils` scope 是否显式指向官方 npm `https://registry.npmjs.org/`
    - 默认 registry 是否指向镜像源以加速依赖安装
14. CI 流程对齐
    - `.github/workflows/ci.yml` 的验证步骤是否与根 `check` 脚本对齐（lint、typecheck、test、build、`test:dist`、`publint`）
    - CI 是否使用 `pnpm install --frozen-lockfile` 保证锁文件一致
15. 根 README 子包列表同步
    - 根 README 的"已有子包"列表是否与 `packages/` 下实际存在的子包一致
    - 每个子包是否都有指向其 README 的链接

## 输出要求

审查结论应优先报告：

- 会导致发布或使用错误的问题
- 会破坏导出边界和兼容性的风险
- 缺失的测试或文档
- 与本仓库既有约定不一致的点
