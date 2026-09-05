# `@axutils/common` 日期时间工具

本文档对应 `packages/common/src/date`，公开入口为 `@axutils/common/date`。API 借鉴 Temporal 的命名，但当前返回的是轻量 `Date`、epoch 毫秒数或 `{ epochMs, timezone }`，不是原生 Temporal 实例。

安装可选 peer 依赖：

```bash
pnpm add @axutils/common date-fns date-fns-tz
```

`date-fns` 的 locale 类型也用于 `format` 的 `options.locale`；locale 必须传入已导入的 locale 对象，不能传字符串。

## 公开导出与所有合法使用方式

日期 API 全部位于 `package.json#exports` 声明的 `@axutils/common/date` 精确子路径；根入口只提供六个无依赖的毫秒/秒常量，不提供任何日期命名空间。`@axutils/common/date` 静态依赖 `date-fns` 和 `date-fns-tz`，因此不能从根入口加载。UMD 构建会把日期模块及其浏览器侧依赖内置到产物中。

| `package.json#exports` 入口 | 运行时 API | 命名类型 | 所需 peer |
| --- | --- | --- | --- |
| `@axutils/common/date` | `DATE_FORMAT`、`TIMEZONE`、`Duration`（`from`、`fromMilliseconds`、`totalMilliseconds`、`negated`、`abs`、`add`、`subtract`）、`Instant`（`from`、`fromEpochMilliseconds`、`toZonedDateTime`、`epochMilliseconds`、`add`、`subtract`、`since`、`equals`、`compare`）、`Now`（`plainDateISO`、`plainTimeISO`、`plainDateTimeISO`、`zonedDateTimeISO`、`instant`）、`PlainDate`（`from`、`of`、`toZonedDateTime`、`toPlainDateTime`、`add`、`subtract`、`since`、`equals`、`compare`、`isBefore`、`isAfter`、`isBetween`、`yearOf`、`monthOf`、`dayOf`、`dayOfWeek`、`daysInMonth`、`startOfWeek`、`endOfWeek`、`toString`、`format`）、`PlainTime`（`from`、`of`、`add`、`subtract`、`since`、`equals`、`compare`、`isBefore`、`isAfter`、`hourOf`、`minuteOf`、`secondOf`、`millisecondOf`、`toString`）、`PlainDateTime`（`from`、`toZonedDateTime`、`add`、`subtract`、`since`、`equals`、`compare`、`toPlainDate`、`toPlainTime`、`isBefore`、`isAfter`、`format`、`toString`）、`ZonedDateTime`（`from`、`toInstant`、`toPlainDate`、`toPlainTime`、`toPlainDateTime`、`withTimeZone`、`add`、`subtract`、`since`、`equals`、`compare`、`format`、`toString`） | `DateFormatPattern`、`Timezone`、`DateFormatOptions`、`DurationFields`、`PlainDateInput`、`PlainTimeInput`、`PlainDateTimeInput`、`ZonedDateTimeInput`、`ZonedDateTimeValue`、`ZonedDateTimeOptions` | `date-fns`、`date-fns-tz` |
| `@axutils/common` (`.`) | `MS_PER_SECOND`、`MS_PER_MINUTE`、`MS_PER_HOUR`、`MS_PER_DAY`、`SECONDS_PER_MINUTE`、`SECONDS_PER_HOUR` | 不导出日期模块类型 | 无 |

ESM 入口示例：

```ts
import {
  DATE_FORMAT,
  Duration,
  Instant,
  Now,
  PlainDate,
  PlainDateTime,
  PlainTime,
  TIMEZONE,
  ZonedDateTime,
} from "@axutils/common/date";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@axutils/common";
import type {
  DateFormatOptions,
  DateFormatPattern,
  DurationFields,
  PlainDateInput,
  PlainDateTimeInput,
  PlainTimeInput,
  Timezone,
  ZonedDateTimeInput,
  ZonedDateTimeOptions,
  ZonedDateTimeValue,
} from "@axutils/common/date";
```

CJS 入口示例：

