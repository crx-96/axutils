import { afterEach, describe, expect, it } from "vitest";

import {
  isBrowser as isBrowserFromPlatform,
  isBrowserLike as isBrowserLikeFromPlatform,
  isBun as isBunFromPlatform,
  isDeno as isDenoFromPlatform,
  isNode as isNodeFromPlatform,
  isServer as isServerFromPlatform,
  isWebWorker as isWebWorkerFromPlatform,
} from "../../src/check/platform";
import {
  isBrowser,
  isBrowserLike,
  isBun,
  isDeno,
  isNode,
  isServer,
  isWebWorker,
} from "../../src/index";

const mutableGlobal = globalThis as Record<string, unknown>;
const patchedGlobalKeys = ["window", "document", "self", "importScripts"] as const;
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>(
  patchedGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);

afterEach(() => {
  for (const key of patchedGlobalKeys) {
    const descriptor = originalDescriptors.get(key);
    if (descriptor === undefined) {
      Reflect.deleteProperty(mutableGlobal, key);
    } else {
      Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

describe("platform", () => {
  it("在 Node 环境下判断运行时", () => {
    // vitest 运行在 Node.js 中，Node 相关判断为 true
    expect(isNode()).toBe(true);
    // 非浏览器主线程，isBrowser / isBrowserLike 为 false
    expect(isBrowser()).toBe(false);
    expect(isBrowserLike()).toBe(false);
    // isServer 是 isBrowser 的取反
    expect(isServer()).toBe(true);
    // Worker / Deno / Bun 在当前环境均非
    expect(isWebWorker()).toBe(false);
    expect(isDeno()).toBe(false);
    expect(isBun()).toBe(false);
  });

  it("返回值均为布尔类型", () => {
    expect(typeof isBrowser()).toBe("boolean");
    expect(typeof isNode()).toBe("boolean");
    expect(typeof isWebWorker()).toBe("boolean");
    expect(typeof isBrowserLike()).toBe("boolean");
    expect(typeof isServer()).toBe("boolean");
    expect(typeof isDeno()).toBe("boolean");
    expect(typeof isBun()).toBe("boolean");
  });

  it("主入口导出与子模块导出保持一致", () => {
    expect(isBrowser).toBe(isBrowserFromPlatform);
    expect(isBrowserLike).toBe(isBrowserLikeFromPlatform);
    expect(isBun).toBe(isBunFromPlatform);
    expect(isDeno).toBe(isDenoFromPlatform);
    expect(isNode).toBe(isNodeFromPlatform);
    expect(isServer).toBe(isServerFromPlatform);
    expect(isWebWorker).toBe(isWebWorkerFromPlatform);
  });

  it("全局属性为 null 或非对象伪值时不被误判为浏览器或 Web Worker", () => {
    for (const invalidValue of [null, false, "", 0]) {
      mutableGlobal.window = invalidValue;
      expect(isBrowserLike()).toBe(false);
      expect(isBrowser()).toBe(false);

      mutableGlobal.window = globalThis;
      mutableGlobal.document = invalidValue;
      expect(isBrowser()).toBe(false);
      expect(isServer()).toBe(true);

      mutableGlobal.self = invalidValue;
      mutableGlobal.importScripts = () => {};
      expect(isWebWorker()).toBe(false);
    }

    mutableGlobal.window = globalThis;
    mutableGlobal.document = {};
    expect(isBrowserLike()).toBe(true);
    expect(isBrowser()).toBe(true);
    expect(isServer()).toBe(false);

    Reflect.deleteProperty(mutableGlobal, "window");
    Reflect.deleteProperty(mutableGlobal, "document");
    mutableGlobal.self = {};
    mutableGlobal.importScripts = () => {};
    expect(isWebWorker()).toBe(true);
  });
});
