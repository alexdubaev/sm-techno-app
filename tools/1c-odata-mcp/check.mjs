import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const temp = await mkdtemp(join(tmpdir(), "sm-techno-odata-mcp-"));
let writes = 0;
const fixture = createServer((req, res) => {
  if (req.method !== "GET") writes++;
  if (req.url === "/odata/standard.odata/$metadata" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/xml", "odata-version": "4.0" });
    res.end('<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0"><edmx:DataServices m:DataServiceVersion="4.0"><Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="StandardODATA"><EntityType Name="Catalog_Контрагенты"><Key><PropertyRef Name="Ref_Key"/></Key><Property Name="Ref_Key" Type="Edm.Guid"/></EntityType><EntityContainer Name="StandardODATAContainer"><EntitySet Name="Catalog_Контрагенты" EntityType="StandardODATA.Catalog_Контрагенты"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>');
    return;
  }
  res.writeHead(404);
  res.end();
});
try {
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  assert(address && typeof address === "object");
  const envPath = join(temp, ".env.onec-mcp");
  await writeFile(envPath, `ODATA_BASE_URL=http://127.0.0.1:${address.port}/odata/standard.odata/\nODATA_USERNAME=test-user\nODATA_PASSWORD=test-password\nREAD_ONLY=false\nODATA_WRITABLE=true\n`, { mode: 0o600 });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["run.mjs", "--env-file", envPath],
    cwd: dirname(fileURLToPath(import.meta.url)),
    env: { ...process.env, READ_ONLY: "false", ODATA_WRITABLE: "true", ODATA_DB_POISON_BASE_URL: "http://invalid/" },
  });
  const client = new Client({ name: "install-check", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert(listed.tools.some((tool) => tool.name === "read.system.health_check"));
    const health = await client.callTool({ name: "read.system.health_check", arguments: {} });
    assert.equal(health.isError, undefined);
    assert.equal(health.structuredContent?.status, "ok");
    assert.equal(health.structuredContent?.odataVersion, "4.0");
    assert.equal(health.structuredContent?.readOnly, true);
    const attemptedWrite = await client.callTool({
      name: "write.counterparty.create_counterparty",
      arguments: { name: "Synthetic write probe", confirm: true, operationId: randomUUID() },
    });
    assert.equal(attemptedWrite.isError, true, "writes must be blocked despite hostile inherited env");
    assert(attemptedWrite.content.some((item) => item.type === "text" && item.text.includes("только-чтение")), "attempt must reach the READ_ONLY guard");
    assert.equal(writes, 0, "fixture must receive no mutation request");
    console.log("MCP initialize/list, synthetic OData health check, hostile-env isolation, and write guard: PASS");
  } finally {
    await client.close();
  }
} finally {
  fixture.close();
  await rm(temp, { recursive: true, force: true });
}
