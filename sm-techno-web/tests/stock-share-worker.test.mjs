import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../public/stock-share/worker.js', import.meta.url), 'utf8');
function harness() {
  let stored, now=1000000, nextTimer=0, markerStatus=200, unregisters=0;
  const listeners={}, timers=new Map();
  const indexedDB={open() { const request={}; queueMicrotask(() => { const db={createObjectStore(){}, close(){}, transaction(){ const tx={}; const store={get(){ return operation(() => stored); },put(value){ return operation(() => { stored=structuredClone(value); }); },delete(){ return operation(() => { stored=undefined; }); }}; function operation(fn){ const r={}; queueMicrotask(() => { r.result=fn(); r.onsuccess?.(); tx.oncomplete?.(); }); return r; } return Object.assign(tx,{objectStore:()=>store}); }}; request.result=db; request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; }};
  const FakeDate=class extends Date { static now(){return now;} };
  let markerCalled=()=>{};
  const self={location:{origin:'https://app.test'},registration:{unregister:async()=>{unregisters++;}},clients:{get:async id=>({id,url:'https://app.test/stock',type:'window'}),claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const context={self,indexedDB,crypto,Request,Response,Blob,File,URL,TextEncoder,AbortSignal,Uint8Array,Date:FakeDate,fetch:async()=>{markerCalled(); return markerStatus===200?Response.json({version:1}):new Response('',{status:markerStatus});},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,due:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(script,context);
  async function message(type, fields={}) { let result; let finish; const done=new Promise(resolve=>{finish=resolve;}); const event={data:{type,...fields},source:{id:'client',type:'window'},ports:[{postMessage:value=>{result=value;}}],waitUntil:p=>{p.then(finish);}}; listeners.message(event); await done; return result; }
  async function sync(owner, previous) { return message('sync',{owner,previous}); }
  async function state(){ return (await message('owner')).owner; }
  async function receive(request){ let settled, finishResponse, finishLifetime; const response=new Promise(resolve=>{finishResponse=resolve;}); const lifetime=new Promise(resolve=>{finishLifetime=resolve;}); listeners.fetch({request,waitUntil:p=>{p.then(finishLifetime);},respondWith:p=>{p.then(finishResponse);}}); const result=await response; void lifetime.then(()=>{settled=true;}); return {result,lifetime,get settled(){return !!settled;}}; }
  async function formRequest(text='secret') { const form=new FormData();form.set('text',text);return new Request('https://app.test/stock-share/receive',{method:'POST',body:form}); }
  function tick(ms){now+=ms;for(const [id,timer] of timers) if(timer.due<=now){timers.delete(id);timer.fn();}}
  return {message,sync,state,receive,formRequest,tick,setMarker:status=>{markerStatus=status;},onMarker:fn=>{markerCalled=fn;},get unregisters(){return unregisters;}};
}
const A={actor:1,hash:'a'.repeat(64),version:1,updated:1}, B={actor:2,hash:'b'.repeat(64),version:1,updated:2};
const nonce=response=>new URL(response.headers.get('location')).searchParams.get('share');
test('delayed body cannot be bound to a different login; stale CAS cannot overwrite newer owner', async()=>{
  const h=harness(); assert.equal((await h.sync(A,null)).ok,true); const old=await h.state();
  const template=await h.formRequest('private A'); const body=new Uint8Array(await template.arrayBuffer()); let release; const gate=new Promise(r=>{release=r;}); let marker; const captured=new Promise(r=>{marker=r;}); h.onMarker(marker);
  const stream=new ReadableStream({async pull(controller){await gate;controller.enqueue(body);controller.close();}});
  const request=new Request(template.url,{method:'POST',headers:{'Content-Type':template.headers.get('Content-Type')},body:stream,duplex:'half'});
  const pending=h.receive(request); await captured; assert.equal((await h.sync(B,old)).ok,true); const current=await h.state(); assert.equal((await h.sync(A,old)).ok,false); assert.equal((await h.state()).actor,2);
  release(); const result=await pending; assert.equal(nonce(result.result),'login'); await result.lifetime;
  assert.equal((await h.message('claim',{owner:B,nonce:'anything'})).ok,false);
  assert.equal((await h.sync(A,current)).ok,true); assert.equal((await h.state()).actor,1);
});
test('same-owner sync preserves pending; cancel, logout, TTL and rollback settle and prevent claim', async()=>{
  const h=harness(); await h.sync(A,null); let owner=await h.state();
  let pending=await h.receive(await h.formRequest()); let id=nonce(pending.result);
  assert.equal((await h.sync(A,owner)).ok,true); assert.equal((await h.message('claim',{owner:A,nonce:id})).payload,'secret'); await pending.lifetime;
  pending=await h.receive(await h.formRequest()); id=nonce(pending.result); assert.equal((await h.message('cancel',{owner:A,nonce:id})).ok,true); await pending.lifetime; assert.equal((await h.message('claim',{owner:A,nonce:id})).ok,false);
  pending=await h.receive(await h.formRequest()); id=nonce(pending.result); await h.message('clear',{owner:A}); await pending.lifetime; assert.equal((await h.message('claim',{owner:A,nonce:id})).ok,false);
  await h.sync(A,null); owner=await h.state(); pending=await h.receive(await h.formRequest()); id=nonce(pending.result); h.tick(120000); await pending.lifetime; assert.equal((await h.message('claim',{owner:A,nonce:id})).ok,false);
  pending=await h.receive(await h.formRequest()); id=nonce(pending.result); h.setMarker(404); const failure=await h.receive(await h.formRequest()); assert.equal(nonce(failure.result),'unavailable'); await pending.lifetime; assert.equal(h.unregisters,1); assert.equal((await h.message('claim',{owner:A,nonce:id})).ok,false);
  assert.equal((await h.message('clear',{owner:B})).ok,true); assert.equal((await h.state()).actor,1);
});
