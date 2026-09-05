import { startVitest } from "vitest/node";

// 使用已安装的 Vitest 编译源码，兼容 Node 20.19，不依赖 dist 或 Node 的原生 TypeScript 支持。
// probe 不使用 .test.ts 后缀，避免外层测试重复发现或递归启动自身。
await startVitest("test", [], {
  config: false,
  environment: "node",
  include: ["test/date/helpers/timezone.probe.ts"],
  maxWorkers: 1,
  reporters: ["dot"],
  watch: false,
});
