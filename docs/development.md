# 开发与验证

## 环境

- 开发：Node.js `^22.11 || ^24 || >=26`，系统 PATH 中可用的 pnpm >=10；发布工具调用的 npm 需 >=10.9.0。以上要求与 Changesets 3 对齐，仓库不通过 packageManager 固定 pnpm 版本。
- 包消费：发布包默认 Node.js >=14.18.0、ES2020，提供 ESM/CJS 与双格式声明；UMD 按包需要提供。common 同时支持浏览器并提供 UMD；新包确需不同运行环境时，在包清单与局部契约中明确，并同步适配共享构建和 CI 消费矩阵，不能只修改清单。
- CI：Node 24，Linux 与 Windows 中文路径；现代工具链构建后，Node 14.18.0 验证同一份产物。
- 依赖恢复使用 `pnpm install --frozen-lockfile`，验证基于锁文件中的项目工具版本；根 lint 显式调用本地 Biome。

## 安装与命令

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm check
```

首次运行浏览器测试需可用浏览器。CI 在一次性 runner 中执行 `node node_modules/@playwright/test/cli.js install --with-deps chromium`。本地可复用已安装的 Edge/Chrome，无需下载；PowerShell 示例：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge" # 或 chrome
pnpm check
```

浏览器启动失败时，参见下文[浏览器测试找不到可执行文件](#浏览器测试找不到可执行文件)。

| 命令                         | 用途                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| pnpm lint / pnpm biome:check | 本地锁定 Biome 的格式、导入、对象键排序及质量检查，只读不改写                                       |
| pnpm format                  | 代码格式化                                                                                          |
| pnpm typecheck               | 各子包源码与单元测试类型检查                                                                        |
| pnpm test                    | 各子包单元测试                                                                                      |
| pnpm test:tooling            | 构建入口和声明转换测试                                                                              |
| pnpm build                   | 各子包构建一次                                                                                      |
| pnpm test:dist               | 已构建产物的 ESM/CJS/UMD 入口与行为契约                                                             |
| pnpm test:consumer           | 真实 tarball、最小 peer 组合及 NodeNext ESM/CJS 类型检查                                            |
| pnpm test:browser            | 浏览器消费类型检查与 Playwright 真实浏览器测试                                                      |
| pnpm publint                 | 发布清单及打包检查                                                                                  |
| pnpm check                   | lint → 工具测试 → typecheck → 单元测试 → build → test:dist → test:consumer → publint → test:browser |
| pnpm test:runtime            | 用 AXUTILS_TEST_NODE 指定的 Node 运行全部包的产物冒烟                                               |
| pnpm release                 | 发布尚未发布的本地包版本并创建 Git 标签；完整操作顺序见[发布流程](#发布流程)                        |

单独打开 common 时，可在包目录执行各包脚本；`pnpm check:dist` 组合构建与产物冒烟。共享安装和完整 `pnpm check` 在仓库根执行。

指定最低消费运行时不需要切换全局 Node，例如已有对应二进制时：

```powershell
$env:AXUTILS_TEST_NODE = "C:\path\to\node-v14.18.0\node.exe"
pnpm test:runtime
pnpm test:consumer
Remove-Item Env:AXUTILS_TEST_NODE
```

编译器仍使用当前开发 Node，只有消费者子进程使用指定版本。

## 验证层次与子包接入

| 层次               | 验证职责与边界                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 根工具测试         | 验证入口派生、声明转换、包发现与调度等共享工具链行为                                                                                                         |
| 源码类型与单元测试 | 检查源码类型及公共行为；共享 fixture 不封装客户端策略，异步测试使用明确完成信号或虚拟时钟                                                                    |
| 产物冒烟           | ESM/CJS 加载全部公开入口，复用本包行为契约并比对独立导出快照；UMD 另验证 require、浏览器全局和跨 Realm                                                       |
| 隔离消费           | 在工作区外消费真实 tarball，按无 peer 与最小 peer 组合检查运行时及 NodeNext、skipLibCheck:false 下的 ESM/CJS 声明；peer 使用已锁定安装树，不替代全新安装验证 |
| 发布清单           | publint 检查包元数据与入口；结合真实 tarball 核对发布文件，不能仅凭工作区文件存在判断已包含在包中                                                            |
| 真实浏览器         | 消费真实包名，检查通用产物无 Node 内置模块，并验证涉及的浏览器能力；common 覆盖存储、计时器、摘要和 HTTP                                                     |
| 最低运行时与 CI    | CI 平台与版本见[环境](#环境)；最低消费 Node 运行已构建的同一份产物，开发工具继续使用现代 Node                                                                |

每个可发布包提供 `build`、`typecheck`、`test`、`test:dist`、`test:consumer`、`publint`。根 `scripts/workspace.mjs` 发现直接位于 `packages/` 下的包，排除 `private:true`，检查必需脚本并通过 pnpm 按包依赖拓扑调度；新增包在根 TypeScript references 和 README 包列表登记。

提供浏览器能力的包还应实现 `test:browser`。当前调度器只对声明了该脚本的包运行浏览器阶段，不会自动判断包是否需要浏览器验证；审查和新增包接入时需确认这一点，不能把缺少浏览器脚本视为已经验证。

根 `test:runtime` 约定每个包提供 `scripts/smoke-esm.mjs` 和 `scripts/smoke-cjs.cjs`；声明 `unpkg` 时还需 `scripts/smoke-umd.cjs`。这些脚本加载全部公开入口，以 `scripts/smoke/` 中的行为契约和独立快照验证；`scripts/consumer/` 保存本包最小 peer 映射与类型用例。

`test:dist`、`test:consumer` 和 `test:browser` 消费已有 dist，根 `pnpm check` 构建后复用同一份产物。浏览器消费页面单独打包，不再次构建工具包；单独使用时可提供 `check:dist` 组合构建与冒烟。

## 验证范围

围绕本次需求、受影响行为和失败代价选择能支持结论的证据。下面是常见场景的选择依据，可随实际影响扩大或收窄；任务是否完成也取决于关键假设、兼容边界和失败路径是否得到验证。

- 纯文档或规则修改通常检查内容、链接和规则一致性；Skill 另验证元数据。文档包含命令或行为调整时，按实际变化补充核对。
- 局部代码修改选择相关类型与行为检查，低影响且可逆的修改可直接检查；回归测试针对真实需求、边界或失败路径，避免重复实现本身。格式、排序与 lint 见下节。
- 公共契约、共享工具链、依赖或跨模块重构通常以根 `pnpm check` 验证集成影响；影响已明确且定向检查能覆盖风险时，可采用相应检查并说明覆盖范围。涉及最低运行时兼容性时，用 `AXUTILS_TEST_NODE` 检查同一份已构建产物。
- 新增发布包按[子包接入要求](#验证层次与子包接入)完成完整集成检查和最低运行时消费验证；正式发布以最终待发布状态的完整检查作为依据。
- `pnpm check` 已包含上表各阶段。格式处理后可由其中的 lint 阶段完成检查，独立阶段已有结果且与当前状态匹配时可复用。诊断时可单独执行失败阶段；通过后根据新改动、失败或未解决的重要疑点追加检查。
- 源码和测试同时重构时，保留原测试和公共契约基线，用于区分实现回归与测试调整；通常先用原测试与原产物检查验证源码，再整理测试。需要交错修改时，可通过未改写的基线或隔离对照保留等价证据。新增缺陷诊断可独立运行，格式化同样保持基线可比。

## 编辑器与修改后检查

根目录和 common 的 `.vscode/settings.json` 分别支持两种打开方式：绑定根 Biome 配置，对 JavaScript、TypeScript、JSON/JSONC 启用保存时格式化和安全修复。Windows x64 明确使用 pnpm 安装树中的本地 Biome 原生程序，其他平台由扩展解析项目依赖。设置仅作用于工作区，不修改用户全局设置。

Zed 对应使用根目录和 common 的 `.zed/settings.json`，需已安装 Biome 扩展并恢复项目依赖，且 Zed 的 PATH 中可找到 Node。两种打开方式均用 Node 启动仓库本地 Biome CLI，通过 `config_path` 指向根 Biome 配置，避免扩展回退到全局版本。在 JavaScript、JSX、TypeScript、TSX、JSON/JSONC 中启用 Biome 和保存时格式化、修复与排序；JS/TS 的导入整理明确交给 `source.organizeImports.biome`。项目设置用 `inline_config: null` 清除用户级内联规则覆盖，使导入排序选项及 package.json 的专用排序继续由仓库配置决定。相关设置见 [Biome 的 Zed 文档](https://biomejs.dev/reference/zed/)。

修改 Biome 支持的代码或配置后，使用本地 `node node_modules/@biomejs/biome/bin/biome format --write <本次改动文件...>` 格式化，配合 `pnpm lint` 或根 `pnpm check` 的 lint 阶段核对并解决诊断。导入整理和对象排序可用本地 `biome check --write <本次改动文件...>` 的安全修复；`--unsafe` 中可能改变语义的建议逐项判断后采用。格式化范围随任务范围选择，`pnpm format` 适用于全仓格式化请求。

普通 JavaScript/TypeScript 与 JSON/JSONC 对象开启 useSortedKeys，手动保存时自动排序。package.json 使用 useSortedPackageJson 专用规则整理清单，保留 exports 的条件顺序（types 在 default 前）。对有求值或枚举顺序语义的对象，以及故意乱序的测试输入，可使用 `biome-ignore assist/source/useSortedKeys: 原因` 局部豁免，保留行为与测试预期。

包顶层 `playwright.config.ts` 归属 common/tsconfig.json，复用已有 Node 类型；test-browser/tsconfig.json 负责浏览器测试。编辑器项目归属问题可从现有 tsconfig 与类型配置排查；TypeScript 7 的 native 包与传统 JS tsserver 的 tsdk 接口不同，配置时按实际工具类型选择。

修改配置后，编辑器通常会自动更新；若仍显示旧诊断，执行 `Biome: Restart` 或 `Developer: Reload Window` 重新加载工作区。以本地 `pnpm lint` 和相应 tsconfig 的检查结果核对实际错误。

Zed 若仍保留旧排序诊断，可执行 `editor: restart language server` 后保存文件；从仓库根目录和包目录运行本地 Biome 应得到相同排序结果。若仍有差异，核对 Zed 实际使用的 Biome 版本与配置路径，以及是否存在额外的内联配置覆盖。

## 测试与临时文件

源码单元测试在 test 中，真实浏览器测试在 test-browser 中；两者使用不同配置。日期宿主时区测试启动独立 Vitest 进程，避免当前 worker 的 TZ 修改对宿主 Date 时区未生效。

打包消费和浏览器测试使用系统临时目录并在结束时清理；浏览器服务器仅监听 127.0.0.1 并提供固定测试资源。设置 AXUTILS_KEEP_BROWSER_ARTIFACTS=1 可保留失败诊断文件，路径会打印到终端，调试结束后由使用者删除。

遇到 Windows 中文路径下 pnpm exec 找不到已安装工具时，核对项目 node_modules 的真实文件与版本，可用其 Node CLI 入口诊断并保持工具版本一致。依赖 junction 失效时可按锁文件恢复 workspace 安装；工具或依赖问题在对应层处理，工具链变更按已有授权和实际影响判断并说明。

### 浏览器测试找不到可执行文件

如果 `pnpm check` 在 `test:browser` 阶段出现大量测试失败，可向上查找第一个失败测试的 `Error:`。末尾的 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`、`ELIFECYCLE` 和 `Exit status 1` 是退出汇总，根因判断依据具体错误与环境证据。

以下错误表示 Playwright 在启动浏览器时找不到所需可执行文件，测试尚未进入业务断言：

```text
Error: browserType.launch: Executable doesn't exist at ...\ms-playwright\chromium_headless_shell-1234\...
```

这里的 `1234` 只是一次故障中的版本编号，实际以报错路径为准。项目默认使用 Playwright 配套的 Chromium；安装项目依赖不代表已下载匹配的浏览器，缓存中的其他编号也可能与当前版本不匹配。此错误指向浏览器环境，可按现有安装与任务需要选择以下配置方式。

**方式一：复用已安装的 Edge/Chrome。** 在项目根目录、同一个 PowerShell 终端依次执行：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge" # 使用已安装的 Chrome 时改为 chrome
node -p "process.env.PLAYWRIGHT_CHANNEL" # 应输出 msedge 或 chrome
pnpm check
```

环境变量只影响当前终端及其子进程；新开终端需要重新设置，在其他终端或自动化工具中设置不会同步到当前终端。若报错仍指向 `chromium_headless_shell-*`，检查执行测试的终端是否正确设置了变量。

**方式二：安装项目 Playwright 所需的 Chromium。** 在项目根目录执行本地 CLI，将匹配的浏览器下载到本机缓存；无需全局安装 Playwright：

```powershell
node node_modules/@playwright/test/cli.js install chromium
Remove-Item Env:PLAYWRIGHT_CHANNEL -ErrorAction SilentlyContinue # 如曾指定系统浏览器，清除后验证默认配置
pnpm check
```

此后无需每次指定 Edge/Chrome；升级或切换项目 Playwright 版本后，若再次出现缺失浏览器的错误，可重新执行安装命令。已有最新构建产物时，可用 `pnpm test:browser` 单独复查浏览器阶段，再按[验证范围](#验证范围)判断是否需要集成检查。若配置后仍失败，结合新的第一条 `Error:` 判断原因，失败数量本身不足以识别问题。

## 依赖与发布

根 devDependencies 放共享工具链；第三方适配在所属子包声明所需可选 peer，并在该包 devDependencies 提供对应开发版本。项目 .npmrc 默认镜像源，@axutils scope 指向官方 npm；登录、身份检查和发布使用官方 registry。

新增发布包以 `@axutils/<name>` 命名，声明描述、仓库 `directory`、与仓库一致的许可、兼容范围、`type:module`、入口及 `files` 白名单。沿用无导入副作用的库设计并声明 `sideEffects:false`；确有导入副作用时明确用途并如实配置。版本与 changelog 由 Changesets 管理。

### 发布流程

改完代码后，在仓库根目录按顺序执行，每一步成功后再执行下一步：

````powershell
# 1. 填写修改说明，选择 patch / minor / major
pnpm changeset

# 2. 自动修改版本号，并更新 CHANGELOG.md
pnpm version-packages

# 3. 同步锁文件
pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile

# 4. 检查、测试并构建，执行完这个之后要提交代码，否则发布会报错
pnpm check

```shell
# 如果发布失败，看是否登录状态有问题
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
````

# 5. 发布到 npm

pnpm release --otp=1234

```

- `pnpm changeset` 按提示选择包、升级级别并填写更新摘要，生成 `.changeset/*.md`。兼容修复选 `patch`，新增兼容功能选 `minor`，破坏兼容选 `major`。
- `pnpm version-packages` 才会更新受影响包的 `package.json` 和 `CHANGELOG.md`，并删除已汇总的 changeset 文件；这一步仍是本地修改。
- 已有本次更新的 changeset 时，从第 2 步开始；已完成升版和验证、仅发布失败时，解决失败原因后重试 `pnpm release`。
- 升版前可用 `pnpm changeset status` 查看升版计划，升版后用 `pnpm changeset publish-plan` 查看实际待发布的包和版本。
- npm 未登录时先执行 `npm login --registry=https://registry.npmjs.org/`，发布时按提示完成认证。浏览器测试环境按[安装与命令](#安装与命令)配置。

发布时，本次代码和版本记录先提交，发布成功后再同步提交和标签。当前 `pnpm release` 脚本负责 npm 发布与创建标签，代码提交与远端同步由发布执行者完成。

## 相关资料

- [编码与审查规范](./coding-standards.md)
- [架构与兼容契约](./architecture.md)
- [新增子包](./skills/add-axutils-package/SKILL.md)
- [项目审查](./skills/review-axutils-project/SKILL.md)
```
