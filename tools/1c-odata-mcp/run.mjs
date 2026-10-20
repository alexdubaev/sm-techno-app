import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { parseEnv } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageRoot = dirname(fileURLToPath(import.meta.url));
const suppliedPath = process.argv[2] === "--env-file" ? process.argv[3] : undefined;
if (process.argv.length > 2 && (!suppliedPath || process.argv.length !== 4)) {
  console.error("Usage: node tools/1c-odata-mcp/run.mjs [--env-file path]");
  process.exit(2);
}
const envFile = suppliedPath ? resolve(suppliedPath) : join(projectRoot, ".env.onec-mcp");

let config;
try {
  config = parseEnv(await readFile(envFile, "utf8"));
} catch {
  console.error("Не удалось прочитать локальный файл .env.onec-mcp.");
  process.exit(2);
}
for (const key of ["ODATA_BASE_URL", "ODATA_USERNAME", "ODATA_PASSWORD"]) {
  if (!config[key]?.trim()) {
    console.error(`В локальном файле не задан обязательный параметр ${key}.`);
    process.exit(2);
  }
}
try {
  const url = new URL(config.ODATA_BASE_URL);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
} catch {
  console.error("ODATA_BASE_URL должен быть корректным HTTP(S) URL без встроенных реквизитов.");
  process.exit(2);
}

// Только явно перечисленная конфигурация попадает в дочерний процесс.
// NODE_OPTIONS и все ODATA_DB_* из окружения вызывающей программы исключены.
const childEnv = {
  ODATA_BASE_URL: config.ODATA_BASE_URL.trim(),
  ODATA_USERNAME: config.ODATA_USERNAME.trim(),
  ODATA_PASSWORD: config.ODATA_PASSWORD,
  READ_ONLY: "true",
  ODATA_WRITABLE: "false",
  ODATA_TIMEOUT_MS: "20000",
  ODATA_RETRIES: "1",
  ODATA_PAGE_SIZE: "50",
  ODATA_MAX_ROWS: "500",
  ODATA_ANALYTICS_MAX_ROWS: "10000",
  LOG_LEVEL: "error",
};
if (process.platform === "win32" && process.env.SystemRoot) childEnv.SystemRoot = process.env.SystemRoot;
const child = spawn(process.execPath, [join(packageRoot, "node_modules", "1c-odata-mcp", "dist", "index.js")], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
  windowsHide: true,
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!stopping) {
      stopping = true;
      child.kill(signal);
    }
  });
}
child.once("error", () => {
  console.error("Не удалось запустить локальный сервер MCP 1С.");
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal && !stopping) process.kill(process.pid, signal);
  else process.exitCode = code ?? (stopping ? 0 : 1);
});
