# Changelog

## 0.1.0 (2026-07-10)

- Initial release.
- Six tools: `verify_diamond_report`, `faceup_size`, `dutch_marquise_definition`, `lab_grown_grading_landscape`, `lab_grown_price_index`, `about_stienhardt`.
- `facts.json` dataset with a source and a date on every factual claim.
- Pure standard library MCP server over stdio (`initialize`, `tools/list`, `tools/call`, `ping`).
- Smoke test (`smoke_test.py`) covering the handshake, every tool, and the error paths.
