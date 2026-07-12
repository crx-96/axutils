import { afterEach, describe, expect, it, vi } from "vitest";
import * as CommonEntry from "../../src/index";
import { StorageUtils as StorageUtilsFromEntry } from "../../src/index";
import { StorageUtils } from "../../src/object/storage";

class TestStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends TestStorage {
  constructor(private readonly operation: "get" | "remove" | "remove-noop" | "set") {
    super();
  }

  override getItem(key: string): string | null {
    if (this.operation === "get") {
      throw new Error("get failed");
    }
    return super.getItem(key);
  }

  override removeItem(key: string): void {
    if (this.operation === "remove") {
      throw new Error("remove failed");
    }
    if (this.operation === "remove-noop") {
      return;
    }
    super.removeItem(key);
  }

  override setItem(key: string, value: string): void {
    if (this.operation === "set") {
      throw new Error("set failed");
    }
    super.setItem(key, value);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("object/storage", () => {
  it("从主入口导出同一个通用 StorageUtils 类", () => {
    expect(StorageUtilsFromEntry).toBe(StorageUtils);
  });

  it("主入口不导出 storageUtils 单例", () => {
    expect("storageUtils" in CommonEntry).toBe(false);
  });

  it("在 Node 中没有 Web Storage 时使用内存降级并完成读写", () => {
    const storage = new StorageUtils({ prefix: "storage-red-common-" });

    storage.set("user", { id: 1 });

    expect(storage.get<{ id: number }>("user")).toEqual({ id: 1 });
  });

  it("默认使用 localStorage，并用 type=session 隔离 sessionStorage", () => {
    const localStore = new TestStorage();
    const sessionStore = new TestStorage();
    vi.stubGlobal("localStorage", localStore);
    vi.stubGlobal("sessionStorage", sessionStore);

    new StorageUtils({ prefix: "storage-type-" }).set("key", "local");
    new StorageUtils({ prefix: "storage-type-", type: "session" }).set("key", "session");

    expect(localStore.getItem("storage-type-key")).not.toBeNull();
    expect(sessionStore.getItem("storage-type-key")).not.toBeNull();
    expect(new StorageUtils({ prefix: "storage-type-" }).get("key")).toBe("local");
    expect(new StorageUtils({ prefix: "storage-type-", type: "session" }).get("key")).toBe(
      "session",
    );
  });

  it("按秒计算默认过期时间，并允许 set 单独覆盖过期时间", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const storage = new StorageUtils({ prefix: "storage-expired-", expired: 10 });

    storage.set("default", "value");
    storage.set("override", "value", 1);
    vi.advanceTimersByTime(1000);

    expect(storage.get("default")).toBe("value");
    expect(storage.get("override")).toBeNull();

    vi.advanceTimersByTime(9000);
    expect(storage.get("default")).toBeNull();
  });

  it("把 prefix 加到 key 前再交给 key 处理函数，并缓存处理结果", () => {
    const store = new TestStorage();
    const handledKeys: string[] = [];
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils({
      prefix: "storage-key-",
      key: (key) => {
        handledKeys.push(key);
        return `md5:${key}`;
      },
    });

    storage.set("user", { id: 1 });
    expect(store.getItem("md5:storage-key-user")).not.toBeNull();
    expect(storage.get("user")).toEqual({ id: 1 });
    expect(handledKeys).toEqual(["storage-key-user"]);
  });

  it("clear 只删除当前 prefix 的条目，即使 key 已被处理函数转换", () => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);
    const first = new StorageUtils({
      prefix: "storage-clear-first-",
      key: (key) => `hash:${key}`,
    });
    const second = new StorageUtils({
      prefix: "storage-clear-second-",
      key: (key) => `hash:${key}`,
    });

    first.set("first", 1);
    second.set("second", 2);
    first.clear();

    expect(first.get("first")).toBeNull();
    expect(second.get("second")).toBe(2);
  });

  it("get 遇到非 StorageUtils 数据时返回 null 且不删除原值", () => {
    const store = new TestStorage();
    store.setItem("foreign-key", "plain business data");
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils();

    expect(storage.get("foreign-key")).toBeNull();
    expect(store.getItem("foreign-key")).toBe("plain business data");
  });

