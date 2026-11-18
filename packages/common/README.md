# @axutils/common

`@axutils/common` 是 `axutils` monorepo 的公共工具包，提供类型与格式校验、对象处理、HTTP、日期时间、摘要转换等常用能力。

## 兼容性

- 包消费运行时：`Node.js >= 14.18.0`
- Node 同一进程的 `import` 和 `require` 共享存储和错误类。日期入口按调用方的模块格式加载 `date-fns`，保留通过 `setDefaultOptions` 设置的语言和周规则。浏览器打包使用原生 ESM，支持按需导入、动态导入和 tree shaking。
- Promise 和 RxJS HTTP 入口提供 ESM/CJS 声明，可在使用 `@types/node@14` 的纯 Node 工程中启用严格声明检查，支持传入 Axios 的原始实例。在 Node ESM 中需要复用应用配置的 Axios defaults 或拦截器时，通过 `axiosInstance` 传入该实例。
- 浏览器 UMD 单文件附带本包和内置依赖的许可正文，发布包另提供 `dist/THIRD-PARTY-LICENSES.json`。
- Node 专属实现使用显式 `/node` 子路径；根入口不要求安装第三方运行时依赖

## 安装

```bash
pnpm add @axutils/common
```

部分功能使用可选 peer 依赖。请在对应的详细文档中查看所需依赖、安装命令、导入方式和完整方法示例。

## 详细文档

- [UMD 浏览器接入](https://github.com/crx-96/axutils/blob/main/docs/examples/common/umd.md)
- [类型、格式与运行时检查](https://github.com/crx-96/axutils/blob/main/docs/examples/common/check.md)
- [对象、JSON、缓存、间隔控制、树路径与 URL 工具](https://github.com/crx-96/axutils/blob/main/docs/examples/common/object.md)
- [RGB 颜色混合](https://github.com/crx-96/axutils/blob/main/docs/examples/common/color.md)
- [浏览器与通用环境的摘要、编码转换](https://github.com/crx-96/axutils/blob/main/docs/examples/common/crypto.md)
- [Axios Promise HTTP](https://github.com/crx-96/axutils/blob/main/docs/examples/common/axios.md)
- [RxJS HTTP](https://github.com/crx-96/axutils/blob/main/docs/examples/common/rxjs.md)
- [日期与时间](https://github.com/crx-96/axutils/blob/main/docs/examples/common/date.md)
- [Node.js 摘要与编码转换](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/crypto.md)
- [Node.js 缓存](https://github.com/crx-96/axutils/blob/main/docs/examples/common/node/object.md)

## 仓库

- [项目主页](https://github.com/crx-96/axutils)
- [问题反馈](https://github.com/crx-96/axutils/issues)
