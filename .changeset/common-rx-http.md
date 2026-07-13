---
"@axutils/common": minor
---

新增基于 Axios + RxJS 的跨端 HTTP 客户端子路径 `@axutils/common/rxjs/http`，支持异步配置、请求重试、in-flight 请求去重，以及最后一个订阅者取消时中止底层请求。修复无订阅者时的重复请求、显式去重 key 串请求和 AbortSignal 共享问题；AbortSignal 现在也能终止异步配置和 `retryDelay` 等等待阶段；非幂等方法默认不重试，可通过 `retryNonIdempotent` 显式开启。
