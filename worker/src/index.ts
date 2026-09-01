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
 * Routes:  POST /mcp (JSON-RPC)   GET /agent-profile.json   GET /  (info)
 */
import { TOOLS, TOOL_HANDLERS, configure, SERVER_NAME, SERVER_VERSION, INSTRUCTIONS } from "../../node/src/core.js";
import factsJson from "../../facts.json";
import encyclopediaJson from "../../encyclopedia.json";

configure({ facts: factsJson, encyclopedia: encyclopediaJson });

interface Env {
  UCP_ENDPOINT: string;
  STORE_ORIGIN: string;
}

const PROTOCOL = "2025-06-18";

const STORE_TOOLS = [
  {
    name: "search_inventory",
    title: "Search Stienhardt's live inventory",
    description:
      "Search Stienhardt's live catalog of certified Lab Grown Diamonds, engagement ring settings, " +
      "and fine jewelry (New York, direct). Returns real, in-stock products with prices and links. " +
      "Use for questions like 'do you have a 2 carat Dutch Marquise' or 'show me tennis bracelets'. " +
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
      "availability, options, images, and the product URL on stienhardt.com.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Product id, e.g. gid://shopify/Product/123" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

function agentProfile(origin: string) {
  return {
    ucp: {
      version: "2026-08-25",
      services: {
        "dev.ucp.shopping": [
          { version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/overview/", transport: "mcp",
            schema: "https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json" },
        ],
      },
      capabilities: {
        "dev.ucp.shopping.catalog.search": [{ version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/catalog" }],
        "dev.ucp.shopping.catalog.lookup": [{ version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/catalog" }],
        "dev.ucp.shopping.cart": [{ version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/cart",
          schema: "https://ucp.dev/2026-08-25/schemas/shopping/cart.json" }],
        "dev.ucp.shopping.checkout": [{ version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/shopping/checkout",
          schema: "https://ucp.dev/2026-08-25/schemas/shopping/checkout.json" }],
      },
      payment_handlers: {
        "dev.shopify.shop_pay": [
          { id: "shop_pay_stienhardt_agent", version: "2026-08-25", spec: "https://shopify.dev/ucp/shop-pay-handler",
            schema: "https://shopify.dev/ucp/schemas/shop-pay-config.json", available_instruments: [{ type: "shop_pay" }] },
        ],
      },
    },
    name: "Stienhardt diamond assistant",
    operator: "Stienhardt, New York",
    profile_url: origin + "/agent-profile.json",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ucpCall(env: Env, origin: string, tool: string, catalog: any): Promise<any> {
  const body = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: tool, arguments: { meta: { "ucp-agent": { profile: origin + "/agent-profile.json" } }, catalog } },
  };
  const res = await fetch(env.UCP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "diamond-mcp-worker" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (data.error) return { error: data.error };
  const r = data.result || {};
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slimProduct(p: any, storeOrigin: string): any {
  const v = (p.variants || [])[0] || {};
  const img = ((v.media || p.media || p.images || [])[0] || {});
  return {
    id: p.id,
    title: p.title,
    url: p.url || (p.handle ? storeOrigin + "/products/" + p.handle : undefined),
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
    const out = await ucpCall(env, origin, "search_catalog",
      { query: String(args.query || ""), context: { address_country: "US", currency: "USD", language: "en" } });
    if (out.error) return [{ error: "store search failed", detail: out.error }, true];
    const list = out.products || out.items || out.results || [];
    return [{
      query: args.query, count: list.length,
      results: list.slice(0, limit).map((p: any) => slimProduct(p, env.STORE_ORIGIN)),
      note: "Live inventory from stienhardt.com. Prices in USD. Every stone is certified; verify the report on the lab's own site.",
    }, false];
  }
  if (name === "get_product") {
    const out = await ucpCall(env, origin, "get_product", { id: String(args.id || ""), context: { address_country: "US", currency: "USD" } });
    if (out.error) return [{ error: "product lookup failed", detail: out.error }, true];
    const p = out.product || out;
    return [{
      ...slimProduct(p, env.STORE_ORIGIN),
      description: p.description && p.description.html ? String(p.description.html).replace(/<[^>]+>/g, " ").trim().slice(0, 600) : undefined,
      options: (p.variants || []).slice(0, 12).map((v: any) => ({ variant_id: v.id, title: v.title, price: money(v.price), available: v.availability ? v.availability.available : undefined })),
    }, false];
  }
  return [{ error: "Unknown tool: " + name }, true];
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", ...extra },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRpc(env: Env, origin: string, msg: any): Promise<any | null> {
  const id = msg.id;
  const method = msg.method;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, title: "Stienhardt: diamond education + live store", version: SERVER_VERSION },
      instructions: INSTRUCTIONS + " Live inventory tools (search_inventory, get_product) read stienhardt.com in real time.",
    } };
  }
  if (method === "notifications/initialized" || (typeof method === "string" && method.startsWith("notifications/"))) return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: [...TOOLS, ...STORE_TOOLS] } };
  if (method === "tools/call") {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    let payload: unknown; let isError = false;
    try {
      if (TOOL_HANDLERS[name]) [payload, isError] = TOOL_HANDLERS[name](args);
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    if (request.method === "OPTIONS") return json({}, 204);
    if (url.pathname === "/agent-profile.json") return json(agentProfile(origin));
    if (url.pathname === "/" || url.pathname === "") {
      return json({
        name: SERVER_NAME, version: SERVER_VERSION, transport: "streamable-http", endpoint: origin + "/mcp",
        tools: [...TOOLS, ...STORE_TOOLS].map((t) => t.name),
        publisher: "Stienhardt, New York City Lab Grown Diamond jeweler", website: env.STORE_ORIGIN,
        source: "https://github.com/JacobiusMakes/diamond-mcp",
      });
    }
    if (url.pathname === "/mcp") {
      if (request.method === "GET") return json({ error: "This endpoint is stateless; use POST for JSON-RPC." }, 405);
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
      const msgs = Array.isArray(body) ? body : [body];
      const out = [];
      for (const m of msgs) { const r = await handleRpc(env, origin, m); if (r) out.push(r); }
      if (out.length === 0) return new Response(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
      return json(Array.isArray(body) ? out : out[0]);
    }
    return json({ error: "not found" }, 404);
  },
};