```js
const {
  DATE_FORMAT,
  Duration,
  Instant,
  Now,
  PlainDate,
  PlainDateTime,
  PlainTime,
  TIMEZONE,
  ZonedDateTime,
} = require("@axutils/common/date");
const {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} = require("@axutils/common");
```

根入口不能这样导入 `Duration`、`PlainDate` 或 `DATE_FORMAT`；只有上表中的六个时间常量从根入口可用。UMD 中日期 API 通过 `AxutilsCommon` 访问：

```js
const value = AxutilsCommon.PlainDate.from("2024-01-01");
console.log(AxutilsCommon.PlainDate.toString(value));
console.log(AxutilsCommon.DATE_FORMAT.DATE, AxutilsCommon.TIMEZONE.UTC);
```

## 输入、时区和类型

- `PlainDateInput`：ISO 日期字符串、`Date` 或 `{ year, month, day }`。
- `PlainTimeInput`：时间字符串、`Date` 或 `{ hour, minute, second?, millisecond? }`。
- `PlainDateTimeInput`：日期时间字符串、`Date` 或日期时间字段对象。
- `ZonedDateTimeInput`：ISO 字符串或 `Date`。
- `DurationFields`：可选的 `years`、`months`、`days`、`hours`、`minutes`、`seconds`、`milliseconds` 字段，所有字段必须是有限整数。
- `DateFormatOptions`：`locale?: Locale` 和 `timezone?: Timezone`。
- `ZonedDateTimeValue`：`{ epochMs: number; timezone: Timezone }`。
- `Timezone`：允许 `TIMEZONE` 中的常用值，也允许自定义 IANA 时区字符串；不要使用 `CST`、`IST` 等歧义缩写。

纯日期、纯时间和无时区日期时间从 `Date` 提取 UTC 字段，以避免调用方机器时区影响结果。字符串日期时间支持 `T`、`t` 或空格作为分隔符。所有无效输入统一抛 `RangeError`。

### 时区转换边界

将无偏移日期时间解释为指定时区时，先保留完整日历字段，再交给 date-fns-tz；不先构造宿主本地 Date。因此宿主处于夏令时缺失时段或跳过某一天时，不会在转换前改写原始字段。秒以下精度以整数毫秒保留。

目标时区本身的重复时间、缺失时间及公元 0 年/BCE 仍遵从 date-fns-tz 的现有行为，并非完整 Temporal 消歧实现。例如目标纽约的 2024-11-03T01:30 仍可能受其宿主相关的消歧选择影响；需要指定唯一时间点时传入明确 UTC 偏移或 epoch。

ISO 偏移的分钟部分必须为 00–59，完整范围不超过 ±14:00；+00:60、+01:99 和 ±14:01 均抛 RangeError。

```ts
import { PlainDateTime } from "@axutils/common/date";

const value = PlainDateTime.toZonedDateTime("2024-03-10T02:30:00", "UTC");
console.log(new Date(value.epochMs).toISOString()); // 2024-03-10T02:30:00.000Z
```

## 常量

### `DATE_FORMAT`

从 `@axutils/common/date` 导入常用 date-fns 格式：`DATE`、`DATE_TIME`、`DATE_TIME_MS`、`SLASH_DATE`、`SLASH_DATE_TIME`、`CN_DATE`、`CN_DATE_TIME`、`TIME`、`TIME_MS`、`ISO_OFFSET` 和 `ISO_UTC`。也可以直接传自定义 date-fns token 字符串。

```ts
import { DATE_FORMAT, PlainDate } from "@axutils/common/date";

console.log(PlainDate.format("2024-01-02", DATE_FORMAT.CN_DATE)); // 2024年1月2日
console.log(DATE_FORMAT.ISO_UTC); // yyyy-MM-dd'T'HH:mm:ss.SSS'Z'
```

### `TIMEZONE`

提供 `UTC`、`ASIA_SHANGHAI`/`CHINA`、东京、首尔、新加坡、伦敦、巴黎、柏林、纽约、芝加哥、洛杉矶、开罗、悉尼、奥克兰等常用 IANA 城市标识，以及源码中列出的其他亚洲、欧洲、美洲、非洲和大洋洲时区。完整对象可通过 IDE 的 `TIMEZONE.` 补全查看；`CHINA` 是 `Asia/Shanghai` 的语义别名。

