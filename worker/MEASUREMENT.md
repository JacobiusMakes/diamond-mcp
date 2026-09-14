# Hosted catalog and outbound measurement, September 14, 2026

Deployed Worker version: `0289ce24-b557-4f2c-8310-bca2ddb00d0d`.

## Catalog behavior

Loose-diamond searches apply requested shape, carat and maximum USD catalog price. Unknown prices and non-USD quotes are excluded when a USD budget is supplied. `filters_applied` names actual checks; `filters_unverified` lists requested color, clarity and grading lab that were not checked. These are public catalog listings, not verified individual-stone stock. Results are bounded upstream candidates, not a complete inventory scan. Jewelry budget filtering remains separate future work.

## Measurement contract

Store results preserve `url` and `browse_url`. Optional `measured_url` and `measured_browse_url` route through the existing `/go` redirect. They preserve the merchant URL, selected variant and campaign parameters. Generating a result does not log a visit.

The redirect records tagged GET requests in the existing 90-day KV store. HEAD requests and requests declaring prefetch/preview purpose are excluded. Storage failures cannot block the merchant redirect. A static diagnostic identifies write failures without logging the request.

These counts are redirect requests, not unique people, confirmed landing-page views, or orders. Undeclared bots, repeat clicks and link scanners can still contribute. Historical data collected before this release includes HEAD requests and cannot be corrected retrospectively from the existing schema, which did not store request method. Annotate the September 14 change when comparing periods.

The optional measured links use fixed tool/link-role content labels. The merchant UTM content retains the product-specific label. Compare aggregate source/campaign totals across the two datasets, or explicitly map destination paths; do not join their content labels as if they were identical.

## Customer journey evidence

1. MCP response: recommendation generated, not recorded by the stateless server.
2. Measured redirect: a request for the outgoing link, with the limitations above.
3. GA4/Shopify landing session: a separate observation of arrival and campaign tags.
4. Cart, appointment or checkout: downstream intent, not a sale.
5. Order attribution: retain the observed source and its attribution model. A campaign-associated order is not proof of incremental lift.

The existing storefront attribution spine and external attribution scoreboard remain the downstream systems. This release does not modify Shopify theme code, consent behavior, customer identity, or checkout. It does not claim a newly verified customer-level join or deployment of PostHog.

## Validation

- 17 inventory cases passed.
- 18 bundled HTTP handler cases passed, including a mocked full search that excludes over-budget and missing-price products.
- Measured-link tests passed for URL preservation, fixed labels and destination constraints.
- Bundle containment check passed.
- Live hosted search for `2 carat oval under $2000 D color` returned three USD catalog listings below the cap, with color explicitly unverified and measured links present. No measured links were visited during verification.

Commands from repository root:

```powershell
node worker/test/inventory.mjs
node worker/test/measurement.mjs
npx wrangler deploy --config worker/wrangler.toml --dry-run --outdir .test-build-20260914
node worker/test/handler.mjs worker/.test-build-20260914/index.js
node worker/test/containment.mjs worker/.test-build-20260914/index.js
```

Wrangler resolves the output directory relative to its worker configuration.
