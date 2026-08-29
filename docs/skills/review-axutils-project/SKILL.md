---
name: review-axutils-project
description: 审查 axutils 仓库中的子包、配置和文档是否符合项目约定时使用
---

# review-axutils-project

## 审查范围

适用于检查 `axutils` 仓库内的包结构、导出边界、构建配置、测试、文档和代码风格一致性。

## 审查清单

1. 包结构与清单
   - 可发布包是否位于 `packages/*`，使用 `@axutils/*` 包名，并至少包含独立的 `package.json`、`README.md`、`tsconfig.json`、源码目录和测试目录。
   - 新增子包的 `package.json` 是否完整声明 `name`、`version`、`type: "module"`、`description`、`sideEffects: false`、`main`、`module`、`types`、`exports`、`files`、`repository`（含 `directory`）、`bugs`、`homepage`、消费方 `engines`、`publishConfig.access`，以及 `build`、`test`、`test:dist`、`typecheck`、`publint` 脚本；若产出 UMD，是否声明 `unpkg`、`jsdelivr`。首次发布前的 `version` 是否仍由 Changesets 管理且未手动修改。
   - 新增子包是否已加入根 `tsconfig.json#references`；子包是否正确继承根 TypeScript/Biome 配置，并可单独打开使用继承配置。
   - `packages/common` 的源码与测试是否按功能分组镜像。
2. 公共 API 与导出边界
   - `package.json#exports` 是否与主入口、聚合入口和各子路径入口的实际导出一致；是否仅暴露公共路径，禁止调用未声明的深层内部路径。
   - 是否使用清晰稳定的命名导出；根入口是否仅做无副作用转发，包是否避免包级副作用并保持 tree-shaking 友好。
   - 无第三方运行时依赖且兼容浏览器与 Node.js 的公共工具，是否同时从主入口和子路径命名导出；仅子路径导出是否确因可选依赖、Node 专属能力或明显增加主入口负担。
3. 兼容性与按需依赖
   - 新增或修改代码是否尽量保持 ES2020 兼容、避免 ES2021+ 能力；面向用户的 Node.js 包最低版本是否保持 `>=14.18.0`，更高要求是否已明确说明。
   - 第三方功能是否使用 `peerDependencies` + `peerDependenciesMeta.optional: true`，且未放入 `dependencies` 强制安装。
   - 可选 peer 的开发/测试依赖是否位于声明该 peer 的子包 `devDependencies`；根 `devDependencies` 是否只含全 workspace 共享工具链。
   - 可选 peer API 是否未从包主入口导出；源码静态导入、公开 API 与 `peerDependencies` 是否双向可追溯。
4. 测试与发布产物
   - 是否有最小单元测试、构建后导入验证和 `test:dist`，且 `publint` 可通过；新增子包是否按新增子包 Skill 验证 ESM/CJS/UMD 冒烟测试。
   - `packages/common` 是否通过 `scripts/build.mjs` 先删除再重建 `dist`，没有绕过该脚本手写构建流程。
   - `packages/common` 是否保留 `smoke-esm.mjs`、`smoke-cjs.cjs`、`smoke-umd.cjs`，且 `test:dist` 串联三者；除非同步替换 `test:dist`、根 `check` 和 CI，否则不得删除任一脚本。
   - `packages/common` 是否产出 ESM（`.js`）、CJS（`.cjs`）、UMD（`index.umd.cjs`）；UMD 是否内置第三方依赖供浏览器 `<script>` 使用，ESM/CJS 是否将第三方依赖 external 化。
5. 文档与源码注释
   - 根 README 是否反映当前包列表和开发命令；“已有子包”是否与 `packages/*` 双向一致，且每个包均链接其 README。
   - 子包 README 是否只含包定位、基础安装、运行时兼容性、简要能力和详细文档跳转，没有方法明细或开发者流程；每个子包是否有 `docs/examples/<包名>/`，链接是否为有效的 Git 仓库文件绝对 URL，而非不会发布的相对路径。
   - 详细文档是否镜像源码功能目录及嵌套层级，并覆盖全部公共函数、类、对象/实例方法、常量和类型；每个运行时方法是否逐一说明用途、导入方式、关键参数与返回值、边界或限制并提供至少一个示例，常量和类型是否说明用途。
   - 是否以 `package.json#exports` 和真实入口为准列出该 API 全部合法且适用的根入口、精确子路径、Node 聚合入口、ESM、CJS、`import type` 和 UMD 全局名称；未导出的入口是否明确说明，是否避免把 UMD 聚合导出误写为 ESM/CJS 根入口导出，或把内部实现写成公共 API。
   - 可选 peer 文档是否分别说明根入口不可用原因、所需依赖、安装命令、受影响 API、替代子路径和 UMD 是否内置依赖；Node 专属限制是否单独说明。每份详细文档是否提供“公开导出/API → peer”映射，并将无依赖项标为“无”。
   - 使用第三方 peer 的方法，是否在详细文档和源码注释中同时写明依赖包、安装命令和受影响方法；子包 README 是否只提示依赖并链接详细文档。
   - 公开方法和关键实现是否有中文注释；类型守卫、正则、复杂条件和边界处理是否说明判断依据与刻意排除项；轻量校验是否明确其非完整规范实现边界。
   - 是否交叉核对 `exports`、真实入口、详细文档覆盖和 README 链接，而非只检查文件存在。
6. 仓库配置、包管理器与 CI
   - 根脚本是否仍可统一驱动 lint、typecheck、test、build；根 `check` 与 CI 是否按 lint、typecheck、test、build、`@axutils/common test:dist`、`@axutils/common publint` 对齐。
   - 本地是否直接使用系统 `PATH` 中的 pnpm，且根 `package.json` 未声明 `packageManager`；CI 是否通过 `pnpm/action-setup` 使用执行时可用的最新版。缺少 pnpm 时是否先报告阻塞，未静默改用其他包管理器。
   - `.npmrc` 默认 registry 是否为镜像源，`@axutils` scope 是否明确指向官方 npm `https://registry.npmjs.org/`。
   - CI 是否使用 `pnpm install --frozen-lockfile` 保证锁文件一致。

## 输出要求

审查结论按以下顺序报告：

1. 会导致发布或使用错误的问题。
2. 会破坏导出边界或兼容性的风险。
3. 缺失的测试或文档。
4. 与仓库既有约定不一致的点。

为便于复核，建议每项给出文件与位置、证据、影响、违反的具体规则和最小修正方向；没有问题时说明未发现，并列出已执行及未执行的验证。
