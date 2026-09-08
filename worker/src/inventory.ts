/* Read public storefront stock, never expose supplier records or cost fields. */
export interface InventoryEnv {
  STORE_ORIGIN: string;
  STOREFRONT_READ_AUTH?: string;
}
const STOCK_ORIGIN = 'https://pxixbvvukwwmhmbyzdfu.supabase.co/functions/v1/storefront-api';
const SHAPES = ['Dutch Marquise', 'Elongated Hexagon', 'Round', 'Oval', 'Pear', 'Princess',
  'Emerald', 'Cushion', 'Radiant', 'Asscher', 'Heart', 'Marquise'];
const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
export function diamondIntent(query: string): any | null {
  const text = normalize(query);
  if (/\b(rings?|settings?|bands?|earrings?|studs?|bracelets?|necklaces?|pendants?|natural|mined)\b/.test(text)) return null;
  const shape = SHAPES.find(s => text.includes(s.toLowerCase()));
  if (!shape && !/\b(diamonds?|carats?|ct)\b/.test(text)) return null;
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:to|through)\s*(\d+(?:\.\d+)?)\s*(?:carats?|ct)\b/)
    || String(query).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:carats?|ct)\b/i);
  const single = text.match(/(\d+(?:\.\d+)?)\s*(?:carats?|ct)\b/);
  let low = range ? Number(range[1]) : single ? Number(single[1]) : null;
  // A single weight is a narrow search, disclosed in the returned filters.
  let high = range ? Number(range[2]) : low !== null ? Math.round((low + .1) * 100) / 100 : null;
  if (low !== null && (!(low > 0) || low > 20 || high! < low || high! > 20)) throw new Error('Carat range must be between 0 and 20.');
  const maximum = text.match(/(?:under|below|up to|at most|budget(?: of)?)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  const maxPrice = maximum ? Number(maximum[1].replace(/,/g,'')) : null;
  const clarity = text.match(/\b(fl|if|vvs1|vvs2|vs1|vs2|si1|si2)\b/);
  const color = text.match(/\b([d-j])\s*(?:color|colour)\b/);
  const lab = text.match(/\b(igi|gia|gcal)\b/);
  return {shape:shape || '', carat_min:low, carat_max:high,
    price_max:Number.isFinite(maxPrice) && maxPrice! > 0 ? maxPrice : null,
    clarity:clarity ? clarity[1].toUpperCase() : '', color:color ? color[1].toUpperCase() : '',
    lab:lab ? lab[1].toUpperCase() : ''};
}
export function saleableDiamond(d: any): boolean {
  return !!d && d.is_active === true && d.is_visible === true && d.is_sold === false &&
    d.is_on_hold === false && /^[A-Za-z0-9._-]{1,100}$/.test(String(d.sku || ''));
}
export function publicDiamond(d: any, env: InventoryEnv): any {
  const url = new URL('/products/diamonds', env.STORE_ORIGIN);
  url.searchParams.set('sku', d.sku);
  const amount = Number(d.sale_price) > 0 ? Number(d.sale_price) : Number(d.original_price);
  return {id:'stienhardt:diamond:' + d.sku, title:d.title || `${d.carat} Carat ${d.shape} Lab Grown Diamond`,
    url:url.toString(), price:Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) + ' USD' : null,
    available:true, image:d.cover_pic || undefined, sku:d.sku,
    shape:d.shape, carat:d.carat, color:d.color, clarity:d.clarity, lab:d.lab,
    availability_source:'storefront_inventory', availability_checked_at:new Date().toISOString()};
}
async function stock(env: InventoryEnv, path: string, body?: any): Promise<any> {
  if (!env.STOREFRONT_READ_AUTH) throw new Error('Live diamond availability is temporarily unavailable.');
  const response = await fetch(STOCK_ORIGIN + path, {method:body ? 'POST' : 'GET',
    headers:{Authorization:env.STOREFRONT_READ_AUTH, Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(6000)});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Live diamond availability is temporarily unavailable.');
  return response.json();
}
export async function diamondBySku(env: InventoryEnv, sku: string): Promise<any | null> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(sku)) return null;
  const data = await stock(env, '/diamond/' + encodeURIComponent(sku) + '?type=Ring');
  return saleableDiamond(data?.Diamond) ? publicDiamond(data.Diamond, env) : null;
}
export async function searchDiamonds(env: InventoryEnv, filters: any, limit: number): Promise<any[]> {
  const body = {type:'LabGrown', diamondtype:filters.shape, diamondcolor:filters.color,
    diamondclarity:filters.clarity, diamondcut:'', reportby:filters.lab,
    caratfrom:filters.carat_min ?? '', caratto:filters.carat_max ?? '',
    pricefrom:'', priceto:filters.price_max ?? '', lwfrom:'',lwto:'',depthfrom:'',depthto:'',
    tablefrom:'',tableto:'',polish:'',symmetry:'',quickship:'0',featureddeal:'0',certnum:'',sortby:'Recommended-ASC'};
  const payload = await stock(env, '/search?page=1', body);
  const rows = Array.isArray(payload?.Diamonds) ? payload.Diamonds : payload?.Diamonds?.data;
  if (!Array.isArray(rows)) throw new Error('Live diamond search returned an invalid response.');
  return rows.filter(saleableDiamond).filter((d: any) => {
    const amount=Number(d.sale_price)>0 ? Number(d.sale_price) : Number(d.original_price);
    return (!filters.shape || normalize(d.shape) === normalize(filters.shape)) &&
      (filters.carat_min === null || Number(d.carat) >= filters.carat_min) &&
      (filters.carat_max === null || Number(d.carat) <= filters.carat_max) &&
      (!filters.price_max || (amount > 0 && amount <= filters.price_max)) &&
      (!filters.clarity || normalize(d.clarity) === normalize(filters.clarity)) &&
      (!filters.color || normalize(d.color) === normalize(filters.color)) &&
      (!filters.lab || normalize(d.lab) === normalize(filters.lab));
  }).slice(0,limit).map((d: any)=>publicDiamond(d,env));
}
export function selectVariant(product: any, query: string): any | null {
  const text = normalize(query), title = normalize(product.title);
  const category = text.match(/\b(bracelets?|necklaces?|earrings?|studs?|bands?|settings?)\b/);
  if (category) {
    const singular=category[1].replace(/s$/,'');
    if (!title.includes(singular) && !(singular === 'stud' && title.includes('earring'))) return null;
  }
  const metal = text.includes('platinum') ? 'platinum' : ['white gold','yellow gold','rose gold'].find(x=>text.includes(x));
  const purity = text.match(/\b(14|18)\s*(?:k|karat)\b/);
  const shape = SHAPES.find(s=>text.includes(s.toLowerCase()));
  return (product.variants || []).find((v: any)=> {
    const option = normalize(v.title).replace(/\b(14|18)\s*k\b/g,'$1k');
    return v.available === true && (!metal || option.includes(metal)) &&
      (!purity || option.includes(purity[1]+'k')) &&
      (!shape || title.includes(shape.toLowerCase()) || option.includes(shape.toLowerCase()));
  }) || null;
}
export async function checkedCatalogProduct(p: any, env: InventoryEnv, query=''): Promise<any | null> {
  const raw=p.url || (p.handle ? new URL('/products/'+p.handle,env.STORE_ORIGIN).toString() : '');
  let url: URL;
  try {url=new URL(raw); } catch {return null;}
  if (!['stienhardt.com','www.stienhardt.com'].includes(url.hostname) || url.protocol !== 'https:' ||
      !/^\/products\/[a-z0-9-]+\/?$/i.test(url.pathname)) return null;
  // Use Shopify's UCP response for jewelry. Shopify blocks Ajax catalog requests
  // from the hosted Worker even when those requests work in a shopper's browser.
  const title=normalize(p.title);
  const loose=/\bdiamonds?\b/.test(title) && !/\b(rings?|settings?|bands?|earrings?|studs?|bracelets?|necklaces?|pendants?)\b/.test(title);
  if(loose) return diamondBySku(env,p.variants?.[0]?.sku || '');
  const product={...p,variants:(p.variants||[]).map((v:any)=>({...v,available:v.availability?.available===true}))};
  const variant=selectVariant(product,query);
  if(!variant) return null;
  const price=variant.price;
  url.searchParams.set('variant',String(variant.id).split('/').pop()!);
  return {id:p.id,title:product.title,url:url.toString(),available:true,
    price:price && typeof price.amount==='number' && price.currency ? (price.amount/100).toFixed(2)+' '+price.currency : null,
    image:(variant.media?.[0] || product.media?.[0])?.url || undefined,
    variant_id:variant.id, selected_variant:variant.title,
    availability_source:'shopify_ucp',availability_checked_at:new Date().toISOString(),
    options:(product.variants||[]).map((v:any)=>({variant_id:v.id,title:v.title,available:v.available}))};
}
