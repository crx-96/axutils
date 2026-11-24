import { runInNewContext } from "node:vm";
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

class PartiallyThrowingStorage extends TestStorage {
  failingKey: string | null = null;

  override getItem(key: string): string | null {
    if (key === this.failingKey) {
      throw new Error("partial get failed");
    }
    return super.getItem(key);
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

    expect(localStore.length).toBe(1);
    expect(sessionStore.length).toBe(1);
    expect(new StorageUtils({ prefix: "storage-type-" }).get("key")).toBe("local");
    expect(new StorageUtils({ prefix: "storage-type-", type: "session" }).get("key")).toBe(
      "session",
    );
  });

  it("按秒计算默认过期时间，并允许 set 单独覆盖过期时间", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const storage = new StorageUtils({ expired: 10, prefix: "storage-expired-" });

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
      key: (key) => {
        handledKeys.push(key);
        return `md5:${key}`;
      },
      prefix: "storage-key-",
    });

    storage.set("user", { id: 1 });
    expect(store.length).toBe(1);
    expect(storage.get("user")).toEqual({ id: 1 });
    expect(handledKeys).toEqual(["storage-key-user"]);
  });

  it("clear 只删除当前 prefix 的条目，即使 key 已被处理函数转换", () => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);
    const first = new StorageUtils({
      key: (key) => `hash:${key}`,
      prefix: "storage-clear-first-",
    });
    const second = new StorageUtils({
      key: (key) => `hash:${key}`,
      prefix: "storage-clear-second-",
    });

    first.set("first", 1);
    second.set("second", 2);
    first.clear();

    expect(first.get("first")).toBeNull();
    expect(second.get("second")).toBe(2);
  });

  it("clear 在部分 key 读取失败时保留已清理结果并抛出异常", () => {
    const store = new PartiallyThrowingStorage();
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils({ prefix: "storage-clear-partial-" });

    storage.set("first", 1);
    storage.set("second", 2);

    const failingKey = store.key(1);
    store.failingKey = failingKey;
    expect(() => storage.clear()).toThrow("partial get failed");
    expect(store.length).toBe(1);
    expect(store.key(0)).toBe(failingKey);
  });

  it("get 遇到非 StorageUtils 数据时返回 null 且不删除原值", () => {
    const store = new TestStorage();
    store.setItem("foreign-key", "plain business data");
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils();

    expect(storage.get("foreign-key")).toBeNull();
    expect(store.getItem("foreign-key")).toBe("plain business data");
  });

  it.each([
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":0}',
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":1e999,"data":"value"}',
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":-1e999,"data":"value"}',
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":1.5,"data":"value"}',
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":9007199254740992,"data":"value"}',
  ])("损坏记录视为未命中且不删除原值：%s", (record) => {
    const store = new TestStorage();
    store.setItem("damaged", record);
    vi.stubGlobal("localStorage", store);
    const storage = new StorageUtils();

    expect(storage.get("damaged")).toBeNull();
    expect(storage.getSafe("damaged")).toBeNull();
    expect(store.getItem("damaged")).toBe(record);
  });

  it("get 不读取或删除转换后 key 相同的其他 prefix 记录", () => {
    const store = new TestStorage();
    vi.stubGlobal("localStorage", store);
    const first = new StorageUtils({
      key: () => "storage-collision",
      prefix: "storage-collision-first-",
    });
    const second = new StorageUtils({
      key: () => "storage-collision",
      prefix: "storage-collision-second-",
    });

    first.set("key", "first");

    expect(second.get("key")).toBeNull();
    expect(first.get("key")).toBe("first");
  });

  it.each([
    ["根值 NaN", NaN],
    ["嵌套 Infinity", { value: Infinity }],
    ["数组负 Infinity", [-Infinity]],
    ["包装 Infinity", Object(Infinity)],
    ["toJSON 返回包装 NaN", { toJSON: () => Object(NaN) }],
    ["跨 realm 包装负 Infinity", runInNewContext("Object(-Infinity)")],
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
    expect(store.length).toBe(0);
  });

  it("按 toJSON 后的实际数值存储跨 realm 包装对象，自定义拆箱只调用一次", () => {
    vi.stubGlobal("localStorage", new TestStorage());
    const storage = new StorageUtils();
    const box: object = runInNewContext("Object(Infinity)");
    const convert = vi.fn(() => "42");
    Object.defineProperty(box, Symbol.toPrimitive, { value: convert });
    const toJSON = vi.fn(() => box);

    storage.set("key", [Object(2), { toJSON }]);
    expect(storage.get("key")).toEqual([2, 42]);
    expect(toJSON.mock.calls).toEqual([["1"]]);
    expect(convert.mock.calls).toEqual([["number"]]);
  });

  it.runIf("rawJSON" in JSON)("原始 JSON null 保持为空，超出有限数范围的原始文本被拒绝", () => {
    if (!("rawJSON" in JSON) || typeof JSON.rawJSON !== "function") throw new Error();
    vi.stubGlobal("localStorage", new TestStorage());
    const storage = new StorageUtils();
    storage.set("key", [JSON.rawJSON("null")]);
    expect(storage.get("key")).toEqual([null]);
    expect(storage.setSafe("key", JSON.rawJSON("1e999"))).toBe(false);
    expect(storage.get("key")).toEqual([null]);
  });

  it("数字包装对象的自定义转换失败时保留已存值", () => {
    vi.stubGlobal("localStorage", new TestStorage());
    const storage = new StorageUtils();
    storage.set("key", 2);
    const convert = vi.fn().mockReturnValueOnce(Infinity).mockReturnValueOnce(1n);
    const box = Object.defineProperty(Object(1), "valueOf", { value: convert });

    expect(storage.setSafe("key", box)).toBe(false);
    expect(() => storage.set("key", box)).toThrow(TypeError);
    expect(convert).toHaveBeenCalledTimes(2);
    expect(storage.get("key")).toBe(2);
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
      get length(): number {
        if (shouldFail) {
          throw new Error("length failed");
        }
        return values.size;
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

  it.each([
    "Web Storage",
    "Map 降级",
  ])("%s 清理大集合时不漏项，也不删除其他命名空间、session 或业务原始值", (backend) => {
    const localBackend = new TestStorage();
    const sessionBackend = new TestStorage();
    vi.stubGlobal("localStorage", backend === "Web Storage" ? localBackend : undefined);
    vi.stubGlobal("sessionStorage", backend === "Web Storage" ? sessionBackend : undefined);
    const prefix = `storage-large-${backend}-`;
    const storage = new StorageUtils({ prefix });
    const sameNamespace = new StorageUtils({ prefix });
    const other = new StorageUtils({ prefix: `${prefix}other-` });
    const session = new StorageUtils({ prefix, type: "session" });
    const rawKey = `${prefix}foreign`;
    localBackend.setItem(rawKey, "business value");

    try {
      for (let index = 0; index < 1000; index += 1) sameNamespace.set(String(index), index);
      other.set("key", "other namespace");
      session.set("key", "session value");
      expect(storage.get("999")).toBe(999);

      storage.clear();

      for (let index = 0; index < 1000; index += 1) {
        expect(sameNamespace.get(String(index))).toBeNull();
      }
      expect(other.get("key")).toBe("other namespace");
      expect(session.get("key")).toBe("session value");
      if (backend === "Web Storage") {
        expect(localBackend.getItem(rawKey)).toBe("business value");
        expect(localBackend.length).toBe(2);
      }
    } finally {
      storage.clear();
      other.clear();
      session.clear();
    }
  });

  it("有状态 key 处理函数在 remove、clear 和重新写入后保持原映射", () => {
    vi.stubGlobal("localStorage", undefined);
    let sequence = 0;
    const handler = vi.fn((key: string) => `${++sequence}:${key}`);
    const storage = new StorageUtils({ key: handler, prefix: "storage-stable-handler-" });

    try {
      storage.set("key", "first");
      expect(storage.get("key")).toBe("first");
      storage.remove("key");
      storage.set("key", "after remove");
      expect(storage.get("key")).toBe("after remove");
      storage.clear();
      storage.set("key", "after clear");
      expect(storage.get("key")).toBe("after clear");
      expect(handler.mock.calls).toEqual([["storage-stable-handler-key"]]);

      storage.set("second", "second value");
      expect(handler.mock.calls).toEqual([
        ["storage-stable-handler-key"],
        ["storage-stable-handler-second"],
      ]);
    } finally {
      storage.clear();
    }
  });

  it("隔离不同前缀的同名物理键，保留同前缀的转换别名", () => {
    vi.stubGlobal("localStorage", new TestStorage());
    const first = new StorageUtils({ key: () => "collision", prefix: "app:" });
    const second = new StorageUtils({ key: () => "collision", prefix: "app:draft:" });
    try {
      first.set("draft:42", 1);
      second.set("42", 2);
      expect(first.get("other")).toBe(1);
      first.set("other", 3);
      expect(first.get("draft:42")).toBe(3);
      expect(second.get("42")).toBe(2);
      first.remove("draft:42");
      expect(first.get("draft:42")).toBeNull();
      expect(first.get("other")).toBeNull();
      expect(second.get("42")).toBe(2);
      first.clear();
      expect(second.get("42")).toBe(2);
    } finally {
      first.clear();
      second.clear();
    }
  });

  it("旧记录按所有权读删，新写失败时保留旧记录", () => {
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    const raw = JSON.stringify({
      data: 1,
      expiresAt: 0,
      marker: "@axutils/common/storage",
      prefix: "app:",
    });
    backend.setItem("app:draft:42", raw);
    const owner = new StorageUtils({ prefix: "app:" });
    const other = new StorageUtils({ prefix: "app:draft:" });
    expect(other.get("42")).toBeNull();
    other.remove("42");
    other.set("42", 2);
    expect(owner.get("draft:42")).toBe(1);
    expect(owner.setSafe("draft:42", NaN)).toBe(false);
    expect(backend.getItem("app:draft:42")).toBe(raw);
    owner.remove("draft:42");
    expect(backend.getItem("app:draft:42")).toBeNull();
    expect(other.get("42")).toBe(2);
    backend.setItem("app:draft:42", "business value");
    owner.set("draft:42", 3);
    owner.remove("draft:42");
    expect(backend.getItem("app:draft:42")).toBe("business value");
  });

  const legacyRecord =
    '{"marker":"@axutils/common/storage","prefix":"","expiresAt":0,"data":"旧值"}';

  it("迁移写入失败保留旧记录，写入成功后即使旧键读失败也可重试清理", () => {
    const backend = new PartiallyThrowingStorage();
    vi.stubGlobal("localStorage", backend);
    const storage = new StorageUtils();
    backend.setItem("key", legacyRecord);
    vi.spyOn(backend, "setItem").mockImplementationOnce(() => {
      throw new Error("写入失败");
    });

    expect(storage.setSafe("key", "新值")).toBe(false);
    expect(backend.getItem("key")).toBe(legacyRecord);
    expect(storage.get("key")).toBe("旧值");

    backend.failingKey = "key";
    expect(storage.setSafe("key", "新值")).toBe(true);
    expect(storage.get("key")).toBe("新值");
    backend.failingKey = null;
    storage.set("key", "最终值");
    expect(backend.getItem("key")).toBeNull();
    expect(storage.get("key")).toBe("最终值");
  });

  it.each([
    "remove",
    "过期",
    "clear",
  ])("迁移提交后 %s 清理旧键失败时旧值不会重新可读", (operation) => {
    vi.useFakeTimers();
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    const storage = new StorageUtils();
    const reader = new StorageUtils();
    storage.set("key", "原新格式值");
    backend.setItem("key", legacyRecord);
    const removeItem = backend.removeItem.bind(backend);
    const cleanup = vi.spyOn(backend, "removeItem").mockImplementation((key) => {
      if (key === "key") throw new Error("旧键删除失败");
      removeItem(key);
    });

    expect(storage.setSafe("key", "新值", operation === "过期" ? 1 : 0)).toBe(true);
    expect(reader.get("key")).toBe("新值");
    if (operation === "过期") {
      vi.advanceTimersByTime(1000);
      expect(reader.getSafe("key")).toBeNull();
      expect(() => reader.get("key")).toThrow("旧键删除失败");
    } else {
      expect(operation === "clear" ? storage.clearSafe() : storage.removeSafe("key")).toBe(false);
      expect(reader.get("key")).toBe("新值");
    }

    cleanup.mockRestore();
    if (operation === "remove") storage.remove("key");
    if (operation === "clear") storage.clear();
    expect(reader.get("key")).toBeNull();
    expect(backend.length).toBe(0);
  });

  it("已有数据可读但配额已满时保留持久后端", () => {
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    new StorageUtils().set("saved", 1);
    const error = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    vi.spyOn(backend, "setItem").mockImplementation(() => {
      throw error;
    });
    const storage = new StorageUtils();
    expect(storage.get("saved")).toBe(1);
    expect(() => storage.set("saved", 2)).toThrow(error);
    expect(storage.setSafe("saved", 2)).toBe(false);
    expect(storage.get("saved")).toBe(1);
    storage.remove("saved");
    expect(backend.length).toBe(0);
  });

  it.each([
    ["Firefox NS_ERROR_DOM_QUOTA_REACHED", { code: 1014, name: "NS_ERROR_DOM_QUOTA_REACHED" }],
    ["旧 WebKit QUOTA_EXCEEDED_ERR", { code: 22, name: "QUOTA_EXCEEDED_ERR" }],
    ["仅 code 22", { code: 22, name: "Error" }],
    ["仅 code 1014", { code: 1014, name: "Error" }],
  ])("配额耗尽抛出 %s 且已有数据可读时保留 Web Storage 后端", (_label, errorProps) => {
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    new StorageUtils().set("saved", "persisted");
    const error = Object.assign(new Error("quota full"), errorProps);
    vi.spyOn(backend, "setItem").mockImplementation(() => {
      throw error;
    });

    const storage = new StorageUtils();
    expect(storage.get("saved")).toBe("persisted");
    expect(() => storage.set("saved", "next")).toThrow(error);
    expect(storage.setSafe("saved", "next")).toBe(false);
    storage.remove("saved");
    expect(backend.length).toBe(0);
  });

  it.each([
    "Session",
    "memory",
    "toString",
    null,
    123,
  ])("构造时传入非法 type (%s) 立即抛出 TypeError", (invalidType) => {
    expect(() => new StorageUtils({ type: invalidType as unknown as "local" })).toThrow(
      new TypeError('type 必须是 "local" 或 "session"'),
    );
  });

  it("亚毫秒正 TTL 在常规时钟、Date.now() === 0 及负时钟边界下不会立即过期或永久有效", () => {
    vi.useFakeTimers();
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    const storage = new StorageUtils({ prefix: "sub-ms:" });

    // 常规时间戳下的亚毫秒正 TTL
    vi.setSystemTime(1000);
    storage.set("regular", "ok", 0.0005);
    expect(storage.get("regular")).toBe("ok");
    vi.advanceTimersByTime(1);
    expect(storage.get("regular")).toBeNull();

    // Date.now() === 0 时不得碰撞永不过期哨兵 0
    vi.setSystemTime(0);
    storage.set("epoch", "ok", 0.0005);
    expect(storage.get("epoch")).toBe("ok");
    vi.advanceTimersByTime(1);
    expect(storage.get("epoch")).toBeNull();

    // 负时钟 + 正 TTL 恰好算得 0 时顺延为 1，不得变为永不过期
    vi.setSystemTime(-500);
    storage.set("negative", "ok", 0.5);
    expect(storage.get("negative")).toBe("ok");
    vi.setSystemTime(0);
    expect(storage.get("negative")).toBe("ok");
    vi.setSystemTime(1);
    expect(storage.get("negative")).toBeNull();
  });

  it.each([
    '{"marker":"@axutils/common/storage/v2","prefix":"app:"',
    "corrupted-raw-text",
    '{"marker":"@axutils/common/storage/v2","prefix":"app:","expiresAt":0}',
    '{"marker":"@axutils/common/storage/v2","prefix":"app:","expiresAt":1.5,"data":"v"}',
  ])("v2 私有物理键内容损坏 (%s) 时允许 set 覆盖恢复，并支持 remove 与 clear 清理", (corrupted) => {
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    const storage = new StorageUtils({ prefix: "app:" });
    const other = new StorageUtils({ prefix: "other:" });
    const v2Key = `@axutils/common/storage/v2/${JSON.stringify(["app:", "app:item"])}`;
    const otherV2Key = `@axutils/common/storage/v2/${JSON.stringify(["other:", "other:item"])}`;

    // set 覆盖损坏记录
    backend.setItem(v2Key, corrupted);
    expect(storage.get("item")).toBeNull();
    storage.set("item", "recovered");
    expect(storage.get("item")).toBe("recovered");

    // remove 清理损坏记录
    backend.setItem(v2Key, corrupted);
    storage.remove("item");
    expect(backend.getItem(v2Key)).toBeNull();

    // clear 只清理当前命名空间的损坏 v2 记录，保留其他命名空间与业务键
    backend.setItem(v2Key, corrupted);
    backend.setItem(otherV2Key, corrupted);
    backend.setItem("app:business", "plain");
    storage.clear();
    expect(backend.getItem(v2Key)).toBeNull();
    expect(backend.getItem(otherV2Key)).toBe(corrupted);
    expect(backend.getItem("app:business")).toBe("plain");
    expect(other.get("item")).toBeNull();
  });

  it("v2 物理键被其他命名空间或旧版的合法记录占用时拒绝覆写且不误删", () => {
    const backend = new TestStorage();
    vi.stubGlobal("localStorage", backend);
    const storage = new StorageUtils({ prefix: "app:" });
    const v2Key = `@axutils/common/storage/v2/${JSON.stringify(["app:", "app:item"])}`;
    const foreignValid = JSON.stringify({
      data: "foreign",
      expiresAt: 0,
      marker: "@axutils/common/storage/v2",
      prefix: "other:",
    });

    backend.setItem(v2Key, foreignValid);
    expect(() => storage.set("item", "mine")).toThrow("缓存键已被其他数据占用");
    expect(storage.setSafe("item", "mine")).toBe(false);
    storage.remove("item");
    storage.clear();
    expect(backend.getItem(v2Key)).toBe(foreignValid);
  });
});
