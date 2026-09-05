import { pathToFileURL } from "node:url";

export async function verifyDeployedAuthProxy(origin, { requireHttps = true } = {}) {
  let siteUrl;
  try {
    siteUrl = new URL(origin);
  } catch {
    throw new Error("deployment origin must be an absolute URL");
  }
  if (requireHttps && siteUrl.protocol !== "https:") {
    throw new Error("deployment origin must use HTTPS");
  }
  if (siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash) {
    throw new Error("deployment origin must not contain credentials, query, or fragment");
  }

  const healthUrl = new URL("/api/health", siteUrl);
  const response = await fetch(healthUrl, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`deployment auth proxy returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("deployment auth proxy returned non-JSON content");
  }
  if (!payload || typeof payload !== "object" || payload.status !== "ok") {
    throw new Error("deployment auth proxy returned an unexpected response payload");
  }
}

async function main() {
  const origin = process.argv[2];
  if (!origin) {
    throw new Error("usage: npm run test:deployment:auth-smoke -- https://site.example");
  }
  await verifyDeployedAuthProxy(origin);
  console.log(`Auth proxy smoke passed for ${new URL(origin).origin}/api/health`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