```ts
import { TIMEZONE, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-06-15T10:00:00", {
  timezone: TIMEZONE.CHINA,
});
console.log(value.timezone); // Asia/Shanghai
```

### 时间常量

`MS_PER_SECOND`、`MS_PER_MINUTE`、`MS_PER_HOUR`、`MS_PER_DAY`、`SECONDS_PER_MINUTE`、`SECONDS_PER_HOUR` 从包主入口 `@axutils/common` 导出，不从 `@axutils/common/date` 导出。

```ts
import { MS_PER_DAY, SECONDS_PER_HOUR } from "@axutils/common";

console.log(MS_PER_DAY, SECONDS_PER_HOUR); // 86400000 3600
```

## `Duration`

### `Duration.from(fields)`

从字段对象创建新的 duration 字段副本；未传字段不会自动补零，也不做字段归约。字段必须是有限整数。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.from({ days: 1, hours: 2 })); // { days: 1, hours: 2 }
```

### `Duration.fromMilliseconds(milliseconds)`

把有限整数毫秒拆成完整的 `years: 0`、`months: 0`、天、时、分、秒、毫秒字段；负数会逐字段带负号。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.fromMilliseconds(90_061_000));
// { years: 0, months: 0, days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 0 }
```

### `Duration.totalMilliseconds(fields)`

将不含非零 `years`/`months` 的字段展开为毫秒。若年月非零，因日历月长度不固定而抛 `RangeError`。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.totalMilliseconds({ days: 1, seconds: 1 })); // 86401000
```

### `Duration.negated(fields)`

逐字段取反，不借位、不归约。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.negated({ days: 1, minutes: -2 })); // { days: -1, minutes: 2 }
```

### `Duration.abs(fields)`

逐字段取绝对值，不统一混合符号或跨字段归约。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.abs({ days: -1, hours: 2 })); // { days: 1, hours: 2 }
```

### `Duration.add(first, second)`

按相同字段直接相加；任一输入含有该字段时结果保留该字段，不自动进位。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.add({ days: 1 }, { days: 2, hours: 3 }));
// { days: 3, hours: 3 }
```

### `Duration.subtract(first, second)`

按相同字段直接相减；不借位、不归约。

```ts
import { Duration } from "@axutils/common/date";

console.log(Duration.subtract({ days: 3, hours: 1 }, { days: 1, hours: 2 }));
// { days: 2, hours: -1 }
```

## `Instant`

`Instant` 以 Unix epoch 毫秒数表示绝对时间点。`add`/`subtract` 不允许非零 `years` 或 `months`，因为绝对时间点无法独立推导日历月长度。

### `Instant.from(value)`

从带 `Z` 或 UTC 偏移的 ISO 字符串创建 epoch 毫秒。没有时区信息的字符串会抛 `RangeError`。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.from("2024-06-15T10:00:00Z"));
```

### `Instant.fromEpochMilliseconds(milliseconds)`

从有限整数 epoch 毫秒创建绝对时间点，并校验是否在 `Date` 可表示范围内。

```ts
import { Instant } from "@axutils/common/date";

const instant = Instant.fromEpochMilliseconds(0);
console.log(instant); // 0
```

### `Instant.toZonedDateTime(epochMs, timezone)`

给绝对时间点关联 IANA 时区，返回 `{ epochMs, timezone }`；不会改变 epoch 毫秒。

```ts
import { Instant, TIMEZONE } from "@axutils/common/date";

const value = Instant.toZonedDateTime(0, TIMEZONE.CHINA);
console.log(value); // { epochMs: 0, timezone: "Asia/Shanghai" }
```

### `Instant.epochMilliseconds(instant)`

读取并校验 epoch 毫秒值。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.epochMilliseconds(1_700_000_000_000));
```

### `Instant.add(instant, duration)`

按实际毫秒数相加，可使用 days/hours/minutes/seconds/milliseconds；非零 years/months 抛 `RangeError`。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.add(0, { hours: 1 })); // 3600000
```

### `Instant.subtract(instant, duration)`

按实际毫秒数相减，年月边界与 `add` 相同。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.subtract(3_600_000, { hours: 1 })); // 0
```

