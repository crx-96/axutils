import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

/** 仅提供固定测试资源与本地回显接口，不将工作区目录暴露为静态文件服务。 */
export async function startBrowserServer(bundlePath, umdPath) {
  const [bundle, umd] = await Promise.all([readFile(bundlePath), readFile(umdPath)]);
  const html = (script) =>
    `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>axutils browser smoke</title><body>${script}</body></html>`;
  const routes = new Map([
    [
      "/esm",
      ["text/html; charset=utf-8", html('<script type="module" src="/consumer.js"></script>')],
    ],
    [
      "/umd",
      [
        "text/html; charset=utf-8",
        html(
          '<script src="/index.umd.cjs"></script><script>window.AxutilsTest = window.AxutilsCommon;</script>',
        ),
      ],
    ],
    ["/consumer.js", ["text/javascript; charset=utf-8", bundle]],
    ["/index.umd.cjs", ["text/javascript; charset=utf-8", umd]],
  ]);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/api/echo") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("error", (error) => response.destroy(error));
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            body: Buffer.concat(chunks).toString("utf8"),
            header: request.headers["x-axutils-test"],
            method: request.method,
            query: Object.fromEntries(url.searchParams),
          }),
        );
      });
      return;
    }
    if (url.pathname === "/api/failure") {
      response.writeHead(418, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "browser smoke expected failure" }));
      return;
    }
    const route = routes.get(url.pathname);
    if (!route) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": route[0] });
    response.end(route[1]);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("浏览器测试服务器未返回 TCP 地址。");
  }
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
    url: `http://127.0.0.1:${address.port}`,
  };
}
