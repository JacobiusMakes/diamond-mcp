import assert from 'node:assert/strict';
import {diamondIntent,diamondBrowseUrl,selectVariant,checkedCatalogProduct} from '../src/inventory.ts';
const env={STORE_ORIGIN:'https://stienhardt.com'};
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
await test('diamond browsing uses a first-party URL without requesting stock',()=>{
  globalThis.fetch=async()=>{throw new Error('must not fetch');};
  const url=new URL(diamondBrowseUrl(env,diamondIntent('2 carat round')));
  assert.equal(url.origin,env.STORE_ORIGIN);assert.equal(url.searchParams.get('shape'),'Round');
  assert.equal(url.searchParams.get('caratMin'),'2');assert.equal(url.searchParams.get('caratMax'),'2.1');
});
await test('valid legacy SKU remains a website link only',()=>{
  const url=new URL(diamondBrowseUrl(env,{},'TEST-1'));
  assert.equal(url.pathname,'/products/diamonds');assert.equal(url.searchParams.get('sku'),'TEST-1');
});
await test('invalid SKU cannot change the destination or inject URL parameters',()=>{
  for(const sku of ['//example.invalid','../secret','A&redirect=https://example.invalid','x'.repeat(101)]) {
    const url=new URL(diamondBrowseUrl(env,{},sku));
    assert.equal(url.origin,env.STORE_ORIGIN);assert.equal(url.pathname,'/collections/lab-diamonds');
    assert.equal(url.search,'');
  }
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
await test('loose-diamond carrier is excluded without a stock-service request',async()=>{
  globalThis.fetch=async()=>{throw new Error('must not fetch');};
  assert.equal(await checkedCatalogProduct({url:'https://stienhardt.com/products/carrier',title:'1 Carat Round Lab Grown Diamond',variants:[{sku:'MISSING'}]},env),null);
});
await test('generic diamond product cannot be mistaken for verified jewelry',async()=>{
  globalThis.fetch=async()=>{throw new Error('must not fetch');};
  assert.equal(await checkedCatalogProduct({url:'https://stienhardt.com/products/diamonds',title:'Catalog item',variants:product.variants},env),null);
});
console.log(JSON.stringify({passed,failed:0}));
