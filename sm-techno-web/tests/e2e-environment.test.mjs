import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const launcherPath = fileURLToPath(
  new URL("./support/run-isolated-playwright.mjs", import.meta.url),
);

test("the Playwright launcher scrubs production-sensitive values before spawning", () => {
  const result = spawnSync(process.execPath, [launcherPath, "--verify-isolation-probe"], {
    encoding: "utf8",
    env: {
      ...process.env,
      BACKEND_API_BASE_URL: "https://production-backend.example",
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      UNRELATED_SECRET: "must-not-cross-boundary",
      SM_TECHNO_DB_PATH: "/production/stock_sync.db",
      SM_TECHNO_STORAGE_ROOT: "/production/storage",
      SM_TECHNO_CRM_SYNC_USER_ID: "123",
      SM_TECHNO_CREDENTIAL_KEY: "must-be-replaced",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const childEnvironment = JSON.parse(result.stdout);
  assert.deepEqual(childEnvironment, {
    BACKEND_API_BASE_URL: null,
    CLOUDFLARE_INCLUDE_PROCESS_ENV: null,
    UNRELATED_SECRET: null,
    SM_TECHNO_DB_PATH: null,
    SM_TECHNO_STORAGE_ROOT: null,
    SM_TECHNO_CRM_SYNC_USER_ID: null,
    testCredentialKeyValid: true,
  });
});
