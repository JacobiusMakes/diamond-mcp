/**
 * diamond-mcp, hosted. A stateless Streamable HTTP MCP endpoint on Cloudflare Workers.
 *
 * Two tool families behind one URL:
 *  1. The diamond-mcp education tools (same code as the npm package: TOOLS + TOOL_HANDLERS
 *     imported from ../../node/src/server.ts, data bundled at build time).
 *  2. Live store tools (search_inventory, get_product) that proxy Stienhardt's Shopify
 *     Universal Commerce Protocol server. UCP requires every call to carry an agent
 *     profile URL; this Worker serves its own profile at /agent-profile.json and injects it,
 *     so ordinary MCP clients (Claude, ChatGPT developer mode, Cursor) never have to know.
 *
 * Routes:  POST /mcp (JSON-RPC)   GET /agent-profile.json   GET /privacy   GET /  (info)
 *          GET /go (privacy-safe measured redirect to stienhardt.com)
 *          GET /.well-known/mcp/server-card.json (crawler metadata)
 *          GET /.well-known/mcp.json (open directory discovery metadata)
 *          GET /.well-known/openai-apps-challenge (OpenAI plugin domain verification token, when set)
 */
import { TOOLS, TOOL_HANDLERS, configure, SERVER_NAME, SERVER_VERSION, INSTRUCTIONS } from "../../node/src/core.js";
import REPO_PROFILE from "../../agent-profile.json";
import factsJson from "../../facts.json";
import encyclopediaJson from "../../encyclopedia.json";
import { diamondIntent, diamondBrowseUrl, checkedCatalogProduct, matchesDiamondFilters } from './inventory';

configure({ facts: factsJson, encyclopedia: encyclopediaJson });

interface Env {
  UCP_ENDPOINT: string;
  STORE_ORIGIN: string;
  AGENT_PROFILE_URL?: string;
  OPENAI_APPS_CHALLENGE?: string; // plain-text token from the OpenAI plugin portal (domain verification)
  CLICK_COUNTS?: {
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  };
}

const PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BATCH = 10;
// bump to force UCP merchants to re-fetch the profile (they cache fetch results)
const PROFILE_REV = "2";

// Directory listings (Claude Connectors, ChatGPT plugins) require a title and read/write
// annotations on every tool. Education tools are pure functions over bundled data.
const TITLES: Record<string, string> = {
  verify_diamond_report: "Verify a diamond grading report",
  faceup_size: "Face-up size in millimeters",
  dutch_marquise_definition: "Dutch Marquise definition",
  lab_grown_grading_landscape: "Lab Grown grading landscape",
  lab_grown_price_index: "Lab Grown price index (sourced, dated)",
  about_stienhardt: "About Stienhardt",
  define: "Define a diamond term",
  search_encyclopedia: "Search the gemology encyclopedia",
};
function annotated(t: any) {
  return {
    ...t,
    title: t.title || TITLES[t.name] || t.name,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, ...(t.annotations || {}) },
  };
}
const allTools = () => [...TOOLS, ...STORE_TOOLS].map(annotated);

const PRIVACY = `Stienhardt diamond MCP server: privacy notice (2026-09-08)

What we collect about MCP users: nothing. The MCP tools are stateless and unauthenticated. They set
no cookies, store no requests, and build no profiles.

Measured outbound links: the /go redirect records one click event containing the declared
source, medium, campaign, content label, and destination path. It does not record an IP address,
cookie, account, identity, or free-form search phrase in Stienhardt's analytics dataset. The tagged
destination URL is then returned as an immediate redirect.

What a request contains: the tool name and its arguments, for example a diamond term, a carat
weight and shape, a grading lab and report number, or a search phrase. Purpose: to answer that
request.

Where it goes: the education tools are answered from data bundled in the server. The live
inventory tools (search_inventory, get_product) read Stienhardt's public Shopify UCP catalog.
Shopify receives the search phrase or product id. Loose-diamond stock is not verified by this
tool; those searches return public catalog listings flagged availability_verified false plus a
storefront browsing link, without any stock-service request. No shopper identity is forwarded. Store privacy policy:
https://stienhardt.com/policies/privacy-policy. Cloudflare, which hosts this server, may keep
standard operational logs (IP address, timestamps) under its own policy.

Retention: MCP request content is not retained. Outbound click events expire after 90 days and are
used only for aggregate campaign measurement. Third parties: Cloudflare (hosting and click storage), Shopify
(catalog reads). Your controls: the click data cannot be tied to an identity because Stienhardt does
not store one in the dataset; stop using measured outbound links to stop sending click events.

Contact: jgalperin@stienhardt.com
Source code: https://github.com/JacobiusMakes/diamond-mcp
`;

