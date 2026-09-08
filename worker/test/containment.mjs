// Scans a wrangler dry-run bundle for anything that must never ship in the public Worker:
// private service endpoints, credential names, or an Authorization header on an outbound fetch.
// Usage: node worker/test/containment.mjs <path-to-dry-run-index.js>
import { readFileSync } from 'node:fs';
const path = process.argv[2];
if (!path) { console.error('usage: node worker/test/containment.mjs <dry-run index.js>'); process.exit(2); }
const bundle = readFileSync(path, 'utf8');
const forbidden = [
  [/supabase\.co/i, 'a Supabase host'],
  [/functions\/v1\//i, 'an edge-function path'],
  [/STOREFRONT_READ/i, 'the removed storefront credential name'],
  [/x-api-key/i, 'an API key header'],
  [/\bapikey\b/i, 'an apikey field'],
  [/shpat_[a-f0-9]{8,}/i, 'a Shopify admin token'],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/, 'a bearer token literal'],
];
const failures = [];
for (const [re, label] of forbidden) {
  const m = bundle.match(re);
  if (m) failures.push(`${label}: ...${bundle.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' ')}...`);
}
// Outbound fetches may only target the store, its UCP endpoint, or a value the Worker reads from env.
const hosts = [...bundle.matchAll(/fetch\(\s*["'`](https?:\/\/[^"'`\/]+)/g)].map((m) => m[1]);
for (const h of hosts) {
  if (!/stienhardt\.com$|myshopify\.com$/.test(new URL(h).hostname)) failures.push(`outbound fetch to ${h}`);
}
if (failures.length) {
  console.error('CONTAINMENT FAILED');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log(`containment ok: ${bundle.length} bytes scanned, ${hosts.length} literal fetch hosts, nothing private`);
