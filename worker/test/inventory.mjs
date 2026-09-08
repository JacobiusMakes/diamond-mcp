import assert from 'node:assert/strict';
import {diamondIntent,saleableDiamond,publicDiamond,selectVariant,checkedCatalogProduct,searchDiamonds,diamondBySku} from '../src/inventory.ts';
const env={STORE_ORIGIN:'https://stienhardt.com',STOREFRONT_READ_AUTH:'synthetic-test-auth'};
const diamond={sku:'TEST-1',is_active:true,is_visible:true,is_sold:false,is_on_hold:false,
  shape:'Round',carat:2.02,color:'D',clarity:'VS1',lab:'IGI',sale_price:100,title:'Synthetic test diamond'};
const product={title:'Everyday Band',type:'Ring',variants:[
  {id:1,title:'14K Yellow Gold',available:true,price:10000},
  {id:2,title:'Platinum',available:true,price:20000},
  {id:3,title:'18K White Gold',available:false,price:30000}]};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
await test('single weight has explicit narrow bounds',()=>{const f=diamondIntent('2 carat round');assert.equal(f.carat_min,2);assert.equal(f.carat_max,2.1);});
await test('range, budget, color, clarity, and lab parse separately',()=>{
  const f=diamondIntent('2-3 carat Dutch Marquise under $2,000 D color VS1 IGI');
  assert.deepEqual(f,{shape:'Dutch Marquise',carat_min:2,carat_max:3,price_max:2000,clarity:'VS1',color:'D',lab:'IGI'});
});
await test('jewelry intent remains on catalog path',()=>{assert.equal(diamondIntent('oval platinum engagement ring'),null);assert.equal(diamondIntent('tennis bracelet'),null);});
await test('invalid weight range is rejected',()=>{assert.throws(()=>diamondIntent('3 to 2 carat oval'));assert.throws(()=>diamondIntent('25 carat pear'));});
await test('saleable record passes',()=>assert.equal(saleableDiamond(diamond),true));
for(const [key,value] of [['is_active',false],['is_visible',false],['is_sold',true],['is_on_hold',true],['sku','../bad']])
  await test('stock exclusion '+key,()=>assert.equal(saleableDiamond({...diamond,[key]:value}),false));
await test('missing stock flags fail closed',()=>assert.equal(saleableDiamond({sku:'TEST-1',is_active:true}),false));
await test('internal supplier fields never enter results',()=>{
  const output=publicDiamond({...diamond,vendor_cost:12,api_response:{sensitive:'private'},remarks:'private'},env);
  assert(!JSON.stringify(output).includes('private'));assert(!('vendor_cost' in output));
  assert.equal(new URL(output.url).searchParams.get('sku'),'TEST-1');
});
await test('platinum request selects platinum instead of default yellow gold',()=>assert.equal(selectVariant(product,'platinum wedding band').id,2));
await test('unavailable metal cannot be substituted',()=>assert.equal(selectVariant(product,'18k white gold band'),null));
await test('unrelated product categories are excluded',()=>assert.equal(selectVariant(product,'tennis bracelet'),null));
await test('variant link preserves attribution and uses quoted currency',async()=>{
  globalThis.fetch=async()=>{throw new Error('Jewelry should not need another catalog request');};
  const p={id:'gid://shopify/Product/42',url:'https://stienhardt.com/products/everyday-band?utm_source=test',
    title:'Everyday Band',variants:product.variants.map(v=>({...v,id:'gid://shopify/ProductVariant/'+v.id,
      availability:{available:v.available},price:{amount:v.price,currency:'USD'}}))};
  const item=await checkedCatalogProduct(p,env,'platinum band');
  assert.equal(new URL(item.url).searchParams.get('variant'),'2');assert.equal(new URL(item.url).searchParams.get('utm_source'),'test');
  assert.equal(item.selected_variant,'Platinum');assert.equal(item.price,'200.00 USD');
});
await test('off-domain catalog link is never fetched',async()=>{
  globalThis.fetch=async()=>{throw new Error('must not fetch');};
  assert.equal(await checkedCatalogProduct({url:'https://example.invalid/products/item'},env),null);
});
await test('missing supplier record excludes a carrier',async()=>{
  globalThis.fetch=async()=>new Response('',{status:404});
  assert.equal(await checkedCatalogProduct({url:'https://stienhardt.com/products/carrier',title:'1 Carat Round Lab Grown Diamond',variants:[{sku:'MISSING'}]},env),null);
});
await test('stock endpoint failure is not empty inventory',async()=>{
  globalThis.fetch=async()=>new Response('',{status:503});
  await assert.rejects(()=>searchDiamonds(env,diamondIntent('2 carat round'),5));
});
await test('stock search enforces returned filters as well as request filters',async()=>{
  globalThis.fetch=async()=>Response.json({Diamonds:{data:[diamond,{...diamond,sku:'HELD',is_on_hold:true},{...diamond,sku:'PEAR',shape:'Pear'},{...diamond,sku:'SMALL',carat:1}]}});
  const rows=await searchDiamonds(env,diamondIntent('2 carat round'),5);assert.equal(rows.length,1);assert.equal(rows[0].sku,'TEST-1');
});
await test('SKU lookup accepts only active visible unsold unheld diamonds',async()=>{
  globalThis.fetch=async()=>Response.json({Diamond:{...diamond,is_sold:true}});assert.equal(await diamondBySku(env,'TEST-1'),null);
});
console.log(JSON.stringify({passed,failed:0}));
