# 开发与验证

## 环境

- 开发：Node.js >=20.19.0，系统 PATH 中可用的 pnpm；仓库不通过 packageManager 固定 pnpm 版本。
- 包消费：当前 common 支持 Node.js >=14.18.0 和浏览器，输出 ES2020 的 ESM/CJS/UMD。
- CI：Node 24，Linux 与 Windows 中文路径；现代工具链构建后，Node 14.18.0 验证同一份产物。
- 依赖恢复使用 `pnpm install --frozen-lockfile`。不要用全局工具的版本代替锁文件中项目工具的版本；根 lint 显式调用本地 Biome。

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

## 编辑器与修改后检查

根目录和 common 的 `.vscode/settings.json` 分别支持两种打开方式：绑定根 Biome 配置，对 JavaScript、TypeScript、JSON/JSONC 启用保存时格式化和安全修复。Windows x64 明确使用 pnpm 安装树中的本地 Biome 原生程序，其他平台由扩展解析项目依赖。设置仅作用于工作区，不修改用户全局设置。

每次修改后必须先格式化、再检查。全仓执行 `pnpm format`，随后执行 `pnpm lint`；小范围可运行 `node node_modules/@biomejs/biome/bin/biome format --write <文件...>`，再执行 `pnpm lint`。导入整理和对象排序使用 `node node_modules/@biomejs/biome/bin/biome check --write <文件...>` 的安全修复；不要批量使用 `--unsafe`。

普通 JavaScript/TypeScript 与 JSON/JSONC 对象开启 useSortedKeys，手动保存时自动排序。package.json 使用 useSortedPackageJson 专用规则整理清单，保留 exports 的条件顺序（types 在 default 前）。对有求值或枚举顺序语义的对象，以及故意乱序的测试输入，使用 `biome-ignore assist/source/useSortedKeys: 原因` 局部豁免；不通过修改测试预期来迁就排序。

包顶层 `playwright.config.ts` 归属 common/tsconfig.json，使用已有 Node 类型；test-browser/tsconfig.json 只负责浏览器测试。不要为修复编辑器项目归属而重复安装 @types/node，或把 TypeScript 7 的 native 包配置成传统 JS tsserver 的 tsdk。

修改配置后，编辑器通常会自动更新；若仍显示旧诊断，执行 `Biome: Restart` 或 `Developer: Reload Window` 重新加载工作区。以本地 `pnpm lint` 和相应 tsconfig 的检查结果核对实际错误。

## 测试与临时文件

源码单元测试在 test 中，真实浏览器测试在 test-browser 中；两者使用不同配置。日期宿主时区测试启动独立 Vitest 进程，避免当前 worker 的 TZ 修改不能影响宿主 Date。

打包消费和浏览器测试使用系统临时目录并在结束时清理；浏览器服务器仅监听 127.0.0.1 并提供固定测试资源。设置 AXUTILS_KEEP_BROWSER_ARTIFACTS=1 可保留失败诊断文件，路径会打印到终端，调试结束后由使用者删除。

遇到 Windows 中文路径下 pnpm exec 找不到已安装工具时，先确认项目 node_modules 的真实文件与版本。可用其 Node CLI 入口诊断，不要静默改用全局版本或更换包管理器。依赖 junction 失效时按锁文件重新安装整个 workspace，不手工改源码绕过缺失依赖。

### 浏览器测试找不到可执行文件

如果 `pnpm check` 在 `test:browser` 阶段出现大量测试失败，先向上查找第一个失败测试的 `Error:`。末尾的 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`、`ELIFECYCLE` 和 `Exit status 1` 只是退出汇总，不能据此判断根因。

以下错误表示 Playwright 在启动浏览器时找不到所需可执行文件，测试尚未进入业务断言：

```text
Error: browserType.launch: Executable doesn't exist at ...\ms-playwright\chromium_headless_shell-1234\...
```

这里的 `1234` 只是一次故障中的版本编号，实际以报错路径为准。项目默认使用 Playwright 配套的 Chromium；安装项目依赖不代表已下载匹配的浏览器，本机缓存中即使有其他编号的 Chromium，也不能满足当前版本的要求。仅此错误无需修改业务代码或测试断言，按以下任一方式配置浏览器即可。

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

此后无需每次指定 Edge/Chrome；升级或切换项目 Playwright 版本后，若再次出现缺失浏览器的错误，重新执行安装命令。已有最新构建产物时，可先用 `pnpm test:browser` 单独复查浏览器阶段；完整验收仍使用 `pnpm check`。若配置后仍失败，应继续查看新的第一条 `Error:`，不要仅凭失败数量认定仍是同一问题。

## 依赖与发布

根 devDependencies 放共享工具链；功能 peer 与对应开发版本放所属子包。项目 .npmrc 默认镜像源，@axutils scope 指向官方 npm；登录、身份检查和发布使用官方 registry。

Changesets 管理版本，不手工改版本号或逐包 npm publish。标准流程：

```bash
pnpm check
pnpm changeset
pnpm changeset status
pnpm version-packages
pnpm check
pnpm release --otp=123456
```

发布前另行核对目标包、changeset、npm 身份与权限；version-packages 写回版本与 changelog 后重新检查。release 会发布所有高于 registry 版本的包，不能用它隐式选择单包。本次重构不执行发布。

## 相关资料

- [架构与兼容契约](./architecture.md)
- [新增子包](./skills/add-axutils-package/SKILL.md)
- [项目审查](./skills/review-axutils-project/SKILL.md)
