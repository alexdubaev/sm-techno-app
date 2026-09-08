import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));

if (!existsSync(vitest)) {
  console.error("Vitest is required for network resilience runtime checks. Run npm ci first.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    vitest,
    "run",
    "--config",
    "vitest.auth.config.ts",
    "tests/auth/api-session.integration.test.ts",
    "tests/auth/auth-provider.integration.test.tsx",
  ],
  { cwd: webRoot, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Client network resilience runtime checks passed.");
