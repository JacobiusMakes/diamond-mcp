# Changelog

## 0.2.0 (2026-07-10)

- Added a diamond and gemology encyclopedia: 90 adversarially fact-checked entries across 9 domains, every historical or numeric claim carrying a source and a date.
- New dataset `encyclopedia.json` (sorted array of entries) and a browsable `encyclopedia/` folder (one Markdown file per entry, plus a category index).
- Two new tools, for a total of eight: `define` (full entry by term, with exact, substring, and related-term alias matching, and nearest-term suggestions on a miss) and `search_encyclopedia` (ranked keyword search returning term, category, and a definition snippet).
- Both new tools load `encyclopedia.json` lazily and cache it, so clients that never query the encyclopedia pay nothing for it.

## 0.1.0 (2026-07-10)

- Initial release.
- Six tools: `verify_diamond_report`, `faceup_size`, `dutch_marquise_definition`, `lab_grown_grading_landscape`, `lab_grown_price_index`, `about_stienhardt`.
- `facts.json` dataset with a source and a date on every factual claim.
- Pure standard library MCP server over stdio (`initialize`, `tools/list`, `tools/call`, `ping`).
- Smoke test (`smoke_test.py`) covering the handshake, every tool, and the error paths.