### `Instant.since(instant, other)`

返回 `instant - other` 的天、时、分、秒、毫秒分解结果。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.since(90_061_000, 0));
// { days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 0 }
```

### `Instant.equals(first, second)`

判断两个 epoch 毫秒是否相等。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.equals(0, 0)); // true
```

### `Instant.compare(first, second)`

比较两个绝对时间点，返回 `-1`、`0` 或 `1`。

```ts
import { Instant } from "@axutils/common/date";

console.log(Instant.compare(0, 1)); // -1
```

## `Now`

`Now` 返回当前值；纯日期/时间方法返回 UTC 对齐的 `Date`，不会把调用方机器时区带入字段读取。

### `Now.plainDateISO(timezone?)`

读取目标时区的当前日期，返回 UTC 午夜对齐的 `Date`。省略时区使用运行时本地时区。

```ts
import { Now } from "@axutils/common/date";

const today = Now.plainDateISO("Asia/Shanghai");
console.log(today.toISOString().slice(0, 10));
```

### `Now.plainTimeISO(timezone?)`

读取目标时区的当前时间（含毫秒），返回以 `1970-01-01T...Z` 表示墙上时间的 `Date`。

```ts
import { Now } from "@axutils/common/date";

const time = Now.plainTimeISO("Asia/Shanghai");
console.log(time.toISOString()); // 1970-01-01T...
```

### `Now.plainDateTimeISO(timezone?)`

读取目标时区的当前日期时间，返回 UTC 对齐字段的 `Date`。

```ts
import { Now } from "@axutils/common/date";

const dateTime = Now.plainDateTimeISO("UTC");
console.log(dateTime.toISOString());
```

### `Now.zonedDateTimeISO(timezone?)`

返回当前绝对 epoch 毫秒以及关联时区的 `ZonedDateTimeValue`。

```ts
import { Now } from "@axutils/common/date";

const value = Now.zonedDateTimeISO("Asia/Tokyo");
console.log(value.epochMs, value.timezone);
```

### `Now.instant()`

返回当前 epoch 毫秒数，等价于 `Date.now()`。

```ts
import { Now } from "@axutils/common/date";

console.log(Now.instant() === Date.now()); // 通常为 false/true，取决于两次读取的时刻
```

## `PlainDate`

纯日期以 UTC 对齐的 `Date` 保存年月日，不携带时区和时间。

### `PlainDate.from(input)`

接受 ISO 日期字符串、`Date` 或 `{ year, month, day }` 字段对象；无效输入抛 `RangeError`。

```ts
import { PlainDate } from "@axutils/common/date";

const date = PlainDate.from("2024-02-29");
console.log(PlainDate.toString(date)); // 2024-02-29
```

### `PlainDate.of(year, month, day)`

使用年月日字段创建纯日期，等价于 `from({ year, month, day })`。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.toString(PlainDate.of(2024, 2, 29))); // 2024-02-29
```

### `PlainDate.toZonedDateTime(date, timezone)`

把日期解释为目标时区午夜，返回对应的绝对 epoch 毫秒和时区。日期本身不会被转换到调用方本地时区。

```ts
import { PlainDate, TIMEZONE } from "@axutils/common/date";

const value = PlainDate.toZonedDateTime("2024-01-01", TIMEZONE.CHINA);
console.log(value.timezone, value.epochMs);
```

### `PlainDate.toPlainDateTime(date)`

把纯日期转换为当天 UTC 午夜的无时区日期时间 `Date`。

```ts
import { PlainDate } from "@axutils/common/date";

const dateTime = PlainDate.toPlainDateTime("2024-01-01");
console.log(dateTime.toISOString()); // 2024-01-01T00:00:00.000Z
```

### `PlainDate.add(date, duration)`

按日历加年月日；月末溢出会 clamp 到目标月最后一天，例如 1 月 31 日加 1 月得到 2 月最后一天。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.toString(PlainDate.add("2024-01-31", { months: 1 })));
// 2024-02-29
```

### `PlainDate.subtract(date, duration)`

