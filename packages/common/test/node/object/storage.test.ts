import { afterEach, describe, expect, it, vi } from "vitest";
import * as NodeEntry from "../../../src/node/index";
import { StorageUtils as StorageUtilsFromEntry } from "../../../src/node/index";
import { StorageUtils } from "../../../src/node/object/storage";
import { StorageUtils as JsonStorageUtils } from "../../../src/object/storage.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("node/object/storage", () => {
  it("从 Node 主入口导出同一个 StorageUtils 类", () => {
    expect(StorageUtilsFromEntry).toBe(StorageUtils);
  });

  it("Node 主入口不导出 storageUtils 单例", () => {
    expect("storageUtils" in NodeEntry).toBe(false);
  });

  it("使用进程内 Map 完成读写", () => {
    const storage = new StorageUtils({ prefix: "storage-red-node-" });
    const value = { id: 1 };

    storage.set("user", value);

    expect(storage.get("user")).toBe(value);
  });

  it("支持默认过期时间、单次覆盖和过期后自动删除", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const storage = new StorageUtils({ expired: 10, prefix: "storage-expired-node-" });

    storage.set("default", "value");
    storage.set("override", "value", 1);
    vi.advanceTimersByTime(1000);

    expect(storage.get("default")).toBe("value");
    expect(storage.get("override")).toBeNull();

    vi.advanceTimersByTime(9000);
    expect(storage.get("default")).toBeNull();
  });

  it("把 prefix 加到 key 前再调用 key 处理函数，并按 prefix 清理", () => {
    const handledKeys: string[] = [];
    const first = new StorageUtils({
      key: (key) => {
        handledKeys.push(key);
        return `hash:${key}`;
      },
      prefix: "storage-key-node-first-",
    });
    const second = new StorageUtils({
      key: (key) => `hash:${key}`,
      prefix: "storage-key-node-second-",
    });

    first.set("first", 1);
    second.set("second", 2);
    expect(first.get("first")).toBe(1);
    expect(handledKeys).toEqual(["storage-key-node-first-first"]);

    first.clear();
    expect(first.get("first")).toBeNull();
    expect(second.get("second")).toBe(2);
  });

  it("safe 方法在 key 处理函数抛错时返回约定结果", () => {
    const storage = new StorageUtils({
      key: () => {
        throw new Error("key failed");
      },
      prefix: "storage-safe-node-",
    });

    expect(storage.getSafe("key")).toBeNull();
    expect(storage.setSafe("key", "value")).toBe(false);
    expect(storage.removeSafe("key")).toBe(false);
    expect(storage.clearSafe()).toBe(true);
  });

  it("Map 直接保存值引用，支持循环对象", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const storage = new StorageUtils({ prefix: "storage-cyclic-node-" });

    storage.set("cyclic", cyclic);

    expect(storage.get("cyclic")).toBe(cyclic);
  });

  it.each([
    Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER,
  ])("过期时间 %s 的计算结果越界时 set 抛 RangeError 且 setSafe 返回 false", (expired) => {
    const storage = new StorageUtils({ prefix: "storage-expired-overflow-node-" });

    expect(() => storage.set("unsafe", "value", expired)).toThrow(RangeError);
    expect(storage.setSafe("safe", "value", expired)).toBe(false);
    expect(storage.get("unsafe")).toBeNull();
    expect(storage.get("safe")).toBeNull();
  });

  it("Node 保持值引用，通用 JSON 存储在写入和每次读取时形成独立值", () => {
    vi.stubGlobal("localStorage", undefined);
    const node = new StorageUtils({ prefix: "storage-value-semantics-" });
    const json = new JsonStorageUtils({ prefix: "storage-value-semantics-" });
    const input = { nested: { value: 1 } };

    try {
      node.set("key", input);
      json.set("key", input);
      input.nested.value = 2;

      expect(node.get("key")).toBe(input);
      expect(node.get<typeof input>("key")?.nested.value).toBe(2);
      const jsonValue = json.get<typeof input>("key");
      expect(jsonValue).toEqual({ nested: { value: 1 } });
      expect(jsonValue).not.toBe(input);
      if (jsonValue === null) throw new Error("JSON 缓存应存在");
      jsonValue.nested.value = 3;
      expect(json.get("key")).toEqual({ nested: { value: 1 } });
    } finally {
      node.clear();
      json.clear();
    }
  });

  it("同一命名空间共享大集合，clear 只删除所属记录", () => {
    const storage = new StorageUtils({ prefix: "storage-large-node-" });
    const sameNamespace = new StorageUtils({ prefix: "storage-large-node-" });
    const other = new StorageUtils({ prefix: "storage-large-node-other-" });

    try {
      for (let index = 0; index < 1000; index += 1) storage.set(String(index), index);
      other.set("key", "other namespace");
      expect(sameNamespace.get("999")).toBe(999);
      sameNamespace.clear();

      for (let index = 0; index < 1000; index += 1) expect(storage.get(String(index))).toBeNull();
      expect(other.get("key")).toBe("other namespace");
    } finally {
      storage.clear();
      other.clear();
    }
  });

  it("有状态 key 处理函数在删除与清空后仍复用首次映射", () => {
    let sequence = 0;
    const handler = vi.fn((key: string) => `${++sequence}:${key}`);
    const storage = new StorageUtils({ key: handler, prefix: "storage-stable-node-" });

    try {
      storage.set("key", "first");
      expect(storage.get("key")).toBe("first");
      storage.remove("key");
      storage.set("key", "after remove");
      expect(storage.get("key")).toBe("after remove");
      storage.clear();
      storage.set("key", "after clear");
      expect(storage.get("key")).toBe("after clear");
      expect(handler.mock.calls).toEqual([["storage-stable-node-key"]]);
    } finally {
      storage.clear();
    }
  });

  it("转换后 key 相同的其他命名空间既不可读取也不会被 clear 删除", () => {
    const first = new StorageUtils({
      key: () => "collision",
      prefix: "storage-collision-node-first-",
    });
    const second = new StorageUtils({
      key: () => "collision",
      prefix: "storage-collision-node-second-",
    });

    try {
      first.set("key", "first value");
      expect(second.get("key")).toBeNull();
      second.clear();
      expect(first.get("key")).toBe("first value");
    } finally {
      first.clear();
      second.clear();
    }
  });
});
