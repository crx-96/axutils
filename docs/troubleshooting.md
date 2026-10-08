# 工具与环境排查

本页只用于遇到具体环境问题时；日常验证入口见[开发文档](./development.md)。先看首次实际错误，末尾的 `ELIFECYCLE`、`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` 仅是退出汇总。

## 浏览器测试找不到可执行文件

出现 `browserType.launch: Executable doesn't exist` 时，浏览器尚未启动，业务断言还没有运行。安装依赖不等于下载了与当前 Playwright 匹配的 Chromium，旧缓存也可能不匹配。

本地可以复用已安装的 Edge/Chrome。在启动测试的同一 PowerShell 中执行：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge" # 或 chrome
node -p "process.env.PLAYWRIGHT_CHANNEL"
pnpm test:browser
```

环境变量仅影响该终端及其子进程；新终端或另一自动化进程不会继承这次设置。单独执行浏览器测试需要已有最新 dist，否则先构建。

需要使用 Playwright Chromium 时，通过项目 CLI 安装匹配版本：

```powershell
node node_modules/@playwright/test/cli.js install chromium
Remove-Item Env:PLAYWRIGHT_CHANNEL -ErrorAction SilentlyContinue
pnpm test:browser
```

CI 在一次性 runner 中使用 `install --with-deps chromium`。本地安装按实际授权和环境需要选择，不要求全局安装 Playwright，也不靠更换测试断言解决启动问题。

## 中文路径、工具发现与临时目录权限

Windows 中文路径中，若 `pnpm exec` 找不到工具，先核对本地安装树和实际版本，再通过对应 Node CLI 入口诊断。根 lint 已显式调用本地 Biome；依赖 junction 失效时按锁文件恢复 workspace 安装。

`EPERM`、`EACCES`、临时缓存 rename 失败或子进程无法启动，要结合目标路径、进程、沙箱和权限证据判断。若测试尚未加载，不能把全部 suite 失败记成业务断言失败；在授权环境中复核同一测试，不用修改断言、关闭校验或重装全局工具来掩盖环境限制。

## 编辑器与命令行诊断不一致

仓库保留根目录与 common 包的 VS Code/Zed 工作区配置，便于两种打开方式使用相同本地工具。配置只作用于工作区，不要求使用特定编辑器。

- 先用本地 `pnpm lint` 和文件所属 tsconfig 核对真实诊断，确认依赖已按锁文件恢复。
- Biome 的配置与版本由仓库解析。Windows x64 的 VS Code 设置使用 pnpm 安装树中的本地原生程序，其他平台由扩展解析；Zed 通过 Node 启动本地 CLI，并用 `config_path` 指向根配置。
- Zed 的项目配置清除额外内联 Biome 规则覆盖，导入整理交给 `source.organizeImports.biome`。残留诊断可用 `editor: restart language server` 后重新保存；VS Code 可用 `Biome: Restart` 或 `Developer: Reload Window`。
- 当前 Zed 的 TypeScript 配置通过 `tsgo` 扩展对应的 `typescript-ls` 启动本地 `typescript/bin/tsc --lsp --stdio`。TypeScript 7 的 native 包与传统 tsserver/tsdk 接口不同，不让旧服务回退到另一份 TypeScript。
- 包顶层 Vitest/Playwright 配置属于包 tsconfig；浏览器测试属于 `test-browser/tsconfig.json`。遇到文件不属于项目或 DOM/Node 类型混用，先检查归属。

更新配置后仍显示旧结果时，核对编辑器实际执行的程序路径、版本、根配置和用户级覆盖，按具体差异处理。
