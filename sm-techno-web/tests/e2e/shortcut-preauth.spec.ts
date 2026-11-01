import { test, expect } from '@playwright/test';
import http from 'node:http';

test('shortcut proxy returns unauthorized without waiting for the whole upload', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request('http://127.0.0.1:13000/api/shortcuts/stock/intake', {
      method: 'POST', headers: { authorization: 'Shortcut invalid', 'content-type': 'multipart/form-data; boundary=test', 'transfer-encoding': 'chunked' },
    }, response => { response.resume(); resolve(response.statusCode ?? 0); request.destroy(); });
    request.on('error', reject);
    request.setTimeout(5000, () => { request.destroy(); reject(new Error('Proxy waited for the entire body')); });
    request.write('--test\r\nContent-Disposition: form-data; name="file"; filename="x.txt"\r\n\r\npartial');
  });
  expect(status).toBe(401);
});

test('shortcut proxy forwards a valid device request body', async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'operator', password: 'operator-e2e-password' } });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).token;
  const device = await request.post('/api/stock/shortcut-devices', { headers: { authorization: `Bearer ${token}` }, data: {label: 'Synthetic phone'} });
  expect(device.ok()).toBeTruthy();
  const code = (await device.json()).credential;
  const response = await request.post('/api/shortcuts/stock/resolve', { headers: { authorization: `Shortcut ${code}` }, data: {rows: [], format: 'valuation'} });
  expect(response.status()).toBe(422);
  expect(response.headers()['cache-control']).toBe('no-store');
});
