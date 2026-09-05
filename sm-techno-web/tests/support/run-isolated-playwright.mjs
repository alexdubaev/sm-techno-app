import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REQUIRED_PROCESS_ENV_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "LC_ALL",
  "CI",
  "GITHUB_ACTIONS",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "PLAYWRIGHT_BROWSERS_PATH",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "PYTHONUTF8",
  "PYTHONIOENCODING",
  "SM_TECHNO_TEST_PYTHON",
];

function createIsolatedEnvironment(source) {
  const isolated = {};
  for (const key of REQUIRED_PROCESS_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      isolated[key] = value;
    }
  }
  return isolated;
}

function run(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  return result;
}

const isolatedEnvironment = createIsolatedEnvironment(process.env);
const args = process.argv.slice(2);

if (args[0] === "--verify-isolation-probe") {
  const probe = run(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify({BACKEND_API_BASE_URL:process.env.BACKEND_API_BASE_URL??null,CLOUDFLARE_INCLUDE_PROCESS_ENV:process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV??null,UNRELATED_SECRET:process.env.UNRELATED_SECRET??null}))",
    ],
    { encoding: "utf8", env: isolatedEnvironment },
  );
  process.stdout.write(probe.stdout);
  process.stderr.write(probe.stderr);
  process.exitCode = probe.status ?? 1;
} else {
  const playwrightCli = require.resolve("@playwright/test/cli");
  const result = run(process.execPath, [playwrightCli, ...args], {
    env: isolatedEnvironment,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
