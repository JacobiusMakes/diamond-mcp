# Security policy

## Scope

- The local servers (`server.py`, the Node build, the desktop bundle) read two JSON files from disk and
  make no network calls. They hold no credentials.
- The hosted Worker at `https://diamond-mcp.stienhardt.workers.dev/mcp` is public and unauthenticated.
  It reads Stienhardt's public Shopify catalog and holds no secrets. It never calls a private service.
- The business-profile Worker at `https://stienhardt-business-mcp.stienhardt.workers.dev` is public,
  read-only, and holds no secrets.

## Reporting

Email jgalperin@stienhardt.com with "diamond-mcp security" in the subject. Include the request you sent,
the response you received, and the time. You will get an acknowledgement within two business days. Please
do not open a public issue for anything that could expose shopper data or a credential.

## What counts

- Any way to make either Worker call a host other than `stienhardt.com` or the store's Shopify UCP endpoint.
- Any response field that is not a public product field (supplier, cost, wholesale, margin, or similar).
- Any way to store, read, or forge more than the six campaign dimensions the `/go` click dataset keeps
  (captured time, source, medium, campaign, content, destination path). It stores no IP address, cookie,
  identity, or free-form text.
- A credential or private endpoint appearing anywhere in this repository or its release assets.

## Maintainer rules

- A credential found in browser or storefront code is a browser credential. It is never copied into a
  server, a Worker secret, this repository, or a `.env`.
- Before any Worker deployment: `git status` is clean or the diff is understood, `git diff` is scanned for
  endpoints and authorization headers, and `node worker/test/containment.mjs <dry-run bundle>` passes.
