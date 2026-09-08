/* Catalog selection only. Do not call private stock services or reuse browser credentials. */
export interface InventoryEnv {
  STORE_ORIGIN: string;
}
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
export function diamondBrowseUrl(env: InventoryEnv, filters: any = {}, sku=''): string {
  const url = new URL('/collections/lab-diamonds', env.STORE_ORIGIN);
  if (/^[A-Za-z0-9._-]{1,100}$/.test(sku)) {
    url.pathname='/products/diamonds';
    url.searchParams.set('sku',sku);
  } else {
    for (const [key,value] of Object.entries({shape:filters.shape,caratMin:filters.carat_min,
      caratMax:filters.carat_max,priceMax:filters.price_max,color:filters.color,clarity:filters.clarity,lab:filters.lab})) {
      if(value !== undefined && value !== null && value !== '') url.searchParams.set(key,String(value));
    }
  }
  return url.toString();
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
// Apply the parsed loose-diamond filters to a listing title. Carrier titles state carat and shape
// ("2 Carat Dutch Marquise IGI Certified Lab Grown Diamond"); color, clarity, and lab are not in titles.
export function matchesDiamondFilters(title: unknown, filters: any): boolean {
  if (!filters) return true;
  const t = normalize(title);
  if (filters.shape && !t.includes(String(filters.shape).toLowerCase())) return false;
  if (filters.carat_min !== null && filters.carat_min !== undefined) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:carats?|ct)\b/);
    if (!m) return false;
    const c = Number(m[1]);
    if (c < filters.carat_min - 1e-9 || c > filters.carat_max + 1e-9) return false;
  }
  return true;
}
export async function checkedCatalogProduct(p: any, env: InventoryEnv, query='', allowLoose=false): Promise<any | null> {
  const raw=p.url || (p.handle ? new URL('/products/'+p.handle,env.STORE_ORIGIN).toString() : '');
  let url: URL;
  try {url=new URL(raw); } catch {return null;}
  if (!['stienhardt.com','www.stienhardt.com'].includes(url.hostname) || url.protocol !== 'https:' ||
      !/^\/products\/[a-z0-9-]+\/?$/i.test(url.pathname)) return null;
  // Use Shopify's UCP response for jewelry. Shopify blocks Ajax catalog requests
  // from the hosted Worker even when those requests work in a shopper's browser.
  const title=normalize(p.title);
  const loose=/\bdiamonds?\b/.test(title) && !/\b(rings?|settings?|bands?|earrings?|studs?|bracelets?|necklaces?|pendants?)\b/.test(title);
  if(url.pathname.replace(/\/$/,'') === '/products/diamonds') return null;
  // Shopify carrier availability is not a verified loose-diamond stock check, so loose stones are
  // returned only as public catalog listings, flagged unverified, and only when the caller asks.
  if(loose) {
    if(!allowLoose) return null;
    const first=(p.variants||[])[0] || {};
    const price=first.price || p.price;
    return {id:p.id,title:p.title,url:url.toString(),
      price:price && typeof price.amount==='number' && price.currency ? (price.amount/100).toFixed(2)+' '+price.currency : null,
      image:(first.media?.[0] || p.media?.[0])?.url || undefined, variant_id:first.id,
      availability_verified:false, availability_source:'shopify_ucp_catalog',
      availability_note:'Listed in the public catalog. Loose-diamond stock is verified on the product page, not by this tool.'};
  }
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
