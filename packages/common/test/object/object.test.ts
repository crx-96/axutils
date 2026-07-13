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
      nested: { value: 1 },
      list: [] as Array<{ value: number }>,
      [symbolKey]: { enabled: true },
    };
    source.list.length = 2;
    source.list[1] = { value: 2 };
    Object.defineProperty(source, "hidden", {
      value: "not copied",
      enumerable: false,
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
      regexp,
      map: new Map([[mapKey, mapValue]]),
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
      value: { safe: true },
      enumerable: true,
      configurable: true,
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
});
