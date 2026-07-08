import { describe, expect, it } from "vitest";

import {
  isArray as isArrayFromType,
  isArrowFunction as isArrowFunctionFromType,
  isAsyncArrowFunction as isAsyncArrowFunctionFromType,
  isAsyncFunction as isAsyncFunctionFromType,
  isBoolean as isBooleanFromType,
  isDate as isDateFromType,
  isFunction as isFunctionFromType,
  isNil as isNilFromType,
  isNormalFunction as isNormalFunctionFromType,
  isNumber as isNumberFromType,
  isObject as isObjectFromType,
  isPlainObject as isPlainObjectFromType,
  isString as isStringFromType,
} from "../../src/check/type";
import {
  isArray,
  isArrowFunction,
  isAsyncArrowFunction,
  isAsyncFunction,
  isBoolean,
  isDate,
  isFunction,
  isNil,
  isNormalFunction,
  isNumber,
  isObject,
  isPlainObject,
  isString,
} from "../../src/index";

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

  it("判断 null 或 undefined", () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    // 0、空串、false 等“假值”不视为 nil
    expect(isNil(0)).toBe(false);
    expect(isNil("")).toBe(false);
    expect(isNil(false)).toBe(false);
    expect(isNil(NaN)).toBe(false);
    expect(isNil({})).toBe(false);
  });

  it("判断函数", () => {
    expect(isFunction(() => {})).toBe(true);
    // class 声明的 typeof 结果也是 "function"
    expect(isFunction(class {})).toBe(true);
    // async 函数
    expect(isFunction(async () => {})).toBe(true);
    // 生成器函数
    expect(isFunction(function* () {})).toBe(true);
    // 非函数
    expect(isFunction({})).toBe(false);
    expect(isFunction(null)).toBe(false);
    expect(isFunction("() => {}")).toBe(false);
  });

  it("判断异步函数", () => {
    // async 箭头函数和 async 声明函数都视为 async 函数
    expect(isAsyncFunction(async () => {})).toBe(true);
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 async function 声明语法覆盖该写法
    expect(isAsyncFunction(async function () {})).toBe(true);
    // 普通函数、生成器函数、class 都不是 async 函数
    expect(isAsyncFunction(() => {})).toBe(false);
    expect(isAsyncFunction(function* () {})).toBe(false);
    expect(isAsyncFunction(class {})).toBe(false);
    // 异步生成器函数返回 AsyncGenerator 而非 Promise，不视为 async 函数
    expect(isAsyncFunction(async function* () {})).toBe(false);
    // Promise 对象本身不是 async 函数
    expect(isAsyncFunction(Promise.resolve())).toBe(false);
    // bound 后的 async 函数仍能被正确识别（原型链继承 AsyncFunction.prototype 的 Symbol.toStringTag）
    expect(isAsyncFunction((async () => {}).bind(null))).toBe(true);
    // 非函数
    expect(isAsyncFunction({})).toBe(false);
    expect(isAsyncFunction(null)).toBe(false);
    expect(isAsyncFunction("async () => {}")).toBe(false);
  });

  it("判断普通函数", () => {
    // function 声明与表达式都视为普通函数
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 function 声明语法覆盖该写法
    expect(isNormalFunction(function () {})).toBe(true);
    // 具名函数表达式同样视为普通函数
    expect(isNormalFunction(function named() {})).toBe(true);
    // 对象方法简写源码形如 f() {}，既非 class 也非箭头，视为普通函数
    expect(isNormalFunction({ f() {} }.f)).toBe(true);
    // 箭头函数、async 函数、生成器函数、class 均不是普通函数
    expect(isNormalFunction(() => {})).toBe(false);
    expect(isNormalFunction(async () => {})).toBe(false);
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 async function 声明语法
    expect(isNormalFunction(async function () {})).toBe(false);
    expect(isNormalFunction(function* () {})).toBe(false);
    expect(isNormalFunction(async function* () {})).toBe(false);
    expect(isNormalFunction(class {})).toBe(false);
    // bound 包装后 toString 返回 [native code]，源码特征丢失，无法识别
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 function 声明语法以测试 bound 后的行为
    expect(isNormalFunction(function () {}.bind(null))).toBe(false);
    // native 函数同样无法识别
    expect(isNormalFunction(parseInt)).toBe(false);
    // 非函数
    expect(isNormalFunction({})).toBe(false);
    expect(isNormalFunction(null)).toBe(false);
    expect(isNormalFunction("function () {}")).toBe(false);
  });

  it("判断箭头函数", () => {
    // 同步箭头与 async 箭头都视为箭头函数
    expect(isArrowFunction(() => {})).toBe(true);
    expect(isArrowFunction(async () => {})).toBe(true);
    // 带参数、带默认值、解构参数的箭头函数
    expect(isArrowFunction((a: number) => a)).toBe(true);
    expect(isArrowFunction((a = 1) => a)).toBe(true);
    expect(isArrowFunction((a = (() => 1)()) => a)).toBe(true);
    expect(isArrowFunction(({ a }: { a: number }) => a)).toBe(true);
    expect(isArrowFunction(({ a = Math.max(1, 2) }: { a?: number }) => a)).toBe(true);
    // 普通函数、生成器函数、class 均不是箭头函数
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 function 声明语法
    expect(isArrowFunction(function () {})).toBe(false);
    expect(isArrowFunction(function* () {})).toBe(false);
    expect(isArrowFunction(class {})).toBe(false);
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 async function 声明语法
    expect(isArrowFunction(async function () {})).toBe(false);
    // bound 包装后 toString 返回 [native code]，不匹配箭头语法
    expect(isArrowFunction((() => {}).bind(null))).toBe(false);
    // native 函数
    expect(isArrowFunction(parseInt)).toBe(false);
    // 非函数
    expect(isArrowFunction({})).toBe(false);
    expect(isArrowFunction(null)).toBe(false);
    expect(isArrowFunction("() => {}")).toBe(false);
  });

  it("判断异步箭头函数", () => {
    // async 箭头函数
    expect(isAsyncArrowFunction(async () => {})).toBe(true);
    expect(isAsyncArrowFunction(async (a: number) => a)).toBe(true);
    // async function 声明不是 async 箭头
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 async function 声明语法
    expect(isAsyncArrowFunction(async function () {})).toBe(false);
    // 同步箭头、普通函数、生成器函数、class 均不是 async 箭头
    expect(isAsyncArrowFunction(() => {})).toBe(false);
    // biome-ignore lint/complexity/useArrowFunction: 刻意使用 function 声明语法
    expect(isAsyncArrowFunction(function () {})).toBe(false);
    expect(isAsyncArrowFunction(function* () {})).toBe(false);
    expect(isAsyncArrowFunction(async function* () {})).toBe(false);
    expect(isAsyncArrowFunction(class {})).toBe(false);
    // bound 包装后 toString 返回 [native code]，无法识别
    expect(isAsyncArrowFunction((async () => {}).bind(null))).toBe(false);
    // 非函数
    expect(isAsyncArrowFunction({})).toBe(false);
    expect(isAsyncArrowFunction(null)).toBe(false);
    expect(isAsyncArrowFunction("async () => {}")).toBe(false);
  });

  it("判断有效日期", () => {
    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date("2024-01-01"))).toBe(true);
    // Invalid Date 虽为 Date 实例但时间戳为 NaN
    expect(isDate(new Date("invalid"))).toBe(false);
    // 日期字符串和时间戳不是 Date 实例
    expect(isDate("2024-01-01")).toBe(false);
    expect(isDate(Date.now())).toBe(false);
    expect(isDate(null)).toBe(false);
  });

  it("判断字面量对象", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    // Object.create(null) 原型为 null，视为字面量对象
    expect(isPlainObject(Object.create(null))).toBe(true);
    // 数组、null、原始值
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    // 包装对象、内置对象、class 实例均不通过
    expect(isPlainObject(new String("x"))).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(/x/)).toBe(false);
    // 自定义 class 实例
    expect(isPlainObject(new (class {})())).toBe(false);
  });

  it("主入口导出与子模块导出保持一致", () => {
    expect(isNumber).toBe(isNumberFromType);
    expect(isString).toBe(isStringFromType);
    expect(isBoolean).toBe(isBooleanFromType);
    expect(isArray).toBe(isArrayFromType);
    expect(isObject).toBe(isObjectFromType);
    expect(isNil).toBe(isNilFromType);
    expect(isFunction).toBe(isFunctionFromType);
    expect(isAsyncFunction).toBe(isAsyncFunctionFromType);
    expect(isNormalFunction).toBe(isNormalFunctionFromType);
    expect(isArrowFunction).toBe(isArrowFunctionFromType);
    expect(isAsyncArrowFunction).toBe(isAsyncArrowFunctionFromType);
    expect(isDate).toBe(isDateFromType);
    expect(isPlainObject).toBe(isPlainObjectFromType);
  });
});
