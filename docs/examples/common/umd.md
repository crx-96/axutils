# `@axutils/common` UMD 浏览器接入

UMD 产物适合通过浏览器 `<script>` 标签直接使用，无需模块加载器。它会把浏览器侧公共能力挂载到全局变量 `AxutilsCommon`。

## 使用 unpkg 接入

```html
<script src="https://unpkg.com/@axutils/common/dist/index.umd.cjs"></script>
<script>
  console.log(AxutilsCommon.isNumber(1));
</script>
```

也可以通过 jsDelivr 接入：

```html
<script src="https://cdn.jsdelivr.net/npm/@axutils/common/dist/index.umd.cjs"></script>
```

## 全局名称

UMD 全局名称固定为：

```js
AxutilsCommon
```

所有 UMD 公共方法都通过该对象调用，例如 `AxutilsCommon.deepClone()`、`new AxutilsCommon.Md5()` 和 `new AxutilsCommon.PromiseHttpClient()`。

## UMD 聚合范围与依赖矩阵

下表把 UMD 全局对象和 ESM/CJS 精确入口对应起来。类型在 UMD 中会被 TypeScript 擦除，只能使用运行时 API；Node 专用入口不在 UMD 产物中。

| UMD API 组 | 对应 ESM/CJS 入口 | ESM/CJS 所需 peer | UMD 产物 |
| --- | --- | --- | --- |
| 检查方法：`isNumber`、`isEmail`、`isBrowser` 等 | `@axutils/common`、`@axutils/common/check/type`、`@axutils/common/check/reg`、`@axutils/common/check/platform` | 无 | `AxutilsCommon` 已内置，无第三方依赖 |
| 无依赖对象工具：`deepClone`、`StorageUtils`、`debounce`、`throttle`、`objectToQuery`、`queryToObject` | `@axutils/common`、`@axutils/common/object/object`、`@axutils/common/object/storage`、`@axutils/common/object/timing`、`@axutils/common/object/url` | 无 | `AxutilsCommon` 已内置，无第三方依赖 |
| JSON 工具：`jsonStringify`、`jsonParse`、`jsonStringifySafe`、`jsonParseSafe` | `@axutils/common/object/json` | `safe-stable-stringify` | `safe-stable-stringify` 已打包进 UMD |
| 通用 MD5：`Md5` | `@axutils/common/crypto/md5` | `spark-md5` | `spark-md5` 已打包进 UMD |
| 通用字节转换：`decodeHex`、`bytesToHex` 等 | `@axutils/common/crypto/convert` | 无 | 已随通用加密 API 内置 |
| Axios Promise HTTP：`PromiseHttpClient`、`PromiseHttpRequestError` | `@axutils/common/axios/http` | `axios`、`safe-stable-stringify`、`spark-md5` | 三个 peer 均已打包进 UMD |
| RxJS HTTP：`RxHttpClient`、`HttpRequestError` | `@axutils/common/rxjs/http` | `rxjs`、`axios`、`safe-stable-stringify`、`spark-md5` | 四个 peer 均已打包进 UMD |
| 日期时间：`DATE_FORMAT`、`TIMEZONE`、`Duration`、`Instant`、`Now`、`PlainDate`、`PlainTime`、`PlainDateTime`、`ZonedDateTime` | `@axutils/common/date` | `date-fns`、`date-fns-tz` | 两个日期 peer 均已打包进 UMD |
| Node 加密与 Node 缓存 | `@axutils/common/node`、`@axutils/common/node/crypto/md5`、`@axutils/common/node/crypto/convert`、`@axutils/common/node/object/storage` | 无第三方 peer；依赖 Node.js 内置能力 | 不包含，浏览器不能通过 `AxutilsCommon` 调用 Node API |

浏览器脚本中的运行时调用示例：

```js
console.log(AxutilsCommon.isNumber(1));
console.log(AxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true }));
console.log(new AxutilsCommon.Md5().update("hello").toHex());
console.log(AxutilsCommon.bytesToHex(AxutilsCommon.decodeHex("6869")));
console.log(AxutilsCommon.PlainDate.toString(AxutilsCommon.PlainDate.from("2024-01-01")));
console.log(AxutilsCommon.objectToQuery({ page: 1 }));
```

## 详细使用文档

- [类型、格式与运行时检查](https://github.com/crx-96/axutils/blob/main/docs/examples/common/check.md)
- [对象、JSON、缓存、定时与 URL 工具](https://github.com/crx-96/axutils/blob/main/docs/examples/common/object.md)
- [摘要与编码转换](https://github.com/crx-96/axutils/blob/main/docs/examples/common/crypto.md)
- [Axios Promise HTTP](https://github.com/crx-96/axutils/blob/main/docs/examples/common/axios.md)
- [RxJS HTTP](https://github.com/crx-96/axutils/blob/main/docs/examples/common/rxjs.md)
- [日期与时间](https://github.com/crx-96/axutils/blob/main/docs/examples/common/date.md)

Node.js 专用能力不属于浏览器 UMD 使用范围。
