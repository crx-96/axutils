# 开发与验证

## 环境

- 开发：Node.js `^22.11 || ^24 || >=26`，系统 PATH 中可用的 pnpm >=10；发布工具调用的 npm 需 >=10.9.0。以上要求与 Changesets 3 对齐，仓库不通过 packageManager 固定 pnpm 版本。
- 包消费：当前 common 支持 Node.js >=14.18.0 和浏览器，输出 ES2020 的 ESM/CJS/UMD。
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

| 命令 | 用途 |
| --- | --- |
| pnpm lint / pnpm biome:check | 本地锁定 Biome 的格式、导入、对象键排序及质量检查，只读不改写 |
| pnpm format | 代码格式化 |
| pnpm typecheck | 各子包源码与单元测试类型检查 |
| pnpm test | 各子包单元测试 |
| pnpm test:tooling | 构建入口和声明转换测试 |
| pnpm build | 各子包构建一次 |
| pnpm test:dist | 已构建产物的 ESM/CJS/UMD 入口与行为契约 |
| pnpm test:consumer | 真实 tarball、最小 peer 组合及 NodeNext ESM/CJS 类型检查 |
| pnpm test:browser | 浏览器消费类型检查与 Playwright 真实浏览器测试 |
| pnpm publint | 发布清单及打包检查 |
| pnpm check | lint → 工具测试 → typecheck → 单元测试 → build → test:dist → test:consumer → publint → test:browser |
| pnpm test:runtime | 用 AXUTILS_TEST_NODE 指定的 Node 运行全部包的产物冒烟 |

单独打开 common 时，可在包目录执行各包脚本；`pnpm check:dist` 组合构建与产物冒烟。共享安装和完整 `pnpm check` 在仓库根执行。

指定最低消费运行时不需要切换全局 Node，例如已有对应二进制时：

```powershell
$env:AXUTILS_TEST_NODE = "C:\path\to\node-v14.18.0\node.exe"
pnpm test:runtime
pnpm test:consumer
Remove-Item Env:AXUTILS_TEST_NODE
```

编译器仍使用当前开发 Node，只有消费者子进程使用指定版本。

## 验证范围

围绕本次需求、受影响行为和失败代价选择能支持结论的证据。下面是常见场景的选择依据，可随实际影响扩大或收窄；任务是否完成也取决于关键假设、兼容边界和失败路径是否得到验证。

- 纯文档或规则修改通常检查内容、链接和规则一致性；Skill 另验证元数据。文档包含命令或行为调整时，按实际变化补充核对。
- 局部代码修改选择相关类型与行为检查，低影响且可逆的修改可直接检查；回归测试针对真实需求、边界或失败路径，避免重复实现本身。格式、排序与 lint 见下节。
- 公共契约、共享工具链、依赖或跨模块重构通常以根 `pnpm check` 验证集成影响；影响已明确且定向检查能覆盖风险时，可采用相应检查并说明覆盖范围。涉及最低运行时兼容性时，用 `AXUTILS_TEST_NODE` 检查同一份已构建产物。
- 新增发布包接入根检查调度及所需脚本，以完整集成检查和最低运行时消费验证确认新包可发布；正式发布以最终待发布状态的完整检查作为依据。各验证层的职责见[架构文档](./architecture.md#验证层次)。
- `pnpm check` 已包含上表各阶段。格式处理后可由其中的 lint 阶段完成检查，独立阶段已有结果且与当前状态匹配时可复用。诊断时可单独执行失败阶段；通过后根据新改动、失败或未解决的重要疑点追加检查。
- 源码和测试同时重构时，保留原测试和公共契约基线，用于区分实现回归与测试调整；通常先用原测试与原产物检查验证源码，再整理测试。需要交错修改时，可通过未改写的基线或隔离对照保留等价证据。新增缺陷诊断可独立运行，格式化同样保持基线可比。

## 编辑器与修改后检查

根目录和 common 的 `.vscode/settings.json` 分别支持两种打开方式：绑定根 Biome 配置，对 JavaScript、TypeScript、JSON/JSONC 启用保存时格式化和安全修复。Windows x64 明确使用 pnpm 安装树中的本地 Biome 原生程序，其他平台由扩展解析项目依赖。设置仅作用于工作区，不修改用户全局设置。

修改 Biome 支持的代码或配置后，使用本地 `node node_modules/@biomejs/biome/bin/biome format --write <本次改动文件...>` 格式化，配合 `pnpm lint` 或根 `pnpm check` 的 lint 阶段核对并解决诊断。导入整理和对象排序可用本地 `biome check --write <本次改动文件...>` 的安全修复；`--unsafe` 中可能改变语义的建议逐项判断后采用。格式化范围随任务范围选择，`pnpm format` 适用于全仓格式化请求。

普通 JavaScript/TypeScript 与 JSON/JSONC 对象开启 useSortedKeys，手动保存时自动排序。package.json 使用 useSortedPackageJson 专用规则整理清单，保留 exports 的条件顺序（types 在 default 前）。对有求值或枚举顺序语义的对象，以及故意乱序的测试输入，可使用 `biome-ignore assist/source/useSortedKeys: 原因` 局部豁免，保留行为与测试预期。

包顶层 `playwright.config.ts` 归属 common/tsconfig.json，复用已有 Node 类型；test-browser/tsconfig.json 负责浏览器测试。编辑器项目归属问题可从现有 tsconfig 与类型配置排查；TypeScript 7 的 native 包与传统 JS tsserver 的 tsdk 接口不同，配置时按实际工具类型选择。

修改配置后，编辑器通常会自动更新；若仍显示旧诊断，执行 `Biome: Restart` 或 `Developer: Reload Window` 重新加载工作区。以本地 `pnpm lint` 和相应 tsconfig 的检查结果核对实际错误。

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

Changesets 统一管理版本与发布。常见流程如下，可按当前 changeset 和版本状态从适用阶段继续：

```bash
pnpm check
pnpm changeset
pnpm changeset status
pnpm version-packages
pnpm check
pnpm release
```

本地在交互终端发布，按 npm/pnpm 提示完成安全密钥或浏览器验证；确有当前有效的一次性验证码时，可通过 `pnpm release --otp=<验证码>` 传入。登录验证不等于完成当前发布验证。

Changesets 已升级到 3.0.2，其发布代码会识别 pnpm 的 `ERR_PNPM_OTP_NON_INTERACTIVE` 并转入交互验证。遇到该错误时核对本地依赖是否按锁文件安装，以及发布命令的管道和交互状态。Changesets 3 在没有待处理 changeset 时执行 `version-packages` 会返回非零状态；版本已更新、仅需重试发布时，从发布阶段继续。

发布范围以用户授权为依据，已有明确授权时可继续执行；核对目标包、changeset、npm 身份与权限后发布。version-packages 写回版本与 changelog 后，检查结果对应更新后的待发布状态。release 会发布所有高于 registry 版本的包；单包发布场景可先核对所有待发布包，范围不符时继续独立准备工作，并就新增发布范围询问用户。

## 相关资料

- [编码与审查规范](./coding-standards.md)
- [架构与兼容契约](./architecture.md)
- [新增子包](./skills/add-axutils-package/SKILL.md)
- [项目审查](./skills/review-axutils-project/SKILL.md)
