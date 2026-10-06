# `@axutils/common` RGB 颜色混合

提供两个 `#RRGGBB` 颜色的 RGB 通道线性插值，无第三方依赖，不涉及主题、CSS、DOM 或框架状态。

## 公共入口

```ts
import { mixRgbColor } from "@axutils/common/color/rgb";
// 根入口同样导出：import { mixRgbColor } from "@axutils/common";
```

CJS：`const { mixRgbColor } = require("@axutils/common/color/rgb")`，也可使用根入口。UMD：`AxutilsCommon.mixRgbColor(...)`。没有声明 `@axutils/common/color` 目录入口。

## `mixRgbColor(color, target, amount): string`

| 参数 | 语义 |
| --- | --- |
| `color` | 起始色，只接受 `#` 加六位十六进制字符，大小写均可 |
| `target` | 目标色，格式与起始色相同 |
| `amount` | 目标色占比，必填有限数字，范围 `[0, 1]`，不自动截断 |

红、绿、蓝分别使用 `Math.round(source + (target - source) * amount)`，然后转小写十六进制并补齐两位，返回 `#rrggbb`。`amount = 0` 返回起始色的小写形式，`1` 返回目标色的小写形式；端点同样校验两个颜色。不作 gamma 校正、线性色彩空间转换或 alpha 混合。

所有校验在调用时同步完成：颜色为非字符串或不符合六位格式，或比例为非数字、`NaN`、无穷时抛 `TypeError`；比例小于 `0` 或大于 `1` 时抛 `RangeError`。三位简写、八位透明度、前后空白和末尾换行均拒绝；现有 `isHexColor` 的校验范围不变。

```ts
import { mixRgbColor } from "@axutils/common/color/rgb";

console.log(mixRgbColor("#000000", "#ffffff", 0.5)); // #808080
console.log(mixRgbColor("#ff0000", "#0000ff", 0.25)); // #bf0040
console.log(mixRgbColor("#23745b", "#ffffff", 0.1)); // #39826b
console.log(mixRgbColor("#000000", "#010305", 0.5)); // #010203
console.log(mixRgbColor("#ABCDEF", "#123456", 0)); // #abcdef

try {
  mixRgbColor("#fff", "#000000", 0.5);
} catch (error) {
  console.log(error instanceof TypeError); // true
}
```

应用原先的 `mixThemeColor(color, target, amount)` 可以改为调用 `mixRgbColor`；有效输入的计算顺序、取整、补零和输出保持一致。主题配色表、CSS 变量写入及状态管理仍由应用维护。
