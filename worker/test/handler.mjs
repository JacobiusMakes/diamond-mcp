// Offline exercise of the Worker's request handler against a wrangler dry-run bundle.
// No network: the UCP endpoint is set to an unroutable origin and never reached by these cases.
// Usage: node worker/test/handler.mjs <path-to-dry-run-index.js>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const bundlePath = process.argv[2];
if (!bundlePath) { console.error('usage: node worker/test/handler.mjs <dry-run index.js>'); process.exit(2); }
const worker = (await import(pathToFileURL(bundlePath).href)).default;
const puts = [];
const env = {
  STORE_ORIGIN: 'https://stienhardt.com',
  UCP_ENDPOINT: 'https://example.invalid/api/ucp/mcp',
  CLICK_COUNTS: { put: async (k, v) => { puts.push([k, v]); } },
};
const waited = [];
const ctx = { waitUntil: (p) => { waited.push(p); } };
const H = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const post = (body, raw = false) => worker.fetch(new Request('https://w.test/mcp', { method: 'POST', headers: H, body: raw ? body : JSON.stringify(body) }), env, ctx);
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

await test('null body answers -32600, not a runtime error', async () => {
  const r = await post('null', true); assert.equal(r.status, 400);
  const j = await r.json(); assert.equal(j.error.code, -32600); assert.equal(j.id, null);
});
await test('scalar and empty-batch bodies answer -32600', async () => {
  for (const raw of ['42', '"x"', '[]']) { const r = await post(raw, true); assert.equal(r.status, 400); assert.equal((await r.json()).error.code, -32600); }
});
await test('a batch above the cap is rejected before any work', async () => {
  const r = await post(Array.from({ length: 11 }, (_, i) => rpc(i, 'ping'))); assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /batch limit/);
});
await test('a batch within the cap is answered element by element, invalid members included', async () => {
  const r = await post([rpc(1, 'ping'), null, { jsonrpc: '2.0', id: 3 }, rpc(4, 'ping')]);
  const out = await r.json(); assert.equal(out.length, 4);
  assert.deepEqual(out[0].result, {}); assert.equal(out[1].error.code, -32600); assert.equal(out[2].error.code, -32600); assert.equal(out[2].id, 3);
});
await test('a message without an id is a notification: 202 and no body', async () => {
  const r = await post({ jsonrpc: '2.0', method: 'ping' }); assert.equal(r.status, 202); assert.equal(await r.text(), '');
});
await test('initialize echoes a supported protocol version and falls back for unknown ones', async () => {
  for (const [offered, expected] of [['2025-03-26', '2025-03-26'], ['2024-11-05', '2024-11-05'], ['1999-01-01', '2025-06-18'], [undefined, '2025-06-18']]) {
    const r = await post(rpc(1, 'initialize', { protocolVersion: offered, capabilities: {}, clientInfo: { name: 't', version: '1' } }));
    assert.equal((await r.json()).result.protocolVersion, expected);
  }
});
await test('resources and prompts lists are empty lists, not method-not-found', async () => {
  for (const [m, key] of [['resources/list', 'resources'], ['prompts/list', 'prompts'], ['resources/templates/list', 'resourceTemplates']]) {
    const r = await post(rpc(1, m)); const j = await r.json(); assert.deepEqual(j.result[key], []);
  }
});
await test('tools/list exposes eleven tools', async () => {
  const r = await post(rpc(1, 'tools/list')); const j = await r.json(); assert.equal(j.result.tools.length, 11);
});
await test('inherited object names are not tools', async () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 42, null]) {
    const r = await post(rpc(1, 'tools/call', { name, arguments: {} })); const j = await r.json();
    assert.equal(j.error && j.error.code, -32602, 'name ' + String(name));
  }
});
await test('array arguments are ignored rather than crashing a tool', async () => {
  const r = await post(rpc(1, 'tools/call', { name: 'faceup_size', arguments: [1, 2] })); const j = await r.json();
  assert.equal(j.result.isError, true);
});
await test('faceup_size rejects boolean, absurd, and non-numeric carat values', async () => {
  for (const carat of [true, 'abc', -1, 0, 1e9, '1e3', null]) {
    const r = await post(rpc(1, 'tools/call', { name: 'faceup_size', arguments: { shape: 'round', carat } })); const j = await r.json();
    assert.equal(j.result.isError, true, 'carat ' + String(carat));
  }
  const ok = await post(rpc(1, 'tools/call', { name: 'faceup_size', arguments: { shape: 'dutch_marquise', carat: '1.5' } }));
  assert.equal((await ok.json()).result.isError, false);
});
await test('search_inventory without a query is a tool error before any upstream call', async () => {
  const r = await post(rpc(1, 'tools/call', { name: 'search_inventory', arguments: {} })); const j = await r.json();
  assert.equal(j.result.isError, true); assert.match(j.result.content[0].text, /query is required/);
});
await test('OPTIONS preflight is a bodiless 204 with CORS headers', async () => {
  const r = await worker.fetch(new Request('https://w.test/mcp', { method: 'OPTIONS' }), env, ctx);
  assert.equal(r.status, 204); assert.equal(await r.text(), ''); assert.equal(r.headers.get('access-control-allow-origin'), '*');
});
await test('/go rejects other hosts, userinfo, ports, and non-https', async () => {
  for (const u of ['https://evil.example/', 'https://stienhardt.com@evil.example/', 'https://stienhardt.com:8443/x', 'http://stienhardt.com/x', 'https://stienhardt.com.evil.example/']) {
    const r = await worker.fetch(new Request('https://w.test/go?url=' + encodeURIComponent(u)), env, ctx);
    assert.equal(r.status, 400, u);
  }
  assert.equal(puts.length, 0);
});
await test('/go ignores HEAD and declared previews but records a tagged GET', async () => {
  const dest = encodeURIComponent('https://stienhardt.com/collections/lab-diamonds?utm_source=x');
  const untagged = await worker.fetch(new Request('https://w.test/go?url=' + dest), env, ctx);
  assert.equal(untagged.status, 302); assert.equal(puts.length, 0);
  const head = await worker.fetch(new Request('https://w.test/go?url=' + dest + '&source=hn&campaign=launch', { method: 'HEAD' }), env, ctx);
  assert.equal(head.status, 302); assert.match(head.headers.get('location'), /^https:\/\/stienhardt\.com\/collections\/lab-diamonds\?utm_source=x$/);
  assert.equal(waited.length, 0); assert.equal(puts.length, 0);
  for (const header of ['purpose','sec-purpose']) {
    const preview = await worker.fetch(new Request('https://w.test/go?url=' + dest + '&source=hn', {headers:{[header]:'prefetch'}}), env, ctx);
    assert.equal(preview.status,302); assert.equal(waited.length,0);
  }
  await worker.fetch(new Request('https://w.test/go?url=' + dest + '&source=hn&campaign=launch'), env, ctx);
  assert.equal(waited.length, 1); await Promise.all(waited); assert.equal(puts.length, 1);
  const event = JSON.parse(puts[0][1]); assert.deepEqual(Object.keys(event).sort(), ['campaign', 'capturedAt', 'content', 'destinationPath', 'medium', 'source']);
});
await test('analytics storage failures do not break redirects with or without a context', async () => {
  const url='https://w.test/go?url='+encodeURIComponent('https://stienhardt.com/products/ring?variant=42')+'&source=diamond_mcp';
  for(const put of [()=>{throw new Error('sync storage failure');},async()=>{throw new Error('async storage failure');}]) {
    for(const context of [ctx,undefined]) {
      const response=await worker.fetch(new Request(url),{...env,CLICK_COUNTS:{put}},context);
      assert.equal(response.status,302); assert.match(response.headers.get('location'),/variant=42/);
    }
  }
  await Promise.all(waited);
});
await test('/agent-profile.json is the repository profile plus profile_url', async () => {
  const r = await worker.fetch(new Request('https://w.test/agent-profile.json'), env, ctx); const j = await r.json();
  assert.ok(j.ucp && j.ucp.capabilities['dev.ucp.shopping.fulfillment']); assert.equal(j.profile_url, 'https://w.test/agent-profile.json');
});
await test('catalog search enforces USD budget and supplies optional measured links without logging a visit', async () => {
  const originalFetch=globalThis.fetch;
  const before=puts.length;
  globalThis.fetch=async()=>new Response(JSON.stringify({result:{content:[{type:'text',text:JSON.stringify({products:[
    ...[100000,200001].map((amount,i)=>({id:'gid://shopify/Product/'+(i+1),title:'2 Carat Oval Lab Grown Diamond',url:'https://stienhardt.com/products/oval-'+i,variants:[{id:'gid://shopify/ProductVariant/'+i,price:{amount,currency:'USD'}}]})),
    {id:'gid://shopify/Product/3',title:'2 Carat Oval Lab Grown Diamond',url:'https://stienhardt.com/products/no-price',variants:[]}
  ]})}]}}),{headers:{'content-type':'application/json'}});
  try {
    const r=await post(rpc(1,'tools/call',{name:'search_inventory',arguments:{query:'2 carat oval under $2000 D color'}}));
    const j=await r.json(); assert.equal(j.result.isError,false);
    const p=JSON.parse(j.result.content[0].text);
    assert.equal(p.count,1);assert.equal(p.results[0].price,'1000.00 USD');
    assert.deepEqual(p.filters_applied,['shape','carat','price_max_usd']);assert.deepEqual(p.filters_unverified,['color']);
    assert.equal(p.results[0].availability_verified,false);
    const measured=new URL(p.results[0].measured_url);
    assert.equal(measured.searchParams.get('url'),p.results[0].url);assert.equal(puts.length,before);
  } finally { globalThis.fetch=originalFetch; }
});
await test('comparison is callable over MCP and malformed comparisons are tool errors', async () => {
  const r = await post(rpc(1,'tools/call',{name:'compare_diamonds',arguments:{stones:[{label:'A',carat:2,price:1000,currency:'USD'},{label:'B',carat:3,price:1800,currency:'USD'}]}}));
  const j=await r.json(); assert.equal(j.result.isError,false);
  const p=JSON.parse(j.result.content[0].text); assert.equal(p.stones[0].price_per_carat,500); assert.equal(p.differences[0].price_difference,800);
  const bad=await post(rpc(2,'tools/call',{name:'compare_diamonds',arguments:{stones:[{label:'A'}]}}));
  assert.equal((await bad.json()).result.isError,true);
});
console.log(JSON.stringify({ passed, failed: 0 }));
