import { describe, expect, it } from "vitest";
import * as CommonEntry from "../../src/index";
import {
  JsonCircularReferenceError,
  jsonParse,
  jsonParseSafe,
  jsonStringify,
  jsonStringifySafe,
} from "../../src/object/json";

describe("object/json", () => {
  it("基本序列化", () => {
    expect(jsonStringify({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
    expect(jsonStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(jsonStringify("hello")).toBe('"hello"');
    expect(jsonStringify(42)).toBe("42");
    expect(jsonStringify(true)).toBe("true");
    expect(jsonStringify(false)).toBe("false");
    expect(jsonStringify(null)).toBe("null");
    // 空对象、空数组
    expect(jsonStringify({})).toBe("{}");
    expect(jsonStringify([])).toBe("[]");
  });

  it("FastPath：无配置时与原生 JSON.stringify 结果一致", () => {
    const data = { a: 1, b: [2, 3], c: { d: "x" } };
    expect(jsonStringify(data)).toBe(JSON.stringify(data));
    const nested = { a: { b: { c: 1 } }, arr: [1, [2, [3]]] };
    expect(jsonStringify(nested)).toBe(JSON.stringify(nested));
  });

  it("sortKeys 升序", () => {
    const data = { c: 3, a: 1, b: 2 };
    expect(jsonStringify(data, { sortKeys: true })).toBe('{"a":1,"b":2,"c":3}');
    expect(jsonStringify(data, { sortKeys: "asc" })).toBe('{"a":1,"b":2,"c":3}');
  });

  it("sortKeys 降序", () => {
    const data = { a: 1, b: 2, c: 3 };
    expect(jsonStringify(data, { sortKeys: "desc" })).toBe('{"c":3,"b":2,"a":1}');
  });

  it("sortKeys 自定义比较函数", () => {
    const data = { aaa: 1, a: 2, aa: 3 };
    const byLengthDesc = (a: string, b: string): number => b.length - a.length;
    expect(jsonStringify(data, { sortKeys: byLengthDesc })).toBe('{"aaa":1,"aa":3,"a":2}');
  });

  it("sortKeys 递归到嵌套对象", () => {
    const data = { z: 1, a: { z: 2, a: 3 } };
    expect(jsonStringify(data, { sortKeys: true })).toBe('{"a":{"a":3,"z":2},"z":1}');
  });

  it("sortKeys 不影响数组元素顺序", () => {
    const data = { items: [3, 1, 2] };
    expect(jsonStringify(data, { sortKeys: true })).toBe('{"items":[3,1,2]}');
  });

  it("sortKeys false 保持原顺序", () => {
    const data = { c: 3, a: 1, b: 2 };
    expect(jsonStringify(data, { sortKeys: false })).toBe('{"c":3,"a":1,"b":2}');
  });

  it("filterNullish 过滤 null 和 undefined 字段", () => {
    const data = { "": null, a: 1, b: null, c: undefined, d: "x" };
    expect(jsonStringify(data, { filterNullish: true })).toBe('{"a":1,"d":"x"}');
  });

  it("filterNullish 不过滤根值", () => {
    expect(jsonStringify(null, { filterNullish: true })).toBe("null");
    expect(jsonStringify(undefined, { filterNullish: true })).toBeUndefined();
  });

  it("filterNullish 不影响数组中的 null 和 undefined", () => {
    const data = { arr: [1, null, undefined, 3] };
    expect(jsonStringify(data, { filterNullish: true })).toBe('{"arr":[1,null,null,3]}');
  });

  it("filterNullish 递归到嵌套对象", () => {
    const data = { a: { b: null, c: 1 }, d: null };
    expect(jsonStringify(data, { filterNullish: true })).toBe('{"a":{"c":1}}');
  });

  it("space 缩进格式化", () => {
    const data = { a: 1, b: [2, 3] };
    expect(jsonStringify(data, { space: 2 })).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it("space 字符串缩进", () => {
    const data = { a: 1 };
    expect(jsonStringify(data, { space: "\t" })).toBe('{\n\t"a": 1\n}');
  });

  it("space 与排序组合", () => {
    const data = { b: 2, a: 1 };
    expect(jsonStringify(data, { sortKeys: true, space: 2 })).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("循环引用默认抛错", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    // 无配置时走 FastPath，原生 JSON.stringify 抛 TypeError
    expect(() => jsonStringify(obj)).toThrow(TypeError);
    expect(() => jsonStringify(obj)).toThrow(/circular/i);
    // 显式配置 onCycle: "throw" 时走配置化路径，抛 JsonCircularReferenceError
    expect(() => jsonStringify(obj, { onCycle: "throw" })).toThrow(JsonCircularReferenceError);
    expect(() => jsonStringify(obj, { onCycle: "throw" })).toThrow(/循环引用/);
  });

  it("循环引用 skip 用 null 替代", () => {
    const obj: Record<string, unknown> = { a: 1, b: "x" };
    obj.self = obj;
    const result = jsonStringify(obj, { onCycle: "skip" });
    // safe-stable-stringify 的 skip 语义：循环引用字段值替换为 null
    expect(result).toBe('{"a":1,"b":"x","self":null}');
  });

  it("循环引用数组 skip 用 null 占位", () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    const result = jsonStringify(arr, { onCycle: "skip" });
    expect(result).toBe("[1,2,null]");
  });

  it("非循环的相同对象引用不误判", () => {
    const shared = { x: 1 };
    const data = { a: shared, b: shared };
    expect(jsonStringify(data)).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it("基本反序列化", () => {
    expect(jsonParse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
    expect(jsonParse("[1,2,3]")).toEqual([1, 2, 3]);
    expect(jsonParse('"hello"')).toBe("hello");
    expect(jsonParse("42")).toBe(42);
    expect(jsonParse("true")).toBe(true);
    expect(jsonParse("null")).toBe(null);
  });

  it("FastPath：无配置时与原生 JSON.parse 结果一致", () => {
    const text = '{"a":1,"b":[2,3],"c":{"d":"x"}}';
    expect(jsonParse(text)).toEqual(JSON.parse(text));
  });

  it("反序列化 sortKeys", () => {
    const text = '{"c":3,"a":1,"b":2}';
    const result = jsonParse<Record<string, unknown>>(text, { sortKeys: true });
    expect(Object.keys(result)).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("反序列化 sortKeys 递归到嵌套对象", () => {
    const text = '{"z":1,"a":{"z":2,"a":3}}';
    const result = jsonParse<Record<string, unknown>>(text, { sortKeys: true });
    expect(Object.keys(result)).toEqual(["a", "z"]);
    expect(Object.keys(result.a as Record<string, unknown>)).toEqual(["a", "z"]);
  });

  it("反序列化 filterNullish", () => {
    const text = '{"a":1,"b":null,"c":"x"}';
    const result = jsonParse<Record<string, unknown>>(text, { filterNullish: true });
    expect(result).toEqual({ a: 1, c: "x" });
  });

  it("反序列化不合法 JSON 抛 SyntaxError", () => {
    expect(() => jsonParse("{invalid}")).toThrow(SyntaxError);
  });

  it("反序列化泛型类型推断", () => {
    const result = jsonParse<{ a: number }>('{"a":1}');
    expect(result.a).toBe(1);
  });

  it("Date 序列化与原生一致", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    expect(jsonStringify({ date })).toBe(JSON.stringify({ date }));
  });

  it("BigInt 行为：FastPath 抛错，配置化路径序列化为数字", () => {
    // FastPath（无配置）走原生 JSON.stringify，遇到 BigInt 抛 TypeError
    expect(() => jsonStringify({ big: 1n })).toThrow(TypeError);
    // 仅传 space 仍走 FastPath（space 不触发配置化路径），同样抛 TypeError
    expect(() => jsonStringify({ big: 1n }, { space: 2 })).toThrow(TypeError);
    // 配置化路径（传入 sortKeys 等非默认配置）底层 safe-stable-stringify 将 BigInt 序列化为数字
    expect(jsonStringify({ big: 1n }, { sortKeys: true })).toBe('{"big":1}');
    expect(jsonStringify({ big: 1n }, { sortKeys: true, space: 2 })).toBe('{\n  "big": 1\n}');
  });

  it("空对象所有字段被过滤后输出空对象", () => {
    const data = { a: null, b: undefined };
    expect(jsonStringify(data, { filterNullish: true })).toBe("{}");
  });

  it("主入口不导出 JSON API，避免强制加载 optional peer", () => {
    expect(Object.keys(CommonEntry)).not.toContain("jsonStringify");
    expect(Object.keys(CommonEntry)).not.toContain("jsonParse");
    expect(Object.keys(CommonEntry)).not.toContain("JsonCircularReferenceError");
  });

  it("jsonStringifySafe 正常输入返回与 jsonStringify 一致", () => {
    const data = { a: 1, b: "x" };
    expect(jsonStringifySafe(data)).toBe(jsonStringify(data));
    expect(jsonStringifySafe(data, { sortKeys: true })).toBe(
      jsonStringify(data, { sortKeys: true }),
    );
    expect(jsonStringifySafe(null)).toBe("null");
    expect(jsonStringifySafe([1, 2, 3])).toBe("[1,2,3]");
  });

  it("jsonStringifySafe 循环引用返回 null", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    // FastPath 原生抛 TypeError
    expect(jsonStringifySafe(obj)).toBeNull();
    // 配置化路径抛 JsonCircularReferenceError
    expect(jsonStringifySafe(obj, { onCycle: "throw" })).toBeNull();
  });

  it("jsonStringifySafe 配合 onCycle skip 不抛错正常返回", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(jsonStringifySafe(obj, { onCycle: "skip" })).toBe('{"a":1,"self":null}');
  });

  it("jsonParseSafe 正常输入返回与 jsonParse 一致", () => {
    expect(jsonParseSafe('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
    expect(jsonParseSafe("[1,2,3]")).toEqual([1, 2, 3]);
    expect(jsonParseSafe('"hello"')).toBe("hello");
    expect(jsonParseSafe("42")).toBe(42);
    expect(jsonParseSafe("true")).toBe(true);
    expect(jsonParseSafe("null")).toBeNull();
    // 合法 JSON 原文就是 null，返回 null 不是错误
    const result = jsonParseSafe<Record<string, number>>('{"a":1}', { sortKeys: true });
    expect(result).toEqual({ a: 1 });
  });

  it("jsonParseSafe 非法 JSON 返回 null", () => {
    expect(jsonParseSafe("{invalid}")).toBeNull();
    expect(jsonParseSafe("")).toBeNull();
    expect(jsonParseSafe("undefined")).toBeNull();
    expect(jsonParseSafe("[1,2,")).toBeNull();
  });

  it("jsonParseSafe 泛型类型推断", () => {
    const result = jsonParseSafe<{ a: number }>('{"a":1}');
    expect(result?.a).toBe(1);
  });
});
