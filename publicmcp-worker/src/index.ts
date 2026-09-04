/**
 * Stienhardt business identity MCP.
 *
 * This is a separate PUBLICMCP-compatible endpoint. It does not change the
 * ten-tool Stienhardt Diamond MCP server. The three required identity tools
 * are static and business-maintained. Product tools read the public diamond
 * server and rewrite product links with PublicMCP attribution.
 */

interface Env {
  DIAMOND_MCP_ENDPOINT: string;
  STORE_ORIGIN: string;
}

const PROTOCOL = "2025-06-18";
const VERSION = "0.1.0";
const PUBLICMCP_VERSION = "0.3";

const TOOL_NAMES = [
  "get_info",
  "get_services",
  "get_location",
  "get_products",
  "get_product_summary",
];

const TOOLS = [
  {
    name: "get_info",
    title: "Stienhardt business information",
    description:
      "Return canonical identity, contact, website, and social-profile information for Stienhardt & Stones.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "get_services",
    title: "Stienhardt services and product categories",
    description:
      "Return the business-maintained catalog of diamonds, engagement rings, wedding bands, fine jewelry, and educational guidance. Optionally filter by category.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category filter, such as diamonds, rings, jewelry, or education.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  {
    name: "get_location",
    title: "Stienhardt location and service area",
    description:
      "Return Stienhardt's New York City base and online service coverage. Optionally filter by market.",
    inputSchema: {
      type: "object",
      properties: {
        market: { type: "string", description: "Optional city or market filter." },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "get_products",
    title: "Search Stienhardt's live catalog",
    description:
      "Search live certified Lab Grown Diamonds, engagement ring settings, wedding bands, and fine jewelry. Returns current prices, availability, images, and attributable product links.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the shopper wants, in plain words." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximum results. Default 5." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "get_product_summary",
    title: "Get one Stienhardt product",
    description:
      "Return current detail for one Stienhardt product using an id returned by get_products.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Product id returned by get_products." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  },
].map((tool) => ({
  ...tool,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: tool.name === "get_products" || tool.name === "get_product_summary",
  },
}));

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extra,
    },
  });
}

function trackedUrl(storeOrigin: string, path: string, content: string): string {
  const url = new URL(path, storeOrigin);
  url.searchParams.set("utm_source", "publicmcp");
  url.searchParams.set("utm_medium", "ai_business_directory");
  url.searchParams.set("utm_campaign", "local_discovery");
  url.searchParams.set("utm_content", content);
  return url.toString();
}

function businessInfo(storeOrigin: string) {
  return {
    publicmcp_version: PUBLICMCP_VERSION,
    name: "Stienhardt & Stones",
    tagline: "Certified Lab Grown Diamonds and hand-set engagement rings from New York",
    description:
      "New York jeweler specializing in sourced, certified Lab Grown Diamonds, engagement rings, wedding bands, and fine jewelry. Stienhardt hand-sets and finishes rings in New York City and sells directly online.",
    founded: null,
    founder: "",
    co_founder: "",
    website: trackedUrl(storeOrigin, "/", "get_info"),
    business_type: ["JewelryStore", "LocalBusiness", "OnlineStore"],
    legal_name: "Stienhardt & Stones",
    logo: "",
    price_range: "Varies by diamond and setting",
    contact: {
      quote_url: trackedUrl(storeOrigin, "/pages/book-an-appointment", "get_info_appointment"),
      email: "jgalperin@stienhardt.com",
      telephone: "",
    },
    opening_hours: "Online store available at all times. Consultations are by appointment.",
    social_profiles: {
      instagram: "https://www.instagram.com/stienhardt/",
      x: "https://x.com/StienhardtStone",
      youtube: "https://www.youtube.com/@Stienhardt",
      pinterest: "https://www.pinterest.com/StienhardtStones/",
      facebook: "https://www.facebook.com/100089955956436",
    },
  };
}

