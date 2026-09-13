# axutils 项目入口

本仓库是 TypeScript 工具库 monorepo；发布包位于 `packages/*`，共享工具链与调度位于根目录。

## 按任务读取

以下链接供定位相关主题，按当前决定所需读取相应章节；已加载且仍适用的内容可直接复用，新增信息缺口再展开。

- 开发、验证、构建和发布：[docs/development.md](./docs/development.md)
- 编码、类型边界、异常与审查依据：[docs/coding-standards.md](./docs/coding-standards.md)
- 新功能落位、目录与文件拆分、依赖及公共入口：[docs/architecture.md](./docs/architecture.md)
- 当前发布包：[packages/common/AGENTS.md](./packages/common/AGENTS.md)
- 新增发布包：[新增子包 Skill](./docs/skills/add-axutils-package/SKILL.md)
- 项目审查：[项目审查 Skill](./docs/skills/review-axutils-project/SKILL.md)

## 架构基线与规则维护

- 本仓库后续新增功能、子包及范围内重构遵循[架构基线](./docs/architecture.md)。先按职责确定所属包、功能目录、公开入口与依赖，再实现；沿用基线的常规选择直接推进。
- 规则分工：本入口负责导航与适用范围；架构文档负责目录、拆分和依赖契约；编码规范负责实现质量；开发文档负责环境、验证和发布；包内 AGENTS 只补充本包结构与特有契约；Skill 负责特定任务的操作要点，并引用规范。各主题在归属处维护，避免复制段落、配置数值和命令清单。
- 用户明确要求优先；已有公共契约和工具配置是兼容性依据。新规范用于新增及本次确需修改的内容，旧代码不为符合目录示例而批量搬迁。审查区分实际缺陷、规范差距与可选改进。
- 架构确需演进时，在同一次变更中说明原因、依赖和兼容影响，更新架构文档及受影响入口、测试和 Skill；会改变公共行为或范围且现有信息不足的选择再询问。基线约束后续实现，也允许有依据的调整。
- 验证范围统一见[开发文档](./docs/development.md#验证范围)；修改 Biome 支持的代码或配置后，执行[修改后检查](./docs/development.md#编辑器与修改后检查)。