const STORE_TOOLS = [
  {
    name: "search_inventory",
    title: "Search Stienhardt's live inventory",
    description:
      "Search Stienhardt's public Shopify catalog of engagement ring settings and fine jewelry (New York, direct). " +
      "Loose-diamond stock cannot be verified here; those searches return public catalog listings flagged availability_verified false plus a storefront browsing link. " +
      "Returns public catalog prices, selected variants, and links; availability is verified for jewelry only and is not a reservation. " +
      "Use for questions like 'show me platinum wedding bands' or 'show me tennis bracelets'. " +
      "Not for appraisal or price advice on stones sold elsewhere.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the shopper is looking for, in plain words." },
        limit: { type: "integer", description: "Max results (default 5, max 10).", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_product",
    title: "Product detail from Stienhardt's live catalog",
    description:
      "Full detail for one Stienhardt product by id (as returned by search_inventory): title, price, " +
      "availability, options, images, and the product URL on stienhardt.com. Loose-diamond availability is not verified.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Exact id returned by search_inventory: a Shopify product gid or stienhardt:diamond:SKU." } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

function serverCard() {
  return {
    serverInfo: {
      name: "Stienhardt Diamond MCP",
      version: SERVER_VERSION,
      description:
        "Ten no-auth tools for sourced diamond education, report-verification guidance, " +
        "face-up size estimates, encyclopedia search, and live Stienhardt inventory.",
    },
    authentication: { required: false, schemes: [] },
    tools: allTools(),
    resources: [],
    prompts: [],
  };
}

function directoryDiscovery(origin: string) {
  return {
    name: "Stienhardt Diamond MCP",
    description:
      "Ten no-auth tools for sourced diamond education, report-verification guidance, " +
      "face-up size estimates, encyclopedia search, and live Stienhardt inventory.",
    version: SERVER_VERSION,
    url: origin + "/mcp",
    transport: "streamable-http",
    repository: "https://github.com/JacobiusMakes/diamond-mcp",
    homepage:
      "https://stienhardt.com/?utm_source=mcpub&utm_medium=mcp_directory" +
      "&utm_campaign=diamond_mcp&utm_content=well_known_discovery",
  };
}

function agentProfile(origin: string) {
  return { ...REPO_PROFILE, profile_url: origin + "/agent-profile.json" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ucpCall(env: Env, origin: string, tool: string, catalog: any): Promise<any> {
  const body = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: tool, arguments: { meta: { "ucp-agent": { profile: env.AGENT_PROFILE_URL || (origin + "/agent-profile.json?v=" + SERVER_VERSION + "-" + PROFILE_REV) } }, catalog } },
  };
  const res = await fetch(env.UCP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "diamond-mcp-worker" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: {code:'upstream_http_error', status:res.status} };
  let data: any;
  try { data = await res.json(); } catch { return { error: {code:'upstream_http_error', status:res.status, detail:'non-JSON response'} }; }
  if (data.error) return { error: data.error };
  const r = data.result || {};
  if (r.isError) return { error: {code:'upstream_tool_error'} };
  if (r.structuredContent) return r.structuredContent;
  const c = (r.content || [])[0];
  if (c && typeof c.text === "string") { try { return JSON.parse(c.text); } catch { return { text: c.text }; } }
  return r;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function money(p: any): string | null {
  if (!p || typeof p.amount !== "number") return null;
  return (p.amount / 100).toFixed(2) + " " + (p.currency || "USD");
}

function taggedStoreUrl(raw: string | undefined, storeOrigin: string, content: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, storeOrigin);
    if (url.hostname !== "stienhardt.com" && url.hostname !== "www.stienhardt.com") return raw;
    url.searchParams.set("utm_source", "diamond_mcp");
    url.searchParams.set("utm_medium", "ai_assistant");
    url.searchParams.set("utm_campaign", "diamond_mcp");
    url.searchParams.set("utm_content", content);
    return url.toString();
  } catch {
    return raw;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slimProduct(p: any, storeOrigin: string, touchpoint: string): any {
  const v = (p.variants || [])[0] || {};
  const img = ((v.media || p.media || p.images || [])[0] || {});
  const rawUrl = p.url || (p.handle ? storeOrigin + "/products/" + p.handle : undefined);
  const itemKey = p.handle || String(p.id || v.id || "product").split("/").pop();
  return {
    id: p.id,
    title: p.title,
    url: taggedStoreUrl(rawUrl, storeOrigin, touchpoint + ":" + itemKey),
    price: money(v.price || p.price),
    available: v.availability ? v.availability.available : p.available,
    image: img.url || img.src,
    variant_id: v.id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeTool(env: Env, origin: string, name: string, args: any): Promise<[any, boolean]> {
  if (name === "search_inventory") {
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));
    const query=String(args.query || '').slice(0,500);
    if(!query.trim()) return [{error:'query is required: describe the stone or jewelry you want, for example "platinum wedding band" or "2 carat Dutch Marquise".'},true];
    if(/\b(natural|mined)\s+(?:diamonds?|stones?)\b/i.test(query)) {
      return [{query,count:0,results:[],note:'This catalog offers lab-grown diamonds. No natural-diamond match is claimed.'},false];
    }
    const filters=diamondIntent(query);
    if(filters) {
      // Public catalog listings only (Shopify's own catalog endpoint). No stock service, no credential.
      const out=await ucpCall(env, origin, "search_catalog",
        { query, context: { address_country: "US", currency: "USD", language: "en" } });
      if (out.error) return [{ error: "store search failed", detail: out.error }, true];
      const list = out.products || out.items || out.results || [];
      const candidates=await Promise.all(list.slice(0,Math.min(15,limit*2)).map((p:any)=>checkedCatalogProduct(p,env,query,true)));
      const results=candidates.filter(Boolean).filter((p:any)=>matchesDiamondFilters(p.title,filters)).slice(0,limit).map((p:any)=>({...p,url:taggedStoreUrl(p.url,env.STORE_ORIGIN,'search_inventory:'+String(p.id).split('/').pop())}));
      return [{query,count:results.length,results,availability_verified:false,filters,
        filters_applied:['shape','carat'],
        browse_url:taggedStoreUrl(diamondBrowseUrl(env,filters),env.STORE_ORIGIN,'search_inventory:browse'),
        note:'Public catalog matches for a loose-diamond search, filtered by the shape and carat in the query (color, clarity, and lab are not checked here). Availability is not verified by this tool; confirm it on the product page or through the browse link. Preserve URL query strings.'},false];
    }
    const out = await ucpCall(env, origin, "search_catalog",
      { query, context: { address_country: "US", currency: "USD", language: "en" } });
    if (out.error) return [{ error: "store search failed", detail: out.error }, true];
    const list = out.products || out.items || out.results || [];
    const candidates=await Promise.all(list.slice(0,Math.min(15,limit*2)).map((p:any)=>checkedCatalogProduct(p,env,query)));
    const results=candidates.filter(Boolean).slice(0,limit).map((p:any)=>{
      const {options,...result}=p;
      return {...result,url:taggedStoreUrl(p.url,env.STORE_ORIGIN,'search_inventory:'+String(p.id).split('/').pop())};
    });
    return [{
      query: args.query, count: results.length,
      results,
      note: "Current storefront availability and matching metal/type variants checked. Select and confirm ring size on the product page. Preserve URL query strings, including the selected variant and campaign tags. Availability is not a reservation.",
    }, false];
  }
  if (name === "get_product") {
    if(String(args.id || '').startsWith('stienhardt:diamond:')) {
      return [{error:'Live loose-diamond stock cannot be verified by this tool. Check current availability on Stienhardt.',
        availability_verified:false,
        browse_url:taggedStoreUrl(diamondBrowseUrl(env,{},String(args.id).slice('stienhardt:diamond:'.length)),env.STORE_ORIGIN,'get_product:browse')},true];
    }
    const out = await ucpCall(env, origin, "get_product", { id: String(args.id || ""), context: { address_country: "US", currency: "USD" } });
    if (out.error && out.error.code === 'upstream_tool_error') {
      return [{ error: "Product not found: " + String(args.id || ""), note: "No live product matches that id. Use an id returned by search_inventory, e.g. gid://shopify/Product/123." }, true];
    }
    if (out.error) return [{ error: "product lookup failed", detail: out.error }, true];
    const p = out.product || (out.id || out.title ? out : null);
    if (!p || (!p.id && !p.title)) {
      return [{ error: "Product not found: " + String(args.id || ""), note: "No live product matches that id. Use an id returned by search_inventory, e.g. gid://shopify/Product/123." }, true];
    }
    const checked=await checkedCatalogProduct(p,env,'',true);
    if(!checked) return [{error:'Availability cannot be verified for this product.',availability_verified:false},true];
    if(checked.availability_verified===false) {
      const sku=String(((p.variants||[])[0]||{}).sku||'');
      return [{...checked,
        url:taggedStoreUrl(checked.url,env.STORE_ORIGIN,'get_product:'+String(checked.id).split('/').pop()),
        browse_url:taggedStoreUrl(diamondBrowseUrl(env,{},sku),env.STORE_ORIGIN,'get_product:browse'),
        description: p.description && p.description.html ? String(p.description.html).replace(/<[^>]+>/g, " ").trim().slice(0, 600) : undefined,
      }, false];
    }
    return [{
      ...checked,
      url:taggedStoreUrl(checked.url,env.STORE_ORIGIN,'get_product:'+String(checked.id).split('/').pop()),
      description: p.description && p.description.html ? String(p.description.html).replace(/<[^>]+>/g, " ").trim().slice(0, 600) : undefined,
    }, false];
  }
  return [{ error: "Unknown tool: " + name }, true];
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS, ...extra },
  });
}