按日历减年月日，月末同样使用目标月最后一天 clamp。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.toString(PlainDate.subtract("2024-03-31", { months: 1 })));
// 2024-02-29
```

### `PlainDate.since(date, other)`

返回 `date - other` 的日历日差，结果只包含 `days` 字段。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.since("2024-01-03", "2024-01-01")); // { days: 2 }
```

### `PlainDate.equals(first, second)`

判断两个纯日期的年月日是否相同。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.equals("2024-01-01", { year: 2024, month: 1, day: 1 })); // true
```

### `PlainDate.compare(first, second)`

按日期先后比较，返回 `-1`、`0` 或 `1`。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.compare("2024-01-01", "2024-01-02")); // -1
```

### `PlainDate.isBefore(first, second)`

判断 `first` 是否早于 `second`。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.isBefore("2024-01-01", "2024-01-02")); // true
```

### `PlainDate.isAfter(first, second)`

判断 `first` 是否晚于 `second`。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.isAfter("2024-01-03", "2024-01-02")); // true
```

### `PlainDate.isBetween(date, start, end)`

判断日期是否位于闭区间 `[start, end]`；不会自动交换边界。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.isBetween("2024-01-02", "2024-01-01", "2024-01-02")); // true
```

### `PlainDate.yearOf(date)`

读取 UTC 年份。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.yearOf("2024-05-06")); // 2024
```

### `PlainDate.monthOf(date)`

读取 UTC 月份，范围为 `1..12`。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.monthOf("2024-05-06")); // 5
```

### `PlainDate.dayOf(date)`

读取 UTC 日期中的日，范围取决于月份。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.dayOf("2024-05-06")); // 6
```

### `PlainDate.dayOfWeek(date)`

读取星期几，按 ISO 约定返回 `1`（周一）到 `7`（周日）。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.dayOfWeek("2024-01-01")); // 1
```

### `PlainDate.daysInMonth(date)`

返回所在月份的天数，自动处理闰年。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.daysInMonth("2024-02-01")); // 29
```

### `PlainDate.startOfWeek(date, options?)`

返回所在周的第一天。`options.weekStartsOn` 为 `0..6` 的整数，默认 `1`（周一）；非法值抛 `RangeError`。

```ts
import { PlainDate } from "@axutils/common/date";

const monday = PlainDate.startOfWeek("2024-01-03");
console.log(PlainDate.toString(monday)); // 2024-01-01
```

### `PlainDate.endOfWeek(date, options?)`

返回所在周的最后一天，使用与 `startOfWeek` 相同的 `weekStartsOn` 配置。

```ts
import { PlainDate } from "@axutils/common/date";

const sunday = PlainDate.endOfWeek("2024-01-03");
console.log(PlainDate.toString(sunday)); // 2024-01-07
```

### `PlainDate.toString(date)`

输出固定 `YYYY-MM-DD`，年份至少补齐四位。

```ts
import { PlainDate } from "@axutils/common/date";

console.log(PlainDate.toString({ year: 2024, month: 1, day: 2 })); // 2024-01-02
```

### `PlainDate.format(date, pattern, options?)`

使用 UTC 格式化纯日期。`pattern` 可传 `DATE_FORMAT` 预设或任意 date-fns token；`options.locale` 接收已导入 locale 对象，纯日期的 timezone 不由该选项改变。

```ts
import { PlainDate, DATE_FORMAT } from "@axutils/common/date";

console.log(PlainDate.format("2024-01-02", DATE_FORMAT.CN_DATE)); // 2024年1月2日
```

## `PlainTime`

纯时间以 `1970-01-01` UTC 对齐的 `Date` 保存时分秒毫秒。加减不跨日，超过 24 小时按周期取模。

### `PlainTime.from(input)`

接受 `HH:mm:ss` 或带毫秒的时间字符串，也接受完整日期时间字符串、`Date` 或字段对象。

```ts
import { PlainTime } from "@axutils/common/date";

const time = PlainTime.from("23:30:00");
console.log(PlainTime.toString(time)); // 23:30:00
```

### `PlainTime.of(hour, minute, second?, millisecond?)`