function services(storeOrigin: string) {
  return [
    {
      name: "Certified Lab Grown Diamonds",
      category: "diamonds",
      description:
        "Live catalog of sourced Lab Grown Diamonds with current pricing and grading-report details.",
      highlights: ["Live inventory", "Grading-report details", "Multiple shapes and carat weights"],
      pricing: { model: "Current catalog price in USD" },
      url: trackedUrl(storeOrigin, "/collections/lab-diamonds", "service_lab_diamonds"),
    },
    {
      name: "Engagement Rings",
      category: "rings",
      description:
        "Engagement ring settings paired with certified Lab Grown Diamonds. Rings are hand-set and finished in New York City.",
      highlights: ["Setting and center-stone selection", "New York hand-setting and finishing", "Online consultation"],
      pricing: { model: "Current setting and diamond price in USD" },
      url: trackedUrl(storeOrigin, "/collections/engagement-rings", "service_engagement_rings"),
    },
    {
      name: "Wedding Bands",
      category: "rings",
      description: "Women's and men's wedding bands in a range of metals and designs.",
      highlights: ["Women's bands", "Men's bands", "Diamond and metal styles"],
      pricing: { model: "Current catalog price in USD" },
      url: trackedUrl(storeOrigin, "/collections/wedding-bands", "service_wedding_bands"),
    },
    {
      name: "Fine Jewelry",
      category: "jewelry",
      description: "Diamond earrings, necklaces, pendants, and bracelets sold directly online.",
      highlights: ["Earrings", "Necklaces and pendants", "Bracelets"],
      pricing: { model: "Current catalog price in USD" },
      url: trackedUrl(storeOrigin, "/collections/diamond-earrings", "service_fine_jewelry"),
    },
    {
      name: "Diamond Education and Report Guidance",
      category: "education",
      description:
        "Free sourced guidance on grading reports, diamond terminology, face-up size, and Lab Grown Diamond buying questions. Educational information is not an appraisal.",
      highlights: ["Report verification steps", "Face-up size estimates", "Gemology reference"],
      pricing: { project_range: "Free" },
      url: "https://diamond-mcp.stienhardt.workers.dev/?utm_source=publicmcp&utm_medium=ai_business_directory&utm_campaign=local_discovery&utm_content=service_education",
    },
  ];
}

function locationInfo() {
  return {
    headquarters: "New York, NY",
    geo: { lat: 40.7549, lng: -73.9840 },
    geo_radius: null,
    remote_capable: true,
    offices: [
      {
        city: "New York",
        state: "NY",
        country: "US",
        region: "New York City",
        primary: true,
        access: "Consultations are by appointment. Confirm appointment details before visiting.",
      },
    ],
    service_areas: ["New York City", "United States online"],
  };
}

function rewriteProductLinks(value: unknown, storeOrigin: string, content: string): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteProductLinks(item, storeOrigin, content));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "url" && typeof item === "string") {
      try {
        const url = new URL(item);
        if (url.hostname === "stienhardt.com" || url.hostname === "www.stienhardt.com") {
          url.searchParams.set("utm_source", "publicmcp");
          url.searchParams.set("utm_medium", "ai_business_directory");
          url.searchParams.set("utm_campaign", "local_discovery");
          url.searchParams.set("utm_content", content);
          out[key] = url.toString();
          continue;
        }
      } catch {
        out[key] = item;
        continue;
      }
    }
    out[key] = rewriteProductLinks(item, storeOrigin, content);
  }
  return out;
}

