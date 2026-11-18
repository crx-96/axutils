import { appendFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build/package.mjs";

await buildPackage(fileURLToPath(new URL("../", import.meta.url)), {
  umd: { entry: "src/umd.ts", name: "AxutilsCommon" },
});

// 两个 HTTP 入口共用一份宿主类型桥，分别扩充 import / require 实际解析的 Axios 声明。
for (const [declaration, extension] of [
  ["d.ts", "js"],
  ["d.cts", "cjs"],
]) {
  copyFileSync(
    new URL("./axios-host-types.d.ts", import.meta.url),
    new URL(`../dist/internal/http/axios-host-types.${declaration}`, import.meta.url),
  );
  for (const client of ["axios", "rxjs"]) {
    appendFileSync(
      new URL(`../dist/${client}/http.${declaration}`, import.meta.url),
      `\nimport type {} from "../internal/http/axios-host-types.${extension}";\n`,
    );
  }
}
