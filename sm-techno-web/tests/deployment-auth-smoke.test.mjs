import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { verifyDeployedAuthProxy } from "./support/verify-deployed-auth-proxy.mjs";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("deployment auth smoke reaches the same-origin health proxy", async () => {
  let requestedUrl = "";
  await withServer((request, response) => {
    requestedUrl = request.url ?? "";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  }, async (origin) => {
    await verifyDeployedAuthProxy(origin, { requireHttps: false });
  });

  assert.equal(requestedUrl, "/api/health");
});

test("deployment auth smoke rejects an unconfigured proxy response", async () => {
  await withServer((_request, response) => {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ detail: "Сервер приложения пока не настроен." }));
  }, async (origin) => {
    await assert.rejects(
      verifyDeployedAuthProxy(origin, { requireHttps: false }),
      /HTTP 503/,
    );
  });
});

test("deployment auth smoke requires the exact healthy payload", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "degraded" }));
  }, async (origin) => {
    await assert.rejects(
      verifyDeployedAuthProxy(origin, { requireHttps: false }),
      /unexpected response payload/,
    );
  });
});