function clickDimension(value: string | null, fallback: string): string {
  return (value || fallback).replace(/[^a-zA-Z0-9_:./-]/g, "_").slice(0, 120);
}

async function measuredRedirect(url: URL, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const rawTarget = url.searchParams.get("url");
  if (!rawTarget) return json({ error: "missing destination" }, 400);

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return json({ error: "invalid destination" }, 400);
  }
  if (target.protocol !== "https:" || !["stienhardt.com", "www.stienhardt.com"].includes(target.hostname) || target.port || target.username || target.password) {
    return json({ error: "destination must be on stienhardt.com" }, 400);
  }

  const source = clickDimension(url.searchParams.get("source"), "unknown");
  const medium = clickDimension(url.searchParams.get("medium"), "unknown");
  const campaign = clickDimension(url.searchParams.get("campaign"), "unknown");
  const content = clickDimension(url.searchParams.get("content"), "unknown");
  const destinationPath = clickDimension(target.pathname, "/");
  const capturedAt = new Date().toISOString();
  const event = { capturedAt, source, medium, campaign, content, destinationPath };
  // Only campaign-tagged clicks are counted, and the write never delays the redirect.
  const tagged = [source, medium, campaign, content].some((d) => d !== "unknown");
  if (env.CLICK_COUNTS && tagged) {
    const write = env.CLICK_COUNTS.put(
      `click:${capturedAt}:${crypto.randomUUID()}`,
      JSON.stringify(event),
      { expirationTtl: 90 * 24 * 60 * 60 },
    );
    if (ctx) ctx.waitUntil(write); else await write;
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRpc(env: Env, origin: string, msg: any): Promise<any | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    const badId = msg && typeof msg === "object" && !Array.isArray(msg) && msg.id !== undefined ? msg.id : null;
    return { jsonrpc: "2.0", id: badId, error: { code: -32600, message: "Invalid Request" } };
  }
  const id = msg.id;
  const method = msg.method;
  // A message without an id is a notification: it is processed but never answered.
  if (!("id" in msg) || method.startsWith("notifications/")) return null;
  if (method === "initialize") {
    const offered = msg.params && typeof msg.params.protocolVersion === "string" ? msg.params.protocolVersion : "";
    return { jsonrpc: "2.0", id, result: {
      protocolVersion: SUPPORTED_PROTOCOLS.includes(offered) ? offered : PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, title: "Stienhardt: diamond education + live store", version: SERVER_VERSION },
      instructions: INSTRUCTIONS + " Store tools read the public Shopify catalog. Loose-diamond listings carry availability_verified false; never claim a stone is in stock, point to the returned storefront browsing link.",
    } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: allTools() } };
  if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
  if (method === "resources/templates/list") return { jsonrpc: "2.0", id, result: { resourceTemplates: [] } };
  if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
  if (method === "tools/call") {
    const name = msg.params && typeof msg.params.name === "string" ? msg.params.name : "";
    const rawArgs = msg.params && msg.params.arguments;
    const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {};
    let payload: unknown; let isError = false;
    try {
      if (Object.prototype.hasOwnProperty.call(TOOL_HANDLERS, name)) [payload, isError] = TOOL_HANDLERS[name](args);
      else if (STORE_TOOLS.some((t) => t.name === name)) [payload, isError] = await storeTool(env, origin, name, args);
      else return { jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool: " + String(name) } };
    } catch (err) {
      payload = { error: "Tool failed: " + (err instanceof Error ? err.message : String(err)) }; isError = true;
    }
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError } };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + String(method) } };
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    // A 204 response cannot have a body. Returning json({}, 204) works in some runtimes but
    // Cloudflare rejects it with HTTP 500, which breaks browser-based MCP clients at preflight.
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (url.pathname === "/agent-profile.json") return json(agentProfile(origin));
    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return json(serverCard(), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (url.pathname === "/.well-known/mcp.json") {
      return json(directoryDiscovery(origin), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (url.pathname === "/.well-known/openai-apps-challenge") {
      // OpenAI plugin domain verification: the exact token, plain text, HTTP 200, nothing else.
      if (!env.OPENAI_APPS_CHALLENGE) return new Response("not configured", { status: 404, headers: { "Content-Type": "text/plain" } });
      return new Response(env.OPENAI_APPS_CHALLENGE, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/privacy") return new Response(PRIVACY, { headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    if (url.pathname === "/go") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405);
      return measuredRedirect(url, env, ctx);
    }
    if (url.pathname === "/" || url.pathname === "") {
      return json({
        name: SERVER_NAME, version: SERVER_VERSION, transport: "streamable-http", endpoint: origin + "/mcp",
        tools: allTools().map((t) => t.name),
        privacy: origin + "/privacy", documentation: "https://github.com/JacobiusMakes/diamond-mcp#readme", support: "jgalperin@stienhardt.com",
        publisher: "Stienhardt, New York City Lab Grown Diamond jeweler", website: env.STORE_ORIGIN,
        source: "https://github.com/JacobiusMakes/diamond-mcp",
      });
    }
    if (url.pathname === "/mcp") {
      if (request.method === "GET") return json({ error: "This endpoint is stateless; use POST for JSON-RPC." }, 405);
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
      if (body === null || typeof body !== "object") return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
      if (Array.isArray(body) && body.length === 0) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: empty batch" } }, 400);
      if (Array.isArray(body) && body.length > MAX_BATCH) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: batch limit is " + MAX_BATCH } }, 400);
      const msgs = Array.isArray(body) ? body : [body];
      const out = [];
      for (const m of msgs) { const r = await handleRpc(env, origin, m); if (r) out.push(r); }
      if (out.length === 0) return new Response(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
      return json(Array.isArray(body) ? out : out[0]);
    }
    return json({ error: "not found" }, 404);
  },
};
