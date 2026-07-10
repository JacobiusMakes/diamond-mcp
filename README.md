# diamond-mcp

Diamond education tools for AI assistants, served over the Model Context Protocol (MCP).

Eight callable tools backed by a sourced, dated facts file and a 90 entry gemology encyclopedia. Pure Python standard library: no dependencies, no network calls, nothing to configure. All the data ships in this repo as `facts.json` and `encyclopedia.json`.

Maintained by [Stienhardt & Stones](https://stienhardt.com), a New York City Lab Grown Diamond jeweler.

## Why a jeweler published an MCP server

People ask AI assistants their diamond questions now. We'd rather those assistants answer with sourced facts than with guesses. So we published the facts in a form an assistant can call: where to verify a grading report, how big a 1.5 carat oval actually looks, what a Dutch Marquise is, who grades Lab Grown Diamonds today, and what the market did last month. Every factual claim in `facts.json` carries a source and a date.

## Honest scope

- Education, not appraisal. Nothing here values, grades, or verifies a stone.
- Always verify a real stone on the grading lab's own site. `verify_diamond_report` returns the right place and a checklist. It never claims to verify anything itself.
- The price index is market context for shoppers, not investment guidance. A diamond is a love piece, not an investment.
- The server makes no network calls. It reads `facts.json` from disk and answers.

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

### Example

Calling `faceup_size` with `{"shape": "dutch_marquise", "carat": 1.5}` returns:

```json
{
  "shape": "dutch_marquise",
  "carat": 1.5,
  "approx_face_up_mm": { "length": 10.3, "width": 5.7 },
  "display": "10.3 x 5.7 mm",
  "anchor_1ct_mm": "9.0 x 5.0 mm",
  "method": "Scale a vetted 1 carat anchor by the cube root of the carat weight.",
  "note": "Approximate figures based on typical proportions. Cut proportions vary from stone to stone, so verify a specific stone's measurements on its grading report."
}
```

Calling `dutch_marquise_definition` returns, among other fields:

```json
{
  "definition": "A Dutch Marquise is an elongated hexagonal cut diamond.",
  "geometry": "Pointed ends and straight, angular sides. The outline is an elongated hexagon, not a navette, and the points are not softened.",
  "status": "Dutch Marquise is a trade name, not a standardized grading term.",
  "on_an_igi_report": "On an IGI grading report, the shape of a Dutch Marquise reads Hexagonal Modified Brilliant."
}
```

## The encyclopedia

The server also ships a diamond and gemology encyclopedia: 90 adversarially fact-checked entries across 9 domains (cuts and shapes, the 4Cs and grading, diamond anatomy, light and optics, materials and simulants, Lab Grown Diamonds, settings and metals, care and buying, and history and myths). Every historical or numeric claim in an entry carries a source and a date, the same convention as `facts.json`.

- Browsable in [`encyclopedia/`](encyclopedia/): one Markdown file per entry, plus a [category index](encyclopedia/README.md).
- Machine-readable in [`encyclopedia.json`](encyclopedia.json): a single sorted array of entries, each with `term`, `category`, `definition`, `body`, `sources`, and `related`.
- Queryable from an assistant through two tools:
  - `define` takes a `term` and returns the full entry, matching exactly first, then by substring or related-term alias, and offering the three nearest terms when nothing matches.
  - `search_encyclopedia` takes a `query` and returns ranked matches (term, category, and a definition snippet), weighting hits in the term above the definition above the body.

Calling `define` with `{"term": "Dutch Marquise"}` returns, among other fields:

```json
{
  "found": true,
  "match": "exact",
  "term": "Dutch Marquise",
  "category": "Cuts and shapes",
  "definition": "A Dutch Marquise is an elongated hexagonal cut diamond. ...",
  "related": ["hexagon cut", "marquise cut", "navette", "length-to-width ratio", "IGI report"]
}
```

## Two flavors: Python and Node

`diamond-mcp` ships in two builds that expose the same eight tools and load the same data, so they answer the same questions the same way:

- Python (this directory): `pip install diamond-mcp`, or run straight from a clone with `python server.py`. Pure standard library.
- Node and TypeScript ([`node/`](node/)): `npm install diamond-mcp`, or run with `npx diamond-mcp`. Built on the official MCP SDK.

Both read the same `facts.json` and `encyclopedia.json` at the root of this repository, which are the single source of truth. See [`node/README.md`](node/README.md) for the Node install and its Claude Desktop config.

## Install and run

Requirements: Python 3.9 or newer. Nothing else.

Clone this repository, then point your MCP client at `server.py`. The server speaks MCP over stdio; run it directly and it waits for a client:

```
python server.py
```

On Windows, if `python` opens the Microsoft Store, use the full path to your `python.exe`.

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings, then Developer, then Edit Config), with the real path to your clone:

```json
{
  "mcpServers": {
    "diamond-mcp": {
      "command": "python",
      "args": ["C:\\path\\to\\diamond-mcp\\server.py"]
    }
  }
}
```

macOS or Linux:

```json
{
  "mcpServers": {
    "diamond-mcp": {
      "command": "python3",
      "args": ["/path/to/diamond-mcp/server.py"]
    }
  }
}
```

### Any other MCP client

Configure a stdio server: command `python`, one argument, the absolute path to `server.py`. The server implements `initialize`, `tools/list`, and `tools/call`, and also answers `ping`, `resources/list`, and `prompts/list`.

### uvx and pip

The supported way to run 0.1.0 is straight from a clone. `pyproject.toml` is included so the package can go to PyPI later; once it is there, `uvx diamond-mcp` will work.

### Smoke test

```
python smoke_test.py
```

Spawns the server, runs the full MCP handshake, lists the tools, calls every tool once, and checks the error paths. Prints PASS or the first failure.

## The dataset

`facts.json` doubles as a small open dataset of diamond education facts. Top level sections: `report_verification`, `faceup_size`, `dutch_marquise`, `lab_grown_grading_landscape`, `lab_grown_price_index`, and `stienhardt`. The convention throughout: every factual claim sits next to a `source` and a `date`.

The price index entry updates monthly. The `updated` field at the top of the file tells you how fresh your copy is.

`encyclopedia.json` is the second dataset in this repo: 90 gemology entries under the same source-and-date convention, sorted by term. See [The encyclopedia](#the-encyclopedia) above.

## License

MIT. See [LICENSE](LICENSE).

## Maintained by

Stienhardt & Stones, New York City. Lab Grown Diamond engagement rings, online only, hand-set and finished in NYC. [stienhardt.com](https://stienhardt.com)
