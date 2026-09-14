import assert from 'node:assert/strict';
import {withMeasuredLinks} from '../src/measurement.ts';
const input={query:'private shopper words',results:[{url:'https://stienhardt.com/products/ring?variant=42&utm_source=diamond_mcp'}],browse_url:'https://stienhardt.com/collections/lab-diamonds?shape=Oval'};
const output=withMeasuredLinks(input,'https://mcp.example','search_inventory');
assert.equal(output.results[0].url,input.results[0].url);
assert.equal('measured_url' in input.results[0],false);
const link=new URL(output.results[0].measured_url);
assert.equal(link.pathname,'/go');
assert.equal(link.searchParams.get('url'),input.results[0].url);
assert.equal(link.searchParams.get('content'),'search_inventory:url');
assert.equal(output.results[0].measured_url.includes('private'),false);
assert.ok(output.measured_browse_url);
for(const url of ['https://evil.example/x','http://stienhardt.com/x','https://user@stienhardt.com/x','https://stienhardt.com:8443/x']) {
  assert.equal('measured_url' in withMeasuredLinks({url},'https://mcp.example','get_product'),false);
}
console.log('PASS measured links preserve variant and direct URL, use fixed labels, reject unsafe destinations');
