import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it } from "vitest";

const execute = promisify(execFile);
const probeRunner = fileURLToPath(new URL("./helpers/run-timezone-probe.mjs", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("date/宿主时区回归", () => {
  // TZ 必须在独立 Node 进程启动前设置；修改当前 Vitest worker 的环境不能保证更新宿主 Date。
  it.each([
    "UTC",
    "America/New_York",
    "Asia/Shanghai",
    "Pacific/Apia",
  ])("在 %s 宿主中运行源码契约", async (timezone) => {
    try {
      await execute(process.execPath, [probeRunner], {
        cwd: packageRoot,
        env: { ...process.env, TZ: timezone },
        timeout: 25_000,
      });
    } catch (error) {
      if (error instanceof Error && "stdout" in error && "stderr" in error) {
        throw new Error(
          `${timezone} 子进程失败：${error.message}\n${error.stdout}\n${error.stderr}`,
        );
      }
      throw error;
    }
  }, 30_000);
});
