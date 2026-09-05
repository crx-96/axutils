import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { deepClone as deepCloneFromEntry } from "../../src/index";
import { deepClone } from "../../src/object/object";

describe("object/object", () => {
  it("从主入口导出同一个方法", () => {
    expect(deepCloneFromEntry).toBe(deepClone);
  });

  it("复制嵌套对象、数组、空洞和可枚举 Symbol 属性", () => {
    const symbolKey = Symbol("metadata");
    const source = {
      list: [] as Array<{ value: number }>,
      nested: { value: 1 },
      [symbolKey]: { enabled: true },
    };
    source.list.length = 2;
    source.list[1] = { value: 2 };
    Object.defineProperty(source, "hidden", {
      enumerable: false,
      value: "not copied",
    });

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone.nested).not.toBe(source.nested);
    expect(clone.list).not.toBe(source.list);
    expect(0 in clone.list).toBe(false);
    expect(clone.list[1]).toEqual({ value: 2 });
    expect(clone[symbolKey]).not.toBe(source[symbolKey]);
    expect(Reflect.has(clone, "hidden")).toBe(false);

    clone.nested.value = 2;
    expect(source.nested.value).toBe(1);
  });

  it("复制 Date、RegExp、Map 和 Set 的内部值", () => {
    const date = new Date("2024-01-02T03:04:05.000Z");
    const regexp = /hello/giu;
    regexp.lastIndex = 2;
    const mapKey = { id: 1 };
    const mapValue = { name: "value" };
    const setValue = { id: 2 };
    const source = {
      date,
      map: new Map([[mapKey, mapValue]]),
      regexp,
      set: new Set([setValue]),
    };

    const clone = deepClone(source);
    const clonedMapEntry = [...clone.map.entries()][0];
    const clonedSetValue = [...clone.set][0];

    expect(clone.date).not.toBe(date);
    expect(clone.date.getTime()).toBe(date.getTime());
    expect(clone.regexp).not.toBe(regexp);
    expect(clone.regexp.source).toBe(regexp.source);
    expect(clone.regexp.flags).toBe(regexp.flags);
    expect(clone.regexp.lastIndex).toBe(regexp.lastIndex);
    expect(clonedMapEntry?.[0]).not.toBe(mapKey);
    expect(clonedMapEntry?.[1]).not.toBe(mapValue);
    expect(clonedSetValue).not.toBe(setValue);
    expect(clonedMapEntry).toEqual([{ id: 1 }, { name: "value" }]);
    expect(clonedSetValue).toEqual({ id: 2 });
  });

  it("复制来自其他 Realm 的普通对象和内建对象", () => {
    const context = createContext({});
    const source = runInContext(
      "({ plain: { value: 1 }, date: new Date(0), regexp: /x/g, map: new Map([[{ id: 1 }, { value: 2 }]]), set: new Set([{ id: 3 }]) })",
      context,
    ) as {
      plain: { value: number };
      date: Date;
      regexp: RegExp;
      map: Map<{ id: number }, { value: number }>;
      set: Set<{ id: number }>;
    };

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone.plain).not.toBe(source.plain);
    expect(clone.date).not.toBe(source.date);
    expect(clone.regexp).not.toBe(source.regexp);
    expect(clone.map).not.toBe(source.map);
    expect(clone.set).not.toBe(source.set);
    expect(clone.plain).toEqual({ value: 1 });
    expect(clone.date.getTime()).toBe(0);
    expect(clone.regexp.source).toBe("x");

    const sourceMapEntry = [...source.map.entries()][0];
    const cloneMapEntry = [...clone.map.entries()][0];
    expect(cloneMapEntry?.[0]).not.toBe(sourceMapEntry?.[0]);
    expect(cloneMapEntry?.[1]).not.toBe(sourceMapEntry?.[1]);

    const sourceSetValue = [...source.set][0];
    const cloneSetValue = [...clone.set][0];
    expect(cloneSetValue).not.toBe(sourceSetValue);
  });

  it("保持循环引用和共享引用关系", () => {
    const shared = { value: 1 };
    const source: Record<string, unknown> = {
      first: shared,
      second: shared,
    };
    source.self = source;

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone.first).toBe(clone.second);
    expect(clone.self).toBe(clone);
    expect(clone.first).not.toBe(shared);
  });

  it("保留 null 原型并安全复制 __proto__ 数据属性", () => {
    const source = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(source, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { safe: true },
      writable: true,
    });

    const clone = deepClone(source);

    expect(Object.getPrototypeOf(clone)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(clone, "__proto__")?.value).toEqual({ safe: true });
    const clonedProtoValue = Object.getOwnPropertyDescriptor(clone, "__proto__")?.value as object;
    expect(Object.getPrototypeOf(clonedProtoValue)).toBe(Object.prototype);
  });

  it("原样保留原始值、函数、class 实例和未支持的 TypedArray", () => {
    class Example {
      value = 1;
    }

    const fn = () => "same";
    const instance = new Example();
    const typedArray = new Uint8Array([1, 2, 3]);

    expect(deepClone(null)).toBeNull();
    expect(deepClone("value")).toBe("value");
    expect(deepClone(fn)).toBe(fn);
    expect(deepClone(instance)).toBe(instance);
    expect(deepClone(typedArray)).toBe(typedArray);
  });

  it("先冻结可枚举键，再按键顺序求值 getter", () => {
    const reads: string[] = [];
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "first", {
      enumerable: true,
      get: () => {
        reads.push("first");
        source.added = "late";
        Object.defineProperty(source, "second", { enumerable: false });
        return { value: 1 };
      },
    });
    Object.defineProperty(source, "second", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads.push("second");
        return { value: 2 };
      },
    });

    const clone = deepClone(source);

    expect(reads).toEqual(["first", "second"]);
    expect(Object.keys(clone)).toEqual(["first", "second"]);
    expect(clone).toEqual({ first: { value: 1 }, second: { value: 2 } });
    expect(Object.getOwnPropertyDescriptor(clone, "first")).toEqual({
      configurable: true,
      enumerable: true,
      value: { value: 1 },
      writable: true,
    });
  });

  it.each(["Date", "RegExp", "Map", "Set"])("伪造 %s 标签的普通对象仍按普通对象复制", (tag) => {
    const source = { [Symbol.toStringTag]: tag, nested: { value: 1 } };
    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone.nested).not.toBe(source.nested);
    expect(clone.nested).toEqual({ value: 1 });
    expect(clone[Symbol.toStringTag]).toBe(tag);
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
  });

  it("修改 Date 原型后仍根据内部槽复制时间值", () => {
    const source = new Date(1234);
    Object.setPrototypeOf(source, Object.prototype);

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone).toBeInstanceOf(Date);
    expect(clone.getTime()).toBe(1234);
  });

  it.each([
    { create: () => new Map([["key", "value"]]), name: "Map" },
    { create: () => new Set(["value"]), name: "Set" },
  ])("移除 $name 的可迭代原型后保持抛错语义", ({ create }) => {
    const source = create();
    Object.setPrototypeOf(source, Object.prototype);
    expect(() => deepClone(source)).toThrow(TypeError);
  });

  it("修改 RegExp 原型后仍复制原有可访问字段的结果", () => {
    const source = /original/gi;
    source.lastIndex = 3;
    Object.setPrototypeOf(source, Object.prototype);

    const clone = deepClone(source);

    // 原实现读取 source/flags 属性；移除原型后它们缺失，构造结果是空正则。
    expect(clone).toBeInstanceOf(RegExp);
    expect(clone.source).toBe("(?:)");
    expect(clone.flags).toBe("");
    expect(clone.lastIndex).toBe(3);
  });

  it("数组快路径保留空洞、Symbol、__proto__ 数据属性和循环共享引用", () => {
    const metadata = Symbol("metadata");
    const source: unknown[] = new Array(4);
    const shared = { value: 1 };
    source[1] = shared;
    source[2] = source;
    source[3] = shared;
    Object.defineProperty(source, metadata, { enumerable: true, value: shared });
    Object.defineProperty(source, "__proto__", { enumerable: true, value: shared });

    const clone = deepClone(source);

    expect(Array.isArray(clone)).toBe(true);
    expect(clone).toHaveLength(4);
    expect(0 in clone).toBe(false);
    expect(clone[1]).not.toBe(shared);
    expect(clone[1]).toBe(clone[3]);
    expect(clone[2]).toBe(clone);
    expect(Reflect.get(clone, metadata)).toBe(clone[1]);
    expect(Object.getOwnPropertyDescriptor(clone, "__proto__")?.value).toBe(clone[1]);
    expect(Object.getPrototypeOf(clone)).toBe(Array.prototype);
  });
});
