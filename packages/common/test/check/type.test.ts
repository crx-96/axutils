import { describe, expect, it } from "vitest";

import {
  isArray as isArrayFromType,
  isBoolean as isBooleanFromType,
  isNumber as isNumberFromType,
  isObject as isObjectFromType,
  isString as isStringFromType,
} from "../../src/check/type";
import { isArray, isBoolean, isNumber, isObject, isString } from "../../src/index";

describe("type", () => {
  it("判断数字", () => {
    expect(isNumber(1)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber("1")).toBe(false);
    // 边界值
    expect(isNumber(Infinity)).toBe(true);
    expect(isNumber(-0)).toBe(true);
    expect(isNumber(undefined)).toBe(false);
    expect(isNumber(null)).toBe(false);
  });

  it("判断字符串", () => {
    expect(isString("axutils")).toBe(true);
    expect(isString(1)).toBe(false);
    // 空串为合法字符串
    expect(isString("")).toBe(true);
    // 包装对象不是字符串原始值
    expect(isString(new String("x"))).toBe(false);
  });

  it("判断布尔值", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean("true")).toBe(false);
    // 包装对象不是布尔原始值
    expect(isBoolean(new Boolean(true))).toBe(false);
  });

  it("判断数组", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2])).toBe(true);
    expect(isArray({ length: 0 })).toBe(false);
  });

  it("判断对象", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject("x")).toBe(false);
    // 包装对象、Object.create(null) 也会通过（非 null 非数组的 object）
    expect(isObject(new String("x"))).toBe(true);
    expect(isObject(Object.create(null))).toBe(true);
  });

  it("主入口导出与子模块导出保持一致", () => {
    expect(isNumber).toBe(isNumberFromType);
    expect(isString).toBe(isStringFromType);
    expect(isBoolean).toBe(isBooleanFromType);
    expect(isArray).toBe(isArrayFromType);
    expect(isObject).toBe(isObjectFromType);
  });
});
