import { defineConfig } from "@playwright/test";

const baseURL = process.env.AXUTILS_BROWSER_URL;
const outputDir = process.env.AXUTILS_BROWSER_OUTPUT_DIR;
if (!baseURL || !outputDir) {
  throw new Error("请通过 pnpm test:browser 启动测试，以统一管理构建、服务器和临时产物。");
}

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir,
  reporter: "list",
  retries: 0,
  testDir: "./test-browser",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    // 本地可显式复用已安装的 Edge/Chrome；CI 默认使用 Playwright Chromium。
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 2,
});