async function callDiamondMcp(env: Env, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(env.DIAMOND_MCP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "publicmcp", method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error("Live catalog returned HTTP " + response.status);
  const rpc = await response.json() as any;
  if (rpc.error) throw new Error(rpc.error.message || "Live catalog call failed");
  const result = rpc.result || {};
  if (result.structuredContent) return result.structuredContent;
  const text = result.content && result.content[0] && result.content[0].text;
  if (typeof text === "string") {
    try { return JSON.parse(text); } catch { return { text }; }
  }
  return result;
}

async function runTool(env: Env, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "get_info") return businessInfo(env.STORE_ORIGIN);
  if (name === "get_services") {
    const category = String(args.category || "").trim().toLowerCase();
    const all = services(env.STORE_ORIGIN);
    return category ? all.filter((service) => service.category.includes(category)) : all;
  }
  if (name === "get_location") {
    const market = String(args.market || "").trim().toLowerCase();
    const location = locationInfo();
    if (!market) return location;
    const matches = location.service_areas.some((area) => area.toLowerCase().includes(market));
    return { ...location, market_query: market, market_match: matches };
  }
  if (name === "get_products") {
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));
    const result = await callDiamondMcp(env, "search_inventory", { query: String(args.query || ""), limit });
    return rewriteProductLinks(result, env.STORE_ORIGIN, "get_products");
  }
  if (name === "get_product_summary") {
    const result = await callDiamondMcp(env, "get_product", { id: String(args.id || "") });
    return rewriteProductLinks(result, env.STORE_ORIGIN, "get_product_summary");
  }
  throw new Error("Unknown tool: " + name);
}

async function handleRpc(env: Env, message: any): Promise<any | null> {
  const id = message.id;
  const method = message.method;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "stienhardt-business-mcp", title: "Stienhardt & Stones business profile", version: VERSION },
        instructions:
          "Canonical, business-maintained facts for Stienhardt & Stones. All tools are public and read-only. Preserve query strings on returned links so visits and sales remain attributable.",
      },
    };
  }
  if (method === "notifications/initialized" || (typeof method === "string" && method.startsWith("notifications/"))) return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    const name = String(message.params && message.params.name || "");
    const args = message.params && message.params.arguments || {};
    try {
      const payload = await runTool(env, name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        },
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: messageText }) }],
          isError: true,
        },
      };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + String(method) } };
}

function discovery(origin: string) {
  return {
    publicmcp_version: PUBLICMCP_VERSION,
    name: "Stienhardt & Stones",
    description:
      "Canonical business identity, services, New York location, and live product discovery for Stienhardt & Stones.",
    auth: "none",
    endpoint: origin + "/mcp",
    transport: "streamable-http",
    tools: TOOL_NAMES,
    contact: "jgalperin@stienhardt.com",
    website:
      "https://stienhardt.com/?utm_source=publicmcp&utm_medium=ai_business_directory&utm_campaign=local_discovery&utm_content=discovery",
  };
}

function serverCard(origin: string) {
  return {
    serverInfo: {
      name: "Stienhardt & Stones business profile",
      version: VERSION,
      description: "PUBLICMCP-compatible identity, services, location, and live product discovery.",
    },
    authentication: { required: false, schemes: [] },
    endpoint: origin + "/mcp",
    tools: TOOLS,
    resources: [],
    prompts: [],
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    if (request.method === "OPTIONS") return json({}, 204);
    if (url.pathname === "/.well-known/publicmcp.json" || url.pathname === "/.well-known/agents.json") {
      return json(discovery(origin), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return json(serverCard(origin), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (url.pathname === "/info") {
      return new Response(
        "Stienhardt & Stones\nNew York jeweler for certified Lab Grown Diamonds, engagement rings, wedding bands, and fine jewelry.\nMCP endpoint: " + origin + "/mcp\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } },
      );
    }
    if (url.pathname === "/privacy") {
      return new Response(
        "This endpoint is public, stateless, and unauthenticated. It sets no cookies and stores no requests. Live product tools send only the product query or id to the public Stienhardt Diamond MCP endpoint. Contact: jgalperin@stienhardt.com",
        { headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } },
      );
    }
    if (url.pathname === "/" || url.pathname === "") return json(discovery(origin));
    if (url.pathname === "/mcp") {
      if (request.method !== "POST") return json({ error: "Use POST with JSON-RPC." }, 405);
      let body: unknown;
      try { body = await request.json(); }
      catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
      const messages = Array.isArray(body) ? body : [body];
      const output = [];
      for (const message of messages) {
        const result = await handleRpc(env, message);
        if (result) output.push(result);
      }
      if (output.length === 0) return new Response(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
      return json(Array.isArray(body) ? output : output[0]);
    }
    return json({ error: "not found" }, 404);
  },
};
