# 开发与验证

本页维护日常开发环境、验证职责及子包接入。目录与兼容边界见[架构规范](./architecture.md)，环境故障见[排查指南](./troubleshooting.md)，发版操作见[发布流程](./releasing.md)。

## 环境

- 开发 Node：`^22.12 || ^24 || >=26`，同时满足锁定的 Vite 与 Changesets 要求；pnpm `>=10`，仓库不通过 `packageManager` 固定其版本。发布工具调用的 npm 需 `>=10.9.0`。
- 包消费：默认 Node `>=14.18.0`、ES2020，提供 ESM/CJS 与双格式声明。common 另支持浏览器和 UMD；改变包运行环境时，同步构建目标、声明与 CI 消费矩阵。
- CI：Node 24 在 Linux、Windows 中文路径中构建验证，再用 Node 14.18.0 消费同一份产物；Linux 另验证 Node 22.12.0、26，详见 [CI 覆盖与排错](#ci-覆盖与排错)。
- 依赖按锁文件恢复，检查使用仓库本地工具；不靠全局 Biome 或 TypeScript 代替。
- 文本文件由根 [`.gitattributes`](../.gitattributes) 统一以 LF 检出，与 Biome 的换行配置保持一致，避免 Windows 的 `core.autocrlf` 将文件转换为 CRLF 后导致 CI 格式检查失败。

## 安装与命令

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm check
```

浏览器测试默认使用项目 Playwright 对应的 Chromium，也可复用已安装的 Edge/Chrome。例如 PowerShell 中：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge" # 已安装 Chrome 时可用 chrome
pnpm check
```

| 命令 | 职责 |
| --- | --- |
| `pnpm lint` / `pnpm biome:check` | 本地 Biome 格式、导入、对象键排序与质量检查，只读 |
| `pnpm format` | 全仓格式化；局部编辑按[修改后检查](#编辑器与修改后检查)限定文件 |
| `pnpm typecheck` | 各包源码和单元测试的类型检查 |
| `pnpm test` | 各包单元测试 |
| `pnpm test:tooling` | 共享构建、声明转换、包发现与调度测试 |
| `pnpm build` | 构建所有包 |
| `pnpm test:dist` | 已构建产物的公开入口、导出快照与行为契约 |
| `pnpm test:consumer` | 真实 tarball、最小 peer 组合及 NodeNext ESM/CJS 类型消费 |
| `pnpm publint` | 发布清单与打包检查 |
| `pnpm test:browser` | 浏览器消费类型检查与 Playwright 真实浏览器测试 |
| `pnpm test:runtime` | 使用 `AXUTILS_TEST_NODE` 指定的 Node 执行产物冒烟 |
| `pnpm check` | lint → 工具测试 → typecheck → 单元测试 → build → dist → consumer → publint → browser |
| `pnpm release` | 发布未发布的本地包版本并创建 Git 标签；见[发布流程](./releasing.md) |

包目录可以单独运行包脚本；common 的 `pnpm check:dist` 组合构建与产物检查。依赖安装、完整 workspace 检查仍在根目录执行。

## CI 覆盖与排错

[CI 工作流](../.github/workflows/ci.yml) 在推送到 `main`、PR 更新或 Actions 页面手动触发时运行。CI 固定使用 pnpm `12.10.1` 并按锁文件安装，本地仍遵循 `engines`，不新增 `packageManager` 限制。

| 环境 | 验证范围 |
| --- | --- |
| Linux、Windows / Node 24 | 完整 `pnpm check`；再以 Node 14.18.0 执行同一份产物的 `test:runtime`、`test:consumer` |
| Linux / Node 22.12.0、26 | 完整 `pnpm check`，覆盖开发版本下限及当前新版 |

所有任务都在中文路径下运行，浏览器使用 Playwright Chromium，验证 ESM 打包消费与 UMD 全局消费。每个任务只构建工具包一次；最低运行时验证继续使用已有产物，类型编译器仍由开发 Node 执行。

同一分支或 PR 的新运行会取消未完成的旧运行，单个任务超时为 20 分钟。浏览器失败时，在该次运行的 Artifacts 下载 `browser-failure-<os>-node-<version>`，其中包含测试截图和 Playwright trace，保留 7 天；浏览器启动前的阶段失败时可能没有附件，应查看首条日志错误。

当前 CI 不运行 npm 发布，也未覆盖 macOS、Firefox/WebKit 或测试覆盖率阈值。隔离消费验证使用锁定安装树中的最小 peer **集合**，不代表已验证各 peer 版本范围的最低版本或所有组合。

## 验证层次与子包接入

| 层次 | 能证明什么 |
| --- | --- |
| 工具链测试 | 入口派生、声明词法转换、包发现、缺失脚本与拓扑调度 |
| 源码类型与单元测试 | 公开函数行为、类型边界和可控失败路径；mock 不代表真实宿主兼容 |
| 产物冒烟 | ESM/CJS 加载全部公开入口并复用行为断言；独立导出快照防止意外增删；UMD 另检查 require、浏览器全局和跨 Realm |
| 隔离打包消费 | 在工作区外消费 tarball，按最小 peer 检查运行时和 `NodeNext / skipLibCheck:false` 双格式声明 |
| 发布清单 | publint 和实际 tarball 文件检查；工作区存在的文件不代表已发布 |
| 真实浏览器 | 通过真实包名打包，拒绝 Node 内置模块，检查存储、计时器、摘要和 HTTP |
| 最低运行时 | 用最低消费 Node 执行已经构建的产物，不能把开发 Node 的成功当作最低版本通过 |

隔离消费从已锁定安装树挂载各入口需要的 peer，不访问网络，也不等同于全新安装验证。

根 `scripts/workspace.mjs` 发现 `packages/` 的直接子包，排除 `private:true`，检查必需脚本后交给 pnpm 按依赖拓扑运行。每个发布包必须提供 `build`、`typecheck`、`test`、`test:dist`、`test:consumer`、`publint`，并登记根 TypeScript references 和 README 包列表。

有浏览器能力的包还要提供 `test:browser`。调度器只执行已声明的浏览器脚本，不会判断漏配；接入审查必须确认这一点。

根最低运行时检查约定包内提供 `scripts/smoke-esm.mjs`、`smoke-cjs.cjs`，声明 `unpkg` 时另有 `smoke-umd.cjs`。`scripts/smoke/` 维护包行为和导出快照，`scripts/consumer/` 维护最小 peer 映射和类型用例。

`test:dist`、`test:consumer`、`test:browser` 复用已有 dist；根 `pnpm check` 只构建一次。浏览器测试另外打包消费页面，不重建工具包。

## 验证范围

- **文档与规则**：核对事实、相对链接、锚点和规则归属；Skill 另检查元数据与触发条件。命令或契约有变化时验证其真实行为。
- **局部实现**：类型检查与受影响的行为、边界和失败路径测试；格式检查遵循下节。测试针对可观察结果，不复刻私有实现。
- **跨模块、公共契约、共享工具链或依赖变化**：通常运行根 `pnpm check`，确认源码、声明、产物和真实消费一致。采用定向检查时说明证据覆盖和未验证项。
- **源码和测试同时重构**：先在未修改状态建立原测试与产物基线。源码调整后先用原测试验证，再新增缺陷回归或整理测试；不能通过改掉原断言隐藏实现回归。原测试本身有问题时记录独立证据和原契约，再修正测试。
- **最低运行时相关变化或新增发布包**：对同一份产物执行最低版本的 runtime 和 consumer 检查。正式发布以最终待发布状态的完整验证为依据。
- 已有结果与当前状态匹配时复用；新改动、失败或具体证据缺口才追加检查。静态通过和局部通过不代表全部架构与行为已经审查。

已有最低版本二进制时，可在不切换全局 Node 的情况下验证：

```powershell
$env:AXUTILS_TEST_NODE = "C:\path\to\node-v14.18.0\node.exe"
pnpm test:runtime
pnpm test:consumer
Remove-Item Env:AXUTILS_TEST_NODE
```

编译器继续使用开发 Node，消费者子进程使用指定版本。

## 编辑器与修改后检查

修改 Biome 支持的代码或配置后，使用仓库本地 CLI 限定本次改动文件：

```bash
node node_modules/@biomejs/biome/bin/biome format --write <本次改动文件...>
```

导入整理与排序可使用同一 CLI 的 `check --write` 安全修复，随后运行 `pnpm lint` 或根 `pnpm check`。修复后的代码仍须满足 ES2020、最低 Node 和现有契约，不能为了工具建议放宽兼容目标。

命名与格式偏好见 [personal](./rules/personal.md)，具体规则由 Biome 配置维护。有顺序语义的对象和故意乱序的测试输入使用有原因的局部豁免；package.json 使用专用排序，保留条件导出顺序。

现有 VS Code/Zed 配置是可选的工作区集成，使用方式与故障处理见[编辑器排查](./troubleshooting.md#编辑器与命令行诊断不一致)，不构成个人使用要求。

## 测试与临时文件

源码单元测试位于 `test/`，真实浏览器测试位于 `test-browser/`，后者使用独立 DOM 类型配置。日期宿主时区测试使用独立进程，避免修改 worker 的 TZ 后宿主 Date 行为未更新。

打包消费和浏览器测试使用系统临时目录并在结束时清理；浏览器服务器仅监听 `127.0.0.1` 且只提供固定资源。`AXUTILS_KEEP_BROWSER_ARTIFACTS=1` 可保留浏览器诊断文件，脚本打印路径，调试结束后由使用者清理。

### 浏览器测试找不到可执行文件

区分浏览器启动失败与业务断言失败，具体处理见[浏览器环境](./troubleshooting.md#浏览器测试找不到可执行文件)。

## 依赖与发布

共享工具链放根 devDependencies，第三方适配在所属包声明可选 peer，并提供对应开发依赖。源码不能依赖未声明的传递依赖。

新包使用 `@axutils/<name>`，声明描述、仓库 directory、许可、运行范围、`type:module`、入口和 files 白名单。无导入副作用时声明 `sideEffects:false`，有副作用时如实配置。版本及 changelog 由 Changesets 管理。

项目 .npmrc 的默认镜像供依赖安装使用，`@axutils` scope 指向官方 npm；登录、身份检查和发布使用官方 registry。

### 发布流程

版本说明、升版、锁文件同步、最终验证、提交和发布的操作顺序统一见[发布流程](./releasing.md)。