使用时分秒毫秒字段创建纯时间，缺省秒和毫秒为 `0`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.toString(PlainTime.of(8, 5, 2, 3))); // 08:05:02.003
```

### `PlainTime.add(time, duration)`

只使用 hours/minutes/seconds/milliseconds 字段，结果在一天内按 24 小时取模；年月日字段被忽略。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.toString(PlainTime.add("23:30:00", { hours: 1 })));
// 00:30:00
```

### `PlainTime.subtract(time, duration)`

按时间字段相减并在一天内取模。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.toString(PlainTime.subtract("00:30:00", { hours: 1 })));
// 23:30:00
```

### `PlainTime.since(time, other)`

返回 `time - other` 的时、分、秒、毫秒差，不包含 days 字段。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.since("01:01:01", "00:00:00"));
// { hours: 1, minutes: 1, seconds: 1, milliseconds: 0 }
```

### `PlainTime.equals(first, second)`

判断两个纯时间的时分秒毫秒是否相等。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.equals("08:00:00", PlainTime.of(8, 0))); // true
```

### `PlainTime.compare(first, second)`

按一天内的时间先后比较，返回 `-1`、`0` 或 `1`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.compare("08:00:00", "09:00:00")); // -1
```

### `PlainTime.isBefore(first, second)`

判断 `first` 是否早于 `second`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.isBefore("08:00:00", "09:00:00")); // true
```

### `PlainTime.isAfter(first, second)`

判断 `first` 是否晚于 `second`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.isAfter("10:00:00", "09:00:00")); // true
```

### `PlainTime.hourOf(time)`

读取小时，范围 `0..23`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.hourOf("08:05:02")); // 8
```

### `PlainTime.minuteOf(time)`

读取分钟，范围 `0..59`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.minuteOf("08:05:02")); // 5
```

### `PlainTime.secondOf(time)`

读取秒，范围 `0..59`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.secondOf("08:05:02")); // 2
```

### `PlainTime.millisecondOf(time)`

读取毫秒，范围 `0..999`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.millisecondOf("08:05:02.003")); // 3
```

### `PlainTime.toString(time)`

输出 `HH:mm:ss`；毫秒非零时追加三位 `.SSS`。

```ts
import { PlainTime } from "@axutils/common/date";

console.log(PlainTime.toString("08:05:02.003")); // 08:05:02.003
```

## `PlainDateTime`

无时区日期时间以 UTC 对齐 `Date` 保存原始年月日时分秒毫秒字段；`format` 可指定显示时区。

### `PlainDateTime.from(input)`

接受完整日期时间字符串、`Date` 或字段对象；秒和毫秒在字段对象中可省略并默认为 `0`。

```ts
import { PlainDateTime } from "@axutils/common/date";

const value = PlainDateTime.from("2024-06-15 10:30:00");
console.log(PlainDateTime.toString(value)); // 2024-06-15T10:30:00
```

### `PlainDateTime.toZonedDateTime(dateTime, timezone)`

把无时区字段解释为目标 IANA 时区的本地日期时间，返回绝对 epoch 毫秒和该时区。

```ts
import { PlainDateTime, TIMEZONE } from "@axutils/common/date";

const value = PlainDateTime.toZonedDateTime(
  "2024-06-15T10:30:00",
  TIMEZONE.CHINA,
);
console.log(value.timezone, value.epochMs);
```

### `PlainDateTime.add(dateTime, duration)`

年月按日历处理，days 及更小字段按 UTC 毫秒累加；月末会 clamp 到目标月最后一天。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(
  PlainDateTime.toString(
    PlainDateTime.add("2024-01-31T23:30:00", { months: 1, hours: 1 }),
  ),
); // 2024-03-01T00:30:00
```

### `PlainDateTime.subtract(dateTime, duration)`

按日历年月和实际较小字段相减。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(
  PlainDateTime.toString(
    PlainDateTime.subtract("2024-02-01T00:30:00", { hours: 1 }),
  ),
); // 2024-02-01T00:00:00
```

### `PlainDateTime.since(dateTime, other)`

