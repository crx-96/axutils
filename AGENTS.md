# axutils 项目入口

本仓库是 TypeScript 工具库 monorepo；发布包位于 `packages/*`，共享工具链与调度位于根目录。

## 按任务读取

- 开发、验证、构建和发布：[docs/development.md](./docs/development.md)
- 模块边界与兼容契约：[docs/architecture.md](./docs/architecture.md)
- 当前发布包：[packages/common/AGENTS.md](./packages/common/AGENTS.md)
- 新增发布包：[新增子包 Skill](./docs/skills/add-axutils-package/SKILL.md)
- 项目审查：[项目审查 Skill](./docs/skills/review-axutils-project/SKILL.md)

## 关键约束

- 公共契约以包清单的 exports、公开入口和消费测试为准。内部目录可调整，包名、路径、类型和行为的破坏性变更必须明确说明。
- 发布包默认 ES2020、Node.js >=14.18.0；开发工具运行于根 package.json 声明的现代 Node。验证最低运行时时运行同一份已构建产物。
- 公共导出使用命名导出；通用代码不得依赖 Node 专属实现。可选 peer 保留在精确子路径，主入口不能因此增加运行时依赖。
- 第三方适配只声明所需可选 peer，并在对应子包 devDependencies 提供开发版本；根 devDependencies 维护共享工具链。
- 相对源码模块引用显式写 .js；双格式声明分别形成 .d.ts/.js 与 .d.cts/.cjs 引用图。构建入口由 exports 的产物目标派生，不重复维护另一份清单。
- 按职责拆分和复用，不能为了减少重复而统一不同客户端、平台或存储的既有语义。性能优化应有测量及行为回归证据。
- 源码和测试同时重构时，先冻结原测试，源码调整通过原测试和原产物检查后，再重构测试；新增缺陷诊断可以独立运行。
- pnpm check 是统一集成入口；新增发布包必须接入完整验证，不通过跳过缺失脚本制造通过结果。
- 每次修改 Biome 支持的代码或配置后，必须使用项目本地 Biome 格式化本次改动文件，再执行 `pnpm lint`；有格式、导入整理、对象键排序或 lint 诊断时先修复并重新检查，全部通过后交付。全仓格式化使用 `pnpm format`，排序和安全修复使用本地 `biome check --write`；普通对象启用 useSortedKeys，package.json 使用 useSortedPackageJson 保留条件 exports 顺序。有求值或枚举顺序语义的对象、故意乱序的测试数据用带原因的局部豁免保序，不批量使用 `--unsafe`；源码/测试分阶段重构时不要提前改写冻结测试。
- 公共方法和关键边界用中文注释说明意图、限制；使用文档列出真实入口、参数、返回值、示例和依赖。内部拆分不要求新增公共 API 文档。
- 调整长期约定时同步本入口、开发文档及受影响 Skill，保持职责分工，避免重复抄写全部标准。
