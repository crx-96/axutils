# axutils 项目入口

本仓库是面向浏览器和 Node 的 TypeScript 工具库 monorepo。发布单元位于 `packages/*`，根目录维护共享构建、验证和版本管理；页面应用的路由、组件和状态目录不适用于本库。

## 项目个人规则（必读）

每次开始本项目任务、切换到本项目或恢复上下文时，先读取 [personal 个人规则](./docs/rules/personal.md)。该要求适用于项目内各工作目录，不依赖 Skill 是否触发；同一任务内已读取且未变化的内容可复用，更新后重新读取。

用户明确要求长期保留或调整的项目个人偏好统一维护在 personal 中。全局已生效的要求不在项目内重复登记。

## 按任务读取

| 当前工作 | 规则入口 |
| --- | --- |
| 实现、修复和代码审查 | [编码与审查规范](./docs/coding-standards.md)；common 的特殊行为见[包入口](./packages/common/AGENTS.md) |
| 功能落位、职责拆分、依赖或公共入口调整 | [架构与兼容契约](./docs/architecture.md) |
| 运行测试、构建和集成验收 | [开发与验证](./docs/development.md)，尤其是[验证范围](./docs/development.md#验证范围) |
| 环境、浏览器或编辑器异常 | [工具与环境排查](./docs/troubleshooting.md)，只读相关场景 |
| 版本与发布 | [发布流程](./docs/releasing.md) |
| 新增发布包 | [新增子包 Skill](./docs/skills/add-axutils-package/SKILL.md) |
| 全面审查、跨模块重构或规则重整 | [项目审查 Skill](./docs/skills/review-axutils-project/SKILL.md) |

## 规则分工与演进

- 本入口负责路由；personal 保存项目个人偏好；架构文档维护职责与兼容边界；编码规范维护实现契约；开发文档维护验证入口。包内 AGENTS 只补充本包功能地图和特殊行为，Skill 只描述任务流程。
- 同一要求只保留一份正文。命名、格式与排序偏好从 personal 查找，具体工具选项以配置为准；项目文档不要求安装维护者的个人 Skill。
- 结构按实际职责、依赖和生命周期演进，不设文件行数或目录深度硬阈值。已有内聚模块可以保留，公共契约不能因内部重构而意外改变。
- 架构或公共契约确需变化时，同步所属规范、受影响入口、测试和使用文档；有实际未决兼容选择时说明影响。完成后核对最终代码、规则归属、链接及 Skill 触发条件。
- 修改 Biome 支持的代码或配置后，执行[修改后检查](./docs/development.md#编辑器与修改后检查)。源码与测试同时调整时，遵循[原测试基线要求](./docs/development.md#验证范围)。
