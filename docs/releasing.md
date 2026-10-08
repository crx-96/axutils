# 发布流程

本页适用于已经明确要发布的任务。普通实现、重构或新增包不自动执行升版、提交、推送或 registry 发布。包入口与文件白名单见[架构规范](./architecture.md#构建与声明)，验证要求见[开发文档](./development.md#验证范围)。

## 准备版本

在仓库根目录按当前完成位置继续，每一步成功后再执行下一步：

```powershell
# 记录改动，选择受影响的包及 patch / minor / major
pnpm changeset

# 核对计划，再更新版本和 CHANGELOG
pnpm changeset status
pnpm version-packages

# 版本变化后同步锁文件
pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile

# 验证最终待发布状态；浏览器环境按开发文档准备
pnpm check
```

兼容修复选择 patch，新增兼容功能选择 minor，破坏兼容选择 major。已有本次 changeset 时复用；`version-packages` 会汇总并删除已消费的 changeset，不能因发布重试重复升版。

`pnpm changeset publish-plan` 可检查升版后的实际待发布包和版本。核对 tarball 内容、依赖和公共入口后，在已授权范围内提交本次代码及版本记录；发布前保持提交内容与验证内容一致。

## 认证与发布

认证使用官方 npm registry。只有登录或身份确实有问题时执行相应操作：

```powershell
npm whoami --registry=https://registry.npmjs.org/
npm login --registry=https://registry.npmjs.org/
```

准备完成后运行：

```powershell
pnpm release
```

如 npm 要求一次性验证码，按认证提示完成；需要命令参数时可使用 `pnpm release --otp=<当前验证码>`，不要把真实验证码写入文档。

当前 release 脚本负责发布尚未发布的本地版本并创建 Git 标签，代码提交和远端同步由发布执行者在授权范围内完成。发布成功后核对 registry 上的包版本和本地标签，再同步对应提交及标签。

## 失败后继续

先根据具体错误确认失败发生在验证、认证还是发布阶段。已经升版并验证、仅发布失败时，解决原因后从发布步骤继续；不要重新生成同一版本说明或盲目再次升版。部分包已经发布时，先核对实际状态，再处理剩余包。
