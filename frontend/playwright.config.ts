import { defineConfig, devices } from "@playwright/test";

const withApi = process.env.TEST_API === "1";
if (withApi && !process.env.DATABASE_URL?.split("?")[0].endsWith("_test")) {
  throw new Error("TEST_API requiere una base temporal con sufijo _test");
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
    ...(process.env.TEST_WEBKIT === "1"
      ? [
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
        ]
      : []),
  ],
  webServer: [
    ...(withApi
      ? [
          {
            command:
              "../backend/.venv/bin/uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8002",
            env: {
              CORS_ORIGINS: '["http://127.0.0.1:5176"]',
              APP_ENV: "test",
              COOKIE_SECURE: "false",
            },
            url: "http://127.0.0.1:8002/health",
            reuseExistingServer: false,
          },
          {
            command: "../backend/.venv/bin/python -m app.processing.worker",
            env: { APP_ENV: "test", COOKIE_SECURE: "false" },
            wait: { stderr: /Worker iniciado/ },
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: "node scripts/demo-media-server.mjs",
      url: "http://127.0.0.1:5175/panoramas/atrio-2048.png",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5176",
      // Regresión: API configurada localhost con frontend abierto en 127.0.0.1.
      env: {
        VITE_DEMO_MEDIA_BASE_URL: "http://127.0.0.1:5175",
        VITE_API_BASE_URL: "http://localhost:8002",
      },
      url: "http://127.0.0.1:5176",
      reuseExistingServer: false,
    },
  ],
});
