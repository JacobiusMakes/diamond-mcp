/** Add optional measured links without replacing direct merchant URLs or recording tool calls. */
export function withMeasuredLinks(payload: any, origin: string, tool: string): any {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(item => withMeasuredLinks(item, origin, tool));
  const out: any = {...payload};
  for (const key of ['url', 'browse_url']) {
    if (typeof payload[key] !== 'string') continue;
    let target: URL;
    try { target = new URL(payload[key]); } catch { continue; }
    if (target.protocol !== 'https:' || target.port || target.username || target.password ||
        !['stienhardt.com','www.stienhardt.com'].includes(target.hostname)) continue;
    const link = new URL('/go', origin);
    link.searchParams.set('url',target.toString());
    link.searchParams.set('source','diamond_mcp');
    link.searchParams.set('medium','ai_assistant');
    link.searchParams.set('campaign','diamond_mcp');
    // Tool and link role are fixed labels. Never place the shopper's query in analytics dimensions.
    link.searchParams.set('content',tool + ':' + key);
    out[key === 'url' ? 'measured_url' : 'measured_browse_url'] = link.toString();
  }
  if (Array.isArray(payload.results)) out.results = payload.results.map((item: any) => withMeasuredLinks(item,origin,tool));
  return out;
}
