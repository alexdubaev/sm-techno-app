import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.resolve(frontendDir, "..");
const backendPort = 18_000;
const frontendPort = 13_000;
const pythonCommand = process.env.SM_TECHNO_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results/auth",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/auth", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      name: "isolated FastAPI",
      command: `"${pythonCommand}" tests/support/run_auth_backend.py`,
      cwd: repositoryDir,
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SM_TECHNO_E2E_BACKEND_PORT: String(backendPort),
      },
    },
    {
      name: "Next.js frontend",
      command: `npm run dev -- --hostname 127.0.0.1 --port ${frontendPort}`,
      cwd: frontendDir,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BACKEND_API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
  projects: [390, 1280, 1600].map((width) => ({
    name: `chromium-${width}`,
    use: { ...devices["Desktop Chrome"], viewport: { width, height: 900 } },
  })),
});