  it("get 不读取或删除转换后 key 相同的其他 prefix 记录", () => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);
    const first = new StorageUtils({
      prefix: "storage-collision-first-",
      key: () => "storage-collision",
    });
    const second = new StorageUtils({
      prefix: "storage-collision-second-",
      key: () => "storage-collision",
    });

    first.set("key", "first");

    expect(second.get("key")).toBeNull();
    expect(first.get("key")).toBe("first");
  });

  it.each([
    ["根值 undefined", undefined],
    ["根值函数", () => undefined],
    ["根值 Symbol", Symbol("root")],
    ["对象字段 undefined", { invalid: undefined }],
    ["对象字段函数", { invalid: () => undefined }],
    ["对象字段 Symbol", { invalid: Symbol("object") }],
    ["数组元素 undefined", [undefined]],
    ["数组元素函数", [() => undefined]],
    ["数组元素 Symbol", [Symbol("array")]],
  ])("set 拒绝 JSON 会静默丢失的%s", (_label, value) => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils({ prefix: "storage-invalid-json-" });

    expect(() => storage.set("unsafe", value)).toThrow(TypeError);
    expect(storage.setSafe("safe", value)).toBe(false);
    expect(store.getItem("storage-invalid-json-unsafe")).toBeNull();
    expect(store.getItem("storage-invalid-json-safe")).toBeNull();
  });

  it.each([
    "get",
    "set",
    "remove",
    "remove-noop",
  ] as const)("构造时探测到 Web Storage 的 %s 操作失败后降级到内存 Map", (operation) => {
    vi.stubGlobal("localStorage", new ThrowingStorage(operation));
    const storage = new StorageUtils({ prefix: `storage-probe-${operation}-` });

    storage.set("key", "value");
    expect(storage.get("key")).toBe("value");
    storage.remove("key");
    expect(storage.get("key")).toBeNull();
  });

  it("Web Storage 探测成功后不残留临时 key", () => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);

    new StorageUtils();

    expect(store.length).toBe(0);
  });

  it("localStorage 与 sessionStorage 探测失败后的内存空间保持隔离", () => {
    vi.stubGlobal("localStorage", new ThrowingStorage("set"));
    vi.stubGlobal("sessionStorage", new ThrowingStorage("set"));
    const local = new StorageUtils({ prefix: "storage-probe-isolation-" });
    const session = new StorageUtils({
      prefix: "storage-probe-isolation-",
      type: "session",
    });

    local.set("key", "local");
    session.set("key", "session");

    expect(local.get("key")).toBe("local");
    expect(session.get("key")).toBe("session");
  });

  it.each([
    Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER,
  ])("过期时间 %s 的计算结果越界时 set 抛 RangeError 且 setSafe 返回 false", (expired) => {
    const storage = new StorageUtils({ prefix: "storage-expired-overflow-" });

    expect(() => storage.set("unsafe", "value", expired)).toThrow(RangeError);
    expect(storage.setSafe("safe", "value", expired)).toBe(false);
    expect(storage.get("unsafe")).toBeNull();
    expect(storage.get("safe")).toBeNull();
  });

  it("四个 safe 方法吞掉探测成功后出现的底层存储异常", () => {
    const values = new Map<string, string>();
    let shouldFail = false;
    const brokenStorage = {
      get length(): number {
        if (shouldFail) {
          throw new Error("length failed");
        }
        return values.size;
      },
      getItem(key: string): string | null {
        if (shouldFail) {
          throw new Error("get failed");
        }
        return values.get(key) ?? null;
      },
      key(index: number): string | null {
        if (shouldFail) {
          throw new Error("key failed");
        }
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string): void {
        if (shouldFail) {
          throw new Error("remove failed");
        }
        values.delete(key);
      },
      setItem(key: string, value: string): void {
        if (shouldFail) {
          throw new Error("set failed");
        }
        values.set(key, value);
      },
    };
    vi.stubGlobal("localStorage", brokenStorage);
    const storage = new StorageUtils();
    shouldFail = true;

    expect(storage.getSafe("key")).toBeNull();
    expect(storage.setSafe("key", "value")).toBe(false);
    expect(storage.removeSafe("key")).toBe(false);
    expect(storage.clearSafe()).toBe(false);
  });

  it("setSafe 在 JSON 无法序列化时返回 false", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const storage = new StorageUtils({ prefix: "storage-safe-json-" });

    expect(storage.setSafe("cyclic", cyclic)).toBe(false);
    expect(storage.get("cyclic")).toBeNull();
  });
});
