# Diamond comparison release, September 14, 2026

Live on the hosted MCP endpoint: https://diamond-mcp.stienhardt.workers.dev/mcp

The new compare_diamonds tool compares two to five supplied specifications from any seller. It calculates measured dimension ratios, price per carat, and differences from the first stone. Missing values stay missing. Prices require explicit currencies, and different currencies are never compared. Inputs are not authenticated grading reports. No appraisal or overall winner is produced.

Example MCP call:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"compare_diamonds","arguments":{"stones":[{"label":"Option A","carat":2,"length_mm":10,"width_mm":7,"price":1000,"currency":"USD"},{"label":"Option B","carat":2.5,"length_mm":11,"width_mm":7.5,"price":1500,"currency":"USD"}]}}}
```

These are fictional demonstration specifications, not inventory or advertised offers. Option B costs $500 more and weighs 0.5 carat more. Price per carat is $500 versus $600. Those calculations do not establish which stone is more attractive or better value.

Validation: Node comparison edge cases and 30 protocol smoke checks, 17 inventory tests plus budget-unit assertions, 19 hosted handler tests, measured-link tests and containment scan passed. Unsupported upper-bound carat phrasing now requests an explicit range instead of becoming a dollar budget. Budget shorthand 2k parses as 2000 USD.

Availability: hosted endpoint and current Node source. Published npm/PyPI packages and desktop bundle 0.2.6 were not republished by this update. Python remains eight tools, Node source nine, hosted eleven.

Attribution: optional tagged links and redirect request counts. No verified purchase attribution, visitor identity, or sales lift claim. See MEASUREMENT.md.

Hosted deployment verified: 62b48a7d-445f-4828-92c4-d5e6f6f500f4. Live tools/list returned eleven tools and compare_diamonds returned the expected $500 demonstration price difference.
