import { afterEach, describe, expect, it, vi } from "vitest";
import * as NodeEntry from "../../../src/node/index";
import { StorageUtils as StorageUtilsFromEntry } from "../../../src/node/index";
import { StorageUtils } from "../../../src/node/object/storage";

afterEach(() => {
  vi.useRealTimers();
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
    const storage = new StorageUtils({ prefix: "storage-expired-node-", expired: 10 });

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
      prefix: "storage-key-node-first-",
      key: (key) => {
        handledKeys.push(key);
        return `hash:${key}`;
      },
    });
    const second = new StorageUtils({
      prefix: "storage-key-node-second-",
      key: (key) => `hash:${key}`,
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
      prefix: "storage-safe-node-",
      key: () => {
        throw new Error("key failed");
      },
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
});
