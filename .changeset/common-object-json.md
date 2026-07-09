---
"@axutils/common": minor
---

新增 `@axutils/common/object/json` 子路径，提供带配置项的 JSON 序列化/反序列化工具（`jsonStringify`、`jsonParse`、`jsonStringifySafe`、`jsonParseSafe`、`JsonCircularReferenceError`），底层使用 optional peer 依赖 `safe-stable-stringify`。
