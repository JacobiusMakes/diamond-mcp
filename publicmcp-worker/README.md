# Stienhardt Business MCP

This worker is a separate, PUBLICMCP-compatible business profile for Stienhardt & Stones. It exposes the three required public identity tools plus live product search:

- `get_info`
- `get_services`
- `get_location`
- `get_products`
- `get_product_summary`

It is stateless, unauthenticated, and read-only. Product results carry source-specific campaign tags so PUBLICMCP and A2A Registry visits and sales can be measured separately from each other and from the main Diamond MCP server.

This worker does not add tools to or change the ten-tool Diamond MCP endpoint.

## Deploy

```powershell
npx wrangler deploy --config publicmcp-worker/wrangler.toml
```

## Endpoints

- `/mcp`: Streamable HTTP MCP
- `/a2a/mcp`: the same tools with A2A Registry attribution
- `/.well-known/publicmcp.json`: PUBLICMCP discovery
- `/.well-known/agent-card.json`: single-agent A2A Registry discovery
- `/.well-known/agents.json`: multi-agent A2A Registry discovery
- `/.well-known/mcp/server-card.json`: MCP server card
- `/info`: plain-text summary
- `/privacy`: privacy notice
