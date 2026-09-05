import type { HttpSuccess } from "@axutils/common/rxjs/http";
import { expect, test } from "@playwright/test";
import type { Observable } from "rxjs";

interface Echo {
  method: string;
  query: Record<string, string>;
  body: string;
  header?: string;
}

// 两种产物使用相同行为断言，但通过独立 HTML 加载 ESM bundle / UMD 全局。
for (const format of ["esm", "umd"] as const) {
  test.describe(format, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/${format}`);
      await page.waitForFunction(() => typeof window.AxutilsTest !== "undefined");
    });

    test("浏览器平台检测与产物加载", async ({ page }) => {
      expect(
        await page.evaluate(() => ({
          browser: window.AxutilsTest.isBrowser(),
          browserLike: window.AxutilsTest.isBrowserLike(),
          md5: typeof window.AxutilsTest.Md5,
          node: window.AxutilsTest.isNode(),
          promiseHttp: typeof window.AxutilsTest.PromiseHttpClient,
          rxHttp: typeof window.AxutilsTest.RxHttpClient,
          server: window.AxutilsTest.isServer(),
          umd: typeof window.AxutilsCommon,
          worker: window.AxutilsTest.isWebWorker(),
        })),
      ).toEqual({
        browser: true,
        browserLike: true,
        md5: "function",
        node: false,
        promiseHttp: "function",
        rxHttp: "function",
        server: false,
        umd: format === "umd" ? "object" : "undefined",
        worker: false,
      });
    });

    test("真实 localStorage/sessionStorage 持久化与标签页隔离", async ({ page, context }) => {
      await page.evaluate(() => {
        const { StorageUtils } = window.AxutilsTest;
        new StorageUtils({ prefix: "browser:", type: "local" }).set("value", { value: "local" });
        new StorageUtils({ prefix: "browser:", type: "session" }).set("value", {
          value: "session",
        });
      });
      await page.reload();
      await page.waitForFunction(() => typeof window.AxutilsTest !== "undefined");
      const readStorage = () => {
        const { StorageUtils } = window.AxutilsTest;
        return {
          local: new StorageUtils({ prefix: "browser:", type: "local" }).get("value"),
          // 直接读取 Web Storage，避免内存降级路径意外通过浏览器测试。
          localKey: localStorage.getItem("browser:value") !== null,
          session: new StorageUtils({ prefix: "browser:", type: "session" }).get("value"),
          sessionKey: sessionStorage.getItem("browser:value") !== null,
        };
      };
      expect(await page.evaluate(readStorage)).toEqual({
        local: { value: "local" },
        localKey: true,
        session: { value: "session" },
        sessionKey: true,
      });
      const secondPage = await context.newPage();
      try {
        await secondPage.goto(`/${format}`);
        await secondPage.waitForFunction(() => typeof window.AxutilsTest !== "undefined");
        expect(await secondPage.evaluate(readStorage)).toEqual({
          local: { value: "local" },
          localKey: true,
          session: null,
          sessionKey: false,
        });
      } finally {
        await secondPage.close();
      }
    });

    test("清理命名空间保留其它业务和另一种存储", async ({ page }) => {
      expect(
        await page.evaluate(() => {
          const { StorageUtils } = window.AxutilsTest;
          const own = new StorageUtils({ prefix: "own:" });
          const other = new StorageUtils({ prefix: "other:" });
          const session = new StorageUtils({ prefix: "own:", type: "session" });
          own.set("entry", { remove: true });
          other.set("entry", { keep: true });
          session.set("entry", "session");
          localStorage.setItem("unrelated", "keep");
          own.clear();
          return {
            keyRemoved: localStorage.getItem("own:entry") === null,
            other: other.get("entry"),
            own: own.get("entry"),
            raw: localStorage.getItem("unrelated"),
            session: session.get("entry"),
          };
        }),
      ).toEqual({
        keyRemoved: true,
        other: { keep: true },
        own: null,
        raw: "keep",
        session: "session",
      });
    });

    test("真实浏览器计时器执行防抖与节流", async ({ page }) => {
      const result = await page.evaluate(async () => {
        const { debounce, throttle } = window.AxutilsTest;
        const debouncedCalls: string[] = [];
        const throttledCalls: string[] = [];
        // 由目标回调发出完成信号；不以固定 sleep 推测定时器已经执行。
        const debounced = new Promise<void>((resolve) => {
          const invoke = debounce((value: string) => {
            debouncedCalls.push(value);
            resolve();
          }, 20);
          invoke("first");
          invoke("last");
        });
        const throttled = new Promise<void>((resolve) => {
          const invoke = throttle((value: string) => {
            throttledCalls.push(value);
            if (value === "last") resolve();
          }, 20);
          invoke("first");
          invoke("middle");
          invoke("last");
        });
        const immediate = { debounce: [...debouncedCalls], throttle: [...throttledCalls] };
        await Promise.all([debounced, throttled]);
        return { debounce: debouncedCalls, immediate, throttle: throttledCalls };
      });
      expect(result).toEqual({
        debounce: ["last"],
        immediate: { debounce: [], throttle: ["first"] },
        throttle: ["first", "last"],
      });
    });

    test("MD5 字节子视图与分块更新", async ({ page }) => {
      expect(
        await page.evaluate(() => {
          const { Md5 } = window.AxutilsTest;
          const bytes = new Uint8Array([0, 97, 98, 99, 255]);
          return {
            base64: new Md5().update("abc").toBase64(),
            chunks: new Md5().update("a").update(bytes.subarray(2, 4)).toHex(),
            text: new Md5().update("abc").toHex(),
            view: new Md5().update(bytes.subarray(1, 4)).toHex(),
          };
        }),
      ).toEqual({
        base64: "kAFQmDzST7DWlj99KOF/cg==",
        chunks: "900150983cd24fb0d6963f7d28e17f72",
        text: "900150983cd24fb0d6963f7d28e17f72",
        view: "900150983cd24fb0d6963f7d28e17f72",
      });
    });

    test("Promise 与 RxJS HTTP 通过真实网络发送参数和请求体", async ({ page }) => {
      const responses = await page.evaluate(async () => {
        const { PromiseHttpClient, RxHttpClient } = window.AxutilsTest;
        const options = { baseUrl: `${location.origin}/api`, retryCount: 1 };
        const promise = new PromiseHttpClient(options);
        const rx = new RxHttpClient(options);
        const fromObservable = (source: Observable<HttpSuccess<Echo>>) =>
          new Promise<HttpSuccess<Echo>>((resolve, reject) =>
            source.subscribe({ error: reject, next: resolve }),
          );
        return Promise.all([
          promise.get<Echo>("echo", { params: { kind: "promise", text: "中文" } }),
          promise.post<Echo>(
            "echo",
            { kind: "promise" },
            { headers: { "X-Axutils-Test": "promise" } },
          ),
          fromObservable(rx.get<Echo>("echo", { params: { kind: "rxjs", text: "中文" } })),
          fromObservable(
            rx.post<Echo>("echo", { kind: "rxjs" }, { headers: { "X-Axutils-Test": "rxjs" } }),
          ),
        ]);
      });
      expect(responses).toEqual([
        {
          code: 200,
          data: { body: "", method: "GET", query: { kind: "promise", text: "中文" } },
          error: null,
          success: true,
        },
        {
          code: 200,
          data: { body: '{"kind":"promise"}', header: "promise", method: "POST", query: {} },
          error: null,
          success: true,
        },
        {
          code: 200,
          data: { body: "", method: "GET", query: { kind: "rxjs", text: "中文" } },
          error: null,
          success: true,
        },
        {
          code: 200,
          data: { body: '{"kind":"rxjs"}', header: "rxjs", method: "POST", query: {} },
          error: null,
          success: true,
        },
      ]);
    });

    test("真实 HTTP 错误保留各自公开错误类", async ({ page }) => {
      expect(
        await page.evaluate(async () => {
          const api = window.AxutilsTest;
          const options = { baseUrl: `${location.origin}/api`, retryCount: 1 };
          const promiseFailure = new api.PromiseHttpClient(options).get("failure").then(
            () => ({ unexpectedSuccess: true }),
            (error: unknown) => {
              if (!(error instanceof api.PromiseHttpRequestError)) throw error;
              return { code: error.code, kind: error.error.kind, success: error.success };
            },
          );
          const rxFailure = new Promise((resolve, reject) => {
            new api.RxHttpClient(options).get("failure").subscribe({
              error: (error: unknown) => {
                if (!(error instanceof api.HttpRequestError)) return reject(error);
                resolve({ code: error.code, kind: error.error.kind, success: error.success });
              },
              next: () => reject(new Error("RxJS 请求意外成功")),
            });
          });
          return Promise.all([promiseFailure, rxFailure]);
        }),
      ).toEqual([
        { code: 418, kind: "http", success: false },
        { code: 418, kind: "http", success: false },
      ]);
    });
  });
}
