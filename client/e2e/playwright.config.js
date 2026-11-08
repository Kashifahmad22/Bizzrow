import { defineConfig } from "@playwright/test";

if (!process.env.E2E_BASE_URL || !process.env.E2E_API_URL || !process.env.E2E_BROWSER_PATH
    || !/^[a-f0-9]{64}$/.test(process.env.E2E_NONCE || "")) {
  throw new Error("Run browser tests through npm run test:e2e; direct execution is unsafe.");
}
for (const [value, pathname] of [[process.env.E2E_BASE_URL, "/"], [process.env.E2E_API_URL, "/api"]]) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
      || url.pathname !== pathname || url.username || url.password || url.search || url.hash) {
    throw new Error("E2E services must use explicit IPv4 loopback URLs");
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: process.env.E2E_OUTPUT_DIR,
  globalSetup: "./verify-server.js",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    browserName: "chromium",
    launchOptions: { executablePath: process.env.E2E_BROWSER_PATH },
    serviceWorkers: "block",
  },
});