返回 `dateTime - other` 的天、时、分、秒、毫秒分解；不拆分年月字段。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.since("2024-01-02T01:00:00", "2024-01-01T00:00:00"));
// { days: 1, hours: 1, minutes: 0, seconds: 0, milliseconds: 0 }
```

### `PlainDateTime.equals(first, second)`

判断两个无时区日期时间字段是否相等。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.equals("2024-01-01T00:00:00", {
  year: 2024, month: 1, day: 1, hour: 0, minute: 0,
})); // true
```

### `PlainDateTime.compare(first, second)`

比较两个无时区日期时间，返回 `-1`、`0` 或 `1`。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.compare("2024-01-01T00:00:00", "2024-01-02T00:00:00")); // -1
```

### `PlainDateTime.toPlainDate(dateTime)`

提取 UTC 对齐的纯日期，时间字段清零。

```ts
import { PlainDateTime, PlainDate } from "@axutils/common/date";

const date = PlainDateTime.toPlainDate("2024-01-02T03:04:05");
console.log(PlainDate.toString(date)); // 2024-01-02
```

### `PlainDateTime.toPlainTime(dateTime)`

提取 UTC 对齐的纯时间，日期固定为 `1970-01-01`。

```ts
import { PlainDateTime, PlainTime } from "@axutils/common/date";

const time = PlainDateTime.toPlainTime("2024-01-02T03:04:05");
console.log(PlainTime.toString(time)); // 03:04:05
```

### `PlainDateTime.isBefore(first, second)`

判断 `first` 是否早于 `second`。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.isBefore("2024-01-01T00:00:00", "2024-01-01T01:00:00")); // true
```

### `PlainDateTime.isAfter(first, second)`

判断 `first` 是否晚于 `second`。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.isAfter("2024-01-01T02:00:00", "2024-01-01T01:00:00")); // true
```

### `PlainDateTime.format(dateTime, pattern, options?)`

格式化无时区日期时间。省略 `options.timezone` 时按内部 UTC 字段格式化；传入 IANA 时区可按目标时区显示。`options.locale` 传 date-fns locale 对象。

```ts
import { DATE_FORMAT, PlainDateTime } from "@axutils/common/date";

console.log(
  PlainDateTime.format("2024-01-02T03:04:05", DATE_FORMAT.DATE_TIME),
); // 2024-01-02 03:04:05
```

### `PlainDateTime.toString(dateTime)`

输出 ISO 日期时间；毫秒非零时追加三位 `.SSS`。

```ts
import { PlainDateTime } from "@axutils/common/date";

console.log(PlainDateTime.toString("2024-01-02T03:04:05.006")); // 2024-01-02T03:04:05.006
```

## `ZonedDateTime`

带时区日期时间内部保存绝对 `epochMs` 和关联的 IANA `timezone`。切换时区保持绝对时刻；`add`/`subtract` 按实际经过的毫秒计算，不保证跨 DST 后保持相同挂钟时间。

### `ZonedDateTime.from(input, options?)`

接受含时区/偏移的 ISO 字符串或 `Date`。无时区字符串可通过 `options.timezone` 指定解释时区；含 UTC 偏移的字符串会按偏移计算绝对时刻。返回 `ZonedDateTimeValue`。

```ts
import { TIMEZONE, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-06-15T10:00:00", {
  timezone: TIMEZONE.CHINA,
});
console.log(value.timezone, value.epochMs);
```

### `ZonedDateTime.toInstant(zdt)`

读取带时区值的 epoch 毫秒。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:00:00Z");
console.log(ZonedDateTime.toInstant(value)); // 1704067200000
```

### `ZonedDateTime.toPlainDate(zdt)`

按关联时区提取本地日期，返回 UTC 对齐的纯日期 `Date`。

```ts
import { PlainDate, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:30:00Z", {
  timezone: "Asia/Shanghai",
});
console.log(PlainDate.toString(ZonedDateTime.toPlainDate(value))); // 2024-01-01
```

### `ZonedDateTime.toPlainTime(zdt)`

按关联时区提取本地时间，返回以 `1970-01-01` UTC 对齐的纯时间 `Date`。

```ts
import { PlainTime, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:30:00Z", {
  timezone: "Asia/Shanghai",
});
console.log(PlainTime.toString(ZonedDateTime.toPlainTime(value))); // 08:30:00
```

