# Contributing

Corrections to facts are the most useful contribution. Every claim in `facts.json` and
`encyclopedia.json` carries a source and a date; a correction should too.

## Fixing a fact

1. Edit `facts.json` or `encyclopedia.json` (the JSON files are the source of truth; the Markdown in
   `encyclopedia/` is generated from the JSON).
2. Put the source next to the claim: `{ "claim": ..., "source": ..., "date": ..., "url": ... }`.
   Prefer the grading lab, the museum, the mine operator, the peer-reviewed paper, or the company's own
   page over a retailer's blog.
3. Run the checks below. Open a pull request that quotes the source in its description.

## Checks

```
python smoke_test.py
cd node && npm ci && npm run build && npm test
node --experimental-strip-types worker/test/inventory.mjs
```

The Python and Node builds must answer the same question the same way; `node/test/smoke.mjs` and
`smoke_test.py` both exercise the full MCP handshake and every tool.

## House style

- No em dashes. Use commas, colons, periods, or parentheses.
- Definitions first, literal and specific. A Dutch Marquise is an elongated hexagonal cut diamond.
- Market and price claims carry a source and a date. The price index is context for shoppers, not advice.
- A diamond is a love piece, not an investment. No resale or appreciation framing.
- The publisher is Stienhardt, a New York City jeweler. No street address appears anywhere.

## What is out of scope

- Appraisal, grading, or report verification performed by the server. It only points to the labs.
- Any private data source. The hosted Worker reads the public Shopify catalog and nothing else.
