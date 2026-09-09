# Changelog

## 0.2.6 (2026-09-09)

- Encyclopedia sourcing pass: 125 verified corrections across the entries, each drafted against the cited page
  and confirmed by a second independent check. Source URLs rose from 274 to 324 of 343 claims, and no entry is
  left without a linkable source (Light performance and The 4Cs previously had none).
- Dates now record what the cited page actually carries: publication dates replace "accessed" wording wherever
  the page is dated, and citations that pointed at the wrong article, section, or edition were repointed.
- Factual wording brought in line with the sources: the GIA cut grading system is dated to its 2005 introduction
  with cut grades appearing on reports from 2006; cubic zirconia's melting point, the moissanite discovery
  account, cushion corner geometry, prong-check intervals, bezel appearance, and several other passages now say
  what their sources say. Sources that could not be verified were removed rather than left unlinked.
- Six drafted corrections were left out because their second check did not complete; they are unverified rather
  than refuted and are queued for the next data pass.
- Desktop bundle 0.2.6 built from this tree.

## 0.2.5 (2026-09-08)

- Hosted Worker: a JSON-RPC envelope is validated (a `null` body or a non-object message answers -32600 instead
  of a runtime error), batches are capped at 10 messages, messages without an id are treated as notifications,
  `initialize` echoes a supported protocol version the client offers, and `resources/list`, `prompts/list`, and
  `resources/templates/list` answer with empty lists. Tool dispatch only matches the server's own tool names.
- `get_product` returns the public listing (flagged `availability_verified: false`, with a browse link) for the
  loose-diamond ids that `search_inventory` returns, and reports an unknown id as not found. `search_inventory`
  requires a query. Upstream non-JSON responses surface as `upstream_http_error`.
- `/go` accepts HEAD, rejects destinations with a port or userinfo, and records only campaign-tagged clicks,
  without delaying the redirect.
- The Worker serves the repository's `agent-profile.json` verbatim, so the two copies cannot drift.
- `faceup_size` (Node and Python) accepts only numeric carat values between 0.01 and 100.
- Business-profile Worker 0.1.1: no geo coordinate (New York, NY only), CORS preflight answers 204 without a
  body, `get_services` returns an object, empty identity fields are omitted, and the catalog tool no longer
  promises availability for loose stones.
- Data: the IGI verification URL uses the path IGI serves without a challenge page; the HRD Antwerp entry carries
  the June 2025 announcement date and the 2026 effective date with its source URL; the FTC entry states the
  disclosure requirement with the 2018-07-24 revision date; the Dutch Marquise 1 carat face-up anchor is scaled
  from the certified reference stone (9.4 x 5.1 mm); the certificate-term claim names that report; the
  publisher facts say in-person viewings are by appointment; the hexagon entry states the brilliant versus step
  faceting distinction; "open geometry specification" replaces "standard".
- `search_inventory` applies the shape and carat parsed from a loose-diamond query to the listings it returns.
- Encyclopedia: every `related` value now names an existing entry (210 cross-references remapped or dropped),
  entries carry an `aliases` list, and `define` resolves an exact term, then a listed alias, then the best
  prefix or word match; the old related-term fallback that sent "marquise" to the Dutch Marquise entry is
  gone. Corrections: Moissan (1904) identified silicon carbide and Kunz (1905) named it; the oval bow-tie is
  an obstruction effect per GIA; the radiant has step-cut crown facets over a brilliant pavilion per GIA;
  bezel, elongated cushion, certification labs, cut, color, grading report, laser inscription, post-growth
  treatment, and cloud-or-fade entries reworded to match their sources; GIA's 2025-10-01 change is sourced
  wherever it is stated; Federal Register page and CFR section numbers corrected; internal scaffolding
  labels removed from four source entries. The browsable Markdown is generated from the JSON.
- A GitHub Actions workflow now runs the Python (3.9, 3.12) and Node (20, 24) smoke tests on every push.
- Desktop bundle 0.2.5 built from this tree.

## 0.2.4 (2026-09-08)

- Encyclopedia: every entry now carries verified sources with URLs. Eight factual corrections from the
  sourcing audit (Cullinan I at 530.2 ct, octahedral cleavage, hearts and arrows, formation depth of
  90 to 125 miles, HPHT wording, cubic zirconia in 1976, CVD post-growth treatment, refractive index 2.42).
- Price index: StoneAlgo reading refreshed to 2026-09-07, with its URL carried in the data.
- Hosted Worker: loose-diamond searches return public Shopify catalog listings flagged
  `availability_verified: false` plus a first-party browse link. A same-day Worker call to the storefront's own browser-facing diamond-lookup service
  was removed the same day; the Worker holds no credentials and calls only Shopify's public catalog.
- Desktop bundle rebuilt with this data.

## 0.2.3 (2026-09-08)

- Publisher name is Stienhardt throughout. The Dutch Marquise ratio wording gives only the measured
  reference stone. npm install guidance clarified.
- Desktop bundle rebuilt with the corrected data.

## 0.2.2 (2026-09-02)

- Data: the Dutch Marquise entries no longer state a length-to-width range; only the measured
  reference stone (1.84) is given. Publisher name is Stienhardt throughout.
- Worker: tool annotations, /privacy, OpenAI plugin challenge route (deployed).

## 0.2.1 (2026-09-01)

- Added the official MCP Registry namespace metadata and publish manifest.
- Added distinct GitHub and npm attribution links for measurable downstream traffic.
- Removed retired source-control and no-custom-work claims from the public publisher fact sheet.
- Added a self-contained MCP Bundle for one-click local installation and official registry distribution without a package-manager account.
- Updated the Node MCP SDK and locked production dependencies to versions with no known npm audit findings at release time.

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
