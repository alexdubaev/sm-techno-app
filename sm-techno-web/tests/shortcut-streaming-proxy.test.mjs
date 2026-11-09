import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import ts from 'typescript';

test('native shortcut proxy forwards JSON heartbeat bytes before recognition finishes', { timeout: 5000 }, async () => {
  let finished = false;
  let receivedAuthorization;
  let receivedBody;
  const result = { rows: [{ article: '00001234', requestedQty: '2', sourceRow: 1 }], warnings: [], previewText: '1. 00001234 — 2' };
  const server = createServer(async (request, response) => {
    receivedAuthorization = request.headers.authorization;
    const body = [];
    for await (const chunk of request) body.push(chunk);
    receivedBody = Buffer.concat(body).toString();
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'identity', 'Cache-Control': 'no-store' });
    response.write(' '.repeat(4096) + '\n');
    const timer = setInterval(() => response.write(' \n'), 40);
    const completion = setTimeout(() => {
      clearInterval(timer);
      finished = true;
      response.end(JSON.stringify(result));
    }, 600);
    response.on('close', () => { clearInterval(timer); clearTimeout(completion); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const previous = process.env.BACKEND_API_BASE_URL;
  try {
    process.env.BACKEND_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    const source = await readFile(new URL('../app/api/[...path]/route.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    const { POST } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
    const response = await POST(new Request('http://synthetic.test/api/shortcuts/stock/intake', {
      method: 'POST', headers: { Authorization: 'Shortcut synthetic-device', 'Content-Type': 'multipart/form-data; boundary=synthetic' }, body: 'synthetic-file-body',
    }), { params: Promise.resolve({ path: ['shortcuts', 'stock', 'intake'] }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'identity');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(finished, false, 'proxy must not wait for the complete recognition result');
    assert.equal(Buffer.from(first.value).toString().trim(), '');
    const chunks = [Buffer.from(first.value)];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(Buffer.from(chunk.value));
    }
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), result);
    assert.equal(receivedAuthorization, 'Shortcut synthetic-device');
    assert.equal(receivedBody, 'synthetic-file-body');
  } finally {
    if (previous === undefined) delete process.env.BACKEND_API_BASE_URL;
    else process.env.BACKEND_API_BASE_URL = previous;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
