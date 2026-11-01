import { test, expect } from '@playwright/test';

test('scoped worker accepts a text share only after login, without recognizing it', async ({page}) => {
  let calls = 0;
  await page.route('**/api/stock/valuation/intake', route => { calls++; return route.fulfill({json:{rows:[], warnings:[]}}); });
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator');
  await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button', {name:'Войти', exact:true}).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/stock-share/');
    if (!registration?.active) return false;
    const databases = await indexedDB.databases();
    return databases.some(db => db.name === 'stock-share-owner-v1');
  });
  await page.goto('/stock-share/capability');
  await page.evaluate(() => {
    const form = document.createElement('form'); form.method = 'POST'; form.enctype = 'multipart/form-data'; form.action = '/stock-share/receive';
    const input = document.createElement('input'); input.name = 'text'; input.value = 'A-123'; form.append(input); document.body.append(form); form.submit();
  });
  await expect(page).toHaveURL(/\/stock/);
  await expect(page.getByText('stock.txt')).toBeVisible();
  await expect(page.getByRole('button',{name:'Распознать'})).toBeVisible();
  expect(calls).toBe(0);
  await page.screenshot({path: test.info().outputPath('stock-share-mobile.png')});
  expect(new URL(page.url()).searchParams.has('share')).toBe(false);
  await page.getByRole('button',{name:'Закрыть'}).click();
  await expect(page.getByText('stock.txt')).toHaveCount(0);
});


test('manifest, PNG icons and unchanged signed iPhone download are served correctly', async ({request}) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.share_target).toMatchObject({action:'/stock-share/receive', method:'POST', enctype:'multipart/form-data'});
  expect(manifest.name).toBe('СМ ТЕХНО — локальный прайс и заказы');
  for (const [url, size] of [['/icon-192.png',192], ['/icon-512.png',512]] as const) {
    const response = await request.get(url); expect(response.ok()).toBeTruthy();
    const png = await response.body(); expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
  const oldFile = await (await request.get('/shortcuts/sm-techno-stock.shortcut')).body();
  const download = await request.get('/shortcuts/download');
  expect(await download.body()).toEqual(oldFile);
  expect(decodeURIComponent(download.headers()['content-disposition'])).toContain('Поделиться СМ ТЕХНО.shortcut');
});

test('worker delivers only to stock client once and rejects another owner', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator');
  await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button', {name:'Войти', exact:true}).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration('/stock-share/'))?.active?.state === 'activated');
  // Wait for the owner ACK, not merely worker registration.
  await page.waitForFunction(async () => { const db = await new Promise<IDBDatabase>((resolve,reject) => { const r=indexedDB.open('stock-share-owner-v1'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); if (!db.objectStoreNames.contains('meta')) { db.close(); return false; } return await new Promise<boolean>(resolve => { const tx=db.transaction('meta'); const r=tx.objectStore('meta').get('owner'); r.onsuccess=()=>{db.close();resolve(!!r.result);}; r.onerror=()=>{db.close();resolve(false);}; }); });
  async function stage() {
    let nonce = '';
    await page.route('**/stock?share=*', async route => { nonce = new URL(route.request().url()).searchParams.get('share') || ''; await route.abort(); });
    await page.goto('/stock-share/capability');
    await page.evaluate(() => { const form=document.createElement('form'); form.method='POST'; form.enctype='multipart/form-data'; form.action='/stock-share/receive'; const field=document.createElement('input'); field.name='text'; field.value='private-article'; form.append(field); document.body.append(form); form.submit(); });
    await expect.poll(() => nonce).toMatch(/^[0-9a-f]{32}$/);
    await page.unroute('**/stock?share=*');
    await page.goto('/stock');
    return nonce;
  }
  async function claim(nonce: string, wrong = false) {
    return page.evaluate(async ({nonce, wrong}) => {
      const session=JSON.parse(localStorage.getItem('sm-techno-auth-session')!);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session.token));
      const owner={actor:session.user.id+(wrong?1:0),hash:Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join(''),version:1};
      const worker=(await navigator.serviceWorker.getRegistration('/stock-share/'))!.active!;
      return await new Promise<{ok:boolean; payload?:string}>(resolve => { const channel=new MessageChannel(); channel.port1.onmessage=e=>resolve(e.data); worker.postMessage({type:'claim',nonce,owner},[channel.port2]); });
    }, {nonce, wrong});
  }
  const nonce = await stage();
  expect(await claim(nonce)).toMatchObject({ok:true,payload:'private-article'});
  expect((await claim(nonce)).ok).toBe(false);
  const another = await stage();
  expect((await claim(another, true)).ok).toBe(false);
  expect((await claim(another)).ok).toBe(false);
});

test('invalid share bodies fail closed with recovery and metadata contains no payload', async ({page}) => {
  let calls=0;
  await page.route('**/api/stock/valuation/intake', route => { calls++; return route.abort(); });
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator'); await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button',{name:'Войти',exact:true}).click(); await expect(page.getByRole('main')).toBeVisible();
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration('/stock-share/'))?.active?.state === 'activated');
  for (const kind of ['title', 'url', 'multiple', 'oversize'] as const) {
    let result = '';
    await page.route('**/stock?share=*', async route => { result = new URL(route.request().url()).searchParams.get('share') || ''; await route.abort(); });
    await page.goto('/stock-share/capability');
    await page.evaluate(kind => {
      const form=document.createElement('form'); form.method='POST'; form.enctype='multipart/form-data'; form.action='/stock-share/receive';
      if (kind === 'title' || kind === 'url') { const field=document.createElement('input'); field.name=kind === 'title' ? 'title' : 'text'; field.value=kind === 'title' ? 'private title' : 'https://example.com/private'; form.append(field); }
      else { const input=document.createElement('input'); input.type='file'; input.name='file'; input.multiple=true; const files=new DataTransfer(); files.items.add(new File([new Uint8Array(kind === 'oversize' ? 27*1024*1024 : 1)], 'a.txt')); if (kind === 'multiple') files.items.add(new File(['b'], 'b.txt')); input.files=files.files; form.append(input); }
      document.body.append(form); form.submit();
    }, kind);
    await expect.poll(() => result).toBe('invalid');
    await page.unroute('**/stock?share=*');
  }
  await page.goto('/stock?share=invalid');
  await expect(page.getByRole('alert').filter({hasText:'Передача недоступна'})).toBeVisible();
  expect(calls).toBe(0);
  const metadata = await page.evaluate(async () => { const db=await new Promise<IDBDatabase>(resolve => { const r=indexedDB.open('stock-share-owner-v1'); r.onsuccess=()=>resolve(r.result); }); return await new Promise(resolve => { const r=db.transaction('meta').objectStore('meta').get('owner'); r.onsuccess=()=>{db.close();resolve(r.result);}; }); });
  expect(Object.keys(metadata as object).sort()).toEqual(['actor','hash','updated','version']);
  expect(JSON.stringify(metadata)).not.toContain('private');
});


test('a 401 during owner validation ends the matching session', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator'); await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.route('**/api/auth/me', route => route.fulfill({status:401, json:{detail:'expired'}}));
  const rejected = page.waitForResponse(response => response.url().includes('/api/auth/me') && response.status() === 401);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await rejected;
  await expect(page.getByText('Сессия завершилась. Войдите заново.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sm-techno-auth-session'))).toBeNull();
});
