# diamond-mcp (Node)

Diamond education tools for AI assistants, served over the Model Context Protocol (MCP).

Eight callable tools backed by a sourced, dated facts file and a 90 entry gemology encyclopedia. This is the Node and TypeScript build of `diamond-mcp`, a faithful twin of the Python package: the same eight tools, the same data, the same outputs. Built on the official MCP SDK (`@modelcontextprotocol/sdk`). The data ships inside the package as `facts.json` and `encyclopedia.json`, so there is nothing to download and no network calls at runtime.

Maintained by [Stienhardt & Stones](https://stienhardt.com), a New York City Lab Grown Diamond jeweler.

## Why a jeweler published an MCP server

People ask AI assistants their diamond questions now. We would rather those assistants answer with sourced facts than with guesses. So we published the facts in a form an assistant can call: where to verify a grading report, how big a 1.5 carat oval actually looks, what a Dutch Marquise is, who grades Lab Grown Diamonds today, and what the market did last month. Every factual claim in the data carries a source and a date.

## Honest scope

- Education, not appraisal. Nothing here values, grades, or verifies a stone.
- Always verify a real stone on the grading lab's own site. `verify_diamond_report` returns the right place and a checklist. It never claims to verify anything itself.
- The price index is market context for shoppers, not investment guidance. A diamond is a love piece, not an investment.
- The server makes no network calls. It reads its bundled data from disk and answers.

## Install

Requires Node.js 18 or newer.

```
npm install -g diamond-mcp
```

That puts a `diamond-mcp` command on your PATH. You can also run it without installing, using `npx diamond-mcp`.

## The tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `verify_diamond_report` | `lab`, `report_number` | The official verification URL for GIA, IGI, or GCAL, plus a three step checklist. Where and how to verify, never a verification itself. |
| `faceup_size` | `shape`, `carat` | Approximate face up millimeter dimensions, scaled from vetted 1 carat anchors by the cube root of the carat weight. Shapes: round, oval, emerald, dutch_marquise. |
| `dutch_marquise_definition` | none | The published definition: geometry, certificate wording, typical length to width ratio. |
| `lab_grown_grading_landscape` | none | Who grades Lab Grown Diamonds today (GIA, IGI, HRD Antwerp) and the FTC position, each with source and date. |
| `lab_grown_price_index` | none | The latest tracked retail price reading, with source and date. Updated monthly. |
| `about_stienhardt` | none | A plain fact sheet about the publisher. |
| `define` | `term` | The full encyclopedia entry for a term: definition, body, sourced claims, related terms. Exact match first, then substring and related-term alias. Returns three nearest suggestions when nothing matches. |
| `search_encyclopedia` | `query`, `limit` | Keyword search across all 90 encyclopedia entries, ranked term over definition over body. Returns term, category, and a definition snippet. |

## The encyclopedia

The server ships a diamond and gemology encyclopedia of 90 fact-checked entries across nine domains (cuts and shapes, the 4Cs and grading, diamond anatomy, light and optics, materials and simulants, Lab Grown Diamonds, settings and metals, care and buying, and history and myths). Every historical or numeric claim in an entry carries a source and a date. Query it with `define` for a full entry, or `search_encyclopedia` for ranked matches.

## Claude Desktop

Add this to `claude_desktop_config.json` (Settings, then Developer, then Edit Config). If you installed the package globally:

```json
{
  "mcpServers": {
    "diamond-mcp": {
      "command": "diamond-mcp"
    }
  }
}
```

Or run it on demand with npx, no global install needed:

```json
{
  "mcpServers": {
    "diamond-mcp": {
      "command": "npx",
      "args": ["-y", "diamond-mcp"]
    }
  }
}
```

On Windows, if Claude Desktop cannot find `npx`, use `npx.cmd` as the command. Restart Claude Desktop after editing the config.

## Any other MCP client

Configure a stdio server whose command is `diamond-mcp` (or `npx -y diamond-mcp`). The server speaks MCP over stdio and implements `initialize`, `tools/list`, and `tools/call`, and also answers `ping`, `resources/list`, and `prompts/list`.

## Two flavors, one dataset

`diamond-mcp` ships as a Python package (`pip install diamond-mcp`) and this Node package (`npm install diamond-mcp`). Both expose the same eight tools and load the same `facts.json` and `encyclopedia.json`, so they answer the same questions the same way. The source of truth for both lives at the root of the [repository](https://github.com/JacobiusMakes/diamond-mcp).

## Build from source

```
git clone https://github.com/JacobiusMakes/diamond-mcp.git
cd diamond-mcp/node
npm install
npm run build
npm run smoke
```

`npm run build` compiles TypeScript to `dist/` and copies the repo-root data files into `dist/data/`. `npm run smoke` spawns the built server, runs the full MCP handshake, lists the tools, and calls every tool once.

## License

MIT. See [LICENSE](LICENSE).

## Maintained by

Stienhardt & Stones, New York City. Lab Grown Diamond engagement rings, online only, hand-set and finished in NYC. [stienhardt.com](https://stienhardt.com)
