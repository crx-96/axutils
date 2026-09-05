import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build/package.mjs";

await buildPackage(fileURLToPath(new URL("../", import.meta.url)), {
  umd: { entry: "src/umd.ts", name: "AxutilsCommon" },
});
