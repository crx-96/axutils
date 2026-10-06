import { describe, expect, it } from "vitest";
import { mixRgbColor } from "../../src/color/rgb.js";
import { mixRgbColor as fromEntry } from "../../src/index.js";

describe("color/rgb - mixRgbColor", () => {
  it("根入口与功能入口保持同一函数", () => {
    expect(fromEntry).toBe(mixRgbColor);
  });

  it.each([
    ["#ABCDEF", "#123456", 0, "#abcdef"],
    ["#ABCDEF", "#123456", 1, "#123456"],
    ["#000000", "#ffffff", 0.5, "#808080"],
    ["#ffffff", "#000000", 0.5, "#808080"],
    ["#ff0000", "#0000ff", 0.25, "#bf0040"],
    ["#000000", "#010305", 0.5, "#010203"],
    ["#23745b", "#ffffff", 0.1, "#39826b"],
    ["#aBcDeF", "#aBcDeF", 0.37, "#abcdef"],
  ])("保持 %s 向 %s 混合 %s 的取整与补零结果", (color, target, amount, result) => {
    expect(mixRgbColor(color, target, amount)).toBe(result);
  });

  it.each([
    "",
    "#fff",
    "#abcd",
    "#12345678",
    "123456",
    "#gg0000",
    " #123456",
    "#123456 ",
    "#123456\n",
    "#123456\r\n",
    "rgb(0,0,0)",
    null,
    undefined,
    123456,
  ])("两个颜色位置都拒绝非法输入 %s，即使比例处于端点", (value) => {
    expect(() => Reflect.apply(mixRgbColor, undefined, [value, "#ffffff", 1])).toThrow(TypeError);
    expect(() => Reflect.apply(mixRgbColor, undefined, ["#ffffff", value, 0])).toThrow(TypeError);
  });

  it.each([NaN, Infinity, -Infinity, "0.5", null, undefined])("拒绝非法比例 %s", (amount) => {
    expect(() => Reflect.apply(mixRgbColor, undefined, ["#000000", "#ffffff", amount])).toThrow(
      TypeError,
    );
  });

  it.each([-0.01, 1.01])("比例越界 %s 抛出 RangeError 而非截断", (amount) => {
    expect(() => mixRgbColor("#000000", "#ffffff", amount)).toThrow(RangeError);
  });
});