### `ZonedDateTime.toPlainDateTime(zdt)`

按关联时区提取本地日期时间，返回 UTC 对齐字段的无时区 `Date`。

```ts
import { PlainDateTime, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:30:00Z", {
  timezone: "Asia/Shanghai",
});
console.log(PlainDateTime.toString(ZonedDateTime.toPlainDateTime(value))); // 2024-01-01T08:30:00
```

### `ZonedDateTime.withTimeZone(zdt, timezone)`

只替换关联时区，保持同一个 epoch 毫秒；适用于同一瞬间的跨地区展示。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const shanghai = ZonedDateTime.from("2024-01-01T08:00:00", {
  timezone: "Asia/Shanghai",
});
const newYork = ZonedDateTime.withTimeZone(shanghai, "America/New_York");
console.log(newYork.epochMs === shanghai.epochMs); // true
```

### `ZonedDateTime.add(zdt, duration)`

按实际经过的天、时、分、秒、毫秒相加；非零 years/months 抛 `RangeError`，需要日历年月运算时先转为 `PlainDateTime`。

```ts
import { PlainDateTime, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:00:00Z", { timezone: "UTC" });
const next = ZonedDateTime.add(value, { hours: 1 });
console.log(PlainDateTime.toString(ZonedDateTime.toPlainDateTime(next)));
// 2024-01-01T01:00:00
```

### `ZonedDateTime.subtract(zdt, duration)`

按实际经过的时长相减，年月边界与 `add` 相同。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T01:00:00Z", { timezone: "UTC" });
const previous = ZonedDateTime.subtract(value, { hours: 1 });
console.log(ZonedDateTime.toInstant(previous)); // 1704067200000
```

### `ZonedDateTime.since(zdt, other)`

返回两个带时区值的实际时长差 `zdt - other`，按天到毫秒分解。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const first = ZonedDateTime.from("2024-01-01T01:00:00Z");
const second = ZonedDateTime.from("2024-01-01T00:00:00Z");
console.log(ZonedDateTime.since(first, second)); // { hours: 1, ... }
```

### `ZonedDateTime.equals(first, second)`

判断两个值是否表示同一个绝对时刻；关联时区不同但 epoch 相同仍返回 `true`。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const utc = ZonedDateTime.from("2024-01-01T00:00:00Z", { timezone: "UTC" });
const shanghai = ZonedDateTime.from("2024-01-01T08:00:00", {
  timezone: "Asia/Shanghai",
});
console.log(ZonedDateTime.equals(utc, shanghai)); // true
```

### `ZonedDateTime.compare(first, second)`

按绝对 epoch 毫秒比较，返回 `-1`、`0` 或 `1`。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const first = ZonedDateTime.from("2024-01-01T00:00:00Z");
const second = ZonedDateTime.from("2024-01-01T01:00:00Z");
console.log(ZonedDateTime.compare(first, second)); // -1
```

### `ZonedDateTime.format(zdt, pattern, options?)`

按关联时区格式化；`options.timezone` 可以覆盖显示时区，`options.locale` 接受已导入的 date-fns locale 对象。

```ts
import { DATE_FORMAT, ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:00:00Z", {
  timezone: "Asia/Shanghai",
});
console.log(ZonedDateTime.format(value, DATE_FORMAT.DATE_TIME)); // 2024-01-01 08:00:00
```

### `ZonedDateTime.toString(zdt)`

输出带 UTC 偏移的 ISO 日期时间；epoch 毫秒非整秒时追加三位毫秒，不附加 IANA 时区方括号。

```ts
import { ZonedDateTime } from "@axutils/common/date";

const value = ZonedDateTime.from("2024-01-01T00:00:00Z", {
  timezone: "Asia/Shanghai",
});
console.log(ZonedDateTime.toString(value)); // 2024-01-01T08:00:00+08:00
```

`ZonedDateTimeOptions` 是公开类型，形状为 `{ timezone?: Timezone }`；可以从 `@axutils/common/date` 导入。所有 date 命名空间和常量也可按 `@axutils/common/date` 主入口导入，包主入口 `@axutils/common` 不聚合这些日期命名空间。
