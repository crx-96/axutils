# 架构与兼容契约

## Workspace 与公共入口

`packages/*` 是发布单元。根目录集中维护 pnpm workspace、TypeScript、Biome、Changesets、构建工具与 CI；当前发布包是 `@axutils/common`。新增子包复用共享工具，保持独立的清单、源码、测试和包说明。

`package.json#exports` 是公共入口的唯一清单。当前 common 保留 18 个入口及显式 Node 子路径；源码文件可以成为薄转导出门面，内部目录不自动成为包的深层入口。源码相对引用使用 .js，方便生成 NodeNext 能识别的声明。

## 职责与依赖方向

| 模块 | 组织方式 | 不能丢失的差异 |
| --- | --- | --- |
| Axios / RxJS HTTP | 各自的类型、配置、错误、取消、身份和客户端模块；内部 HTTP 层共享纯机制 | Promise 调用即执行，RxJS 订阅才执行；校验、重试分类和错误字段分别保留 |
| 编码 / MD5 | 内部共享字节校验和编解码；两端摘要实现分开 | 通用摘要依赖 spark-md5，Node 摘要依赖 node:crypto |
| 存储 | 通用后端、JSON 记录与过期处理分开 | 通用返回 JSON 副本，Node 保存原引用；local/session 各有降级空间 |
| 日期 | 日历字段、解析、时区、时长与校验分开 | 日期字段以 UTC 对齐；目标时区重复/缺失时间及历史年份保留 date-fns-tz 的限制 |
| 深拷贝 | 保留支持范围，优化确定的数组与缓存路径 | 不等同于 structuredClone；键集合先冻结，再读取 getter；保留内部槽判断 |

根入口不加载 peer 或 Node 内置模块。只有各功能子路径加载其所需 peer，Node 实现可以复用无宿主依赖的内部纯逻辑。`scripts/consumer/peers.json` 为每个公共入口声明最小 peer 集合，消费验证在工作区之外隔离执行。

## 构建与声明

包级构建入口调用根 `scripts/build/package.mjs`，仅提供包目录和可选 UMD 配置。共享脚本从 exports 的 ESM 产物目标定位源码，例如 ./date 指向 dist/date/index.js，再对应 src/date/index.ts。

每次构建清空本包 dist，依次生成 ESM、CJS、UMD（如声明）和类型。仅 external 已声明依赖与 Node 内置模块，编译器辅助代码随产物打包。UMD 将通用第三方依赖内置，格式目标统一为 ES2020。

ESM 声明沿 .js 引用解析 .d.ts；CJS 声明沿 .cjs 引用解析 .d.cts。声明生成只改写模块说明符，保留裸 peer、注释和普通字符串类型。发布包必须在 NodeNext、skipLibCheck:false 下通过 ESM/CJS 真实消费检查。

## 验证层次

1. 工具测试验证入口派生和声明转换。
2. 单元测试验证公共行为；共享 fixture 不封装客户端业务策略，异步测试使用明确完成信号或虚拟时钟。
3. ESM/CJS 加载器运行同一行为契约，并与独立导出快照逐项比较。UMD 同时验证 require、浏览器全局和跨 Realm。
4. 从真实 tarball 建立隔离消费者，按无依赖及各最小 peer 组合验证运行时和类型。peer 使用已锁定安装树；本检查不代替全新安装验证。
5. 浏览器测试消费真实包名，检查打包无 Node 内置模块，并实际验证存储、计时器、摘要和 HTTP。
6. CI 在 Linux、Windows 中文路径使用 Node 24 构建一次；同一产物再由 Node 14.18.0 运行冒烟和隔离消费。

`test:dist`、`test:consumer` 和 `test:browser` 消费已有包产物。浏览器消费页面单独打包，不重复构建工具包。根 `pnpm check` 验证所有可发布包，缺少必要脚本直接失败。
