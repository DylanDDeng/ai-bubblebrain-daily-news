# Astro release route ownership

Phase 4 uses an explicit build-time coexistence boundary. Cloudflare Pages publishes one artifact,
`astro/dist`, while route ownership is split as follows:

- Astro owns the homepage, both daily archives, every daily detail route, knowledge search,
  topic/entity routes, metadata feeds, sitemaps, robots, redirects, and the custom 404.
- Hugo remains a build-time compatibility renderer for `about`, `ai-tools`, `curations`,
  `highlights`, `model-evals`, `my-publish`, `prompts`, and `x-trending`, including their English
  routes. These trees depend on specialized templates, JSON, and browser behavior that a generic
  Markdown renderer cannot preserve.

The machine-readable allowlist is `astro/route-ownership.json`. `npm run build --prefix astro`
builds Astro first, generates Cloudflare redirects, builds Hugo 0.147.9 in an isolated temporary
directory, and copies only declared compatibility HTML and bundled MP4 resources into `astro/dist`.
RSS, sitemap, JSON, robots, redirects, and custom 404 output remain Astro-owned. The merge fails if
Hugo would overwrite an existing Astro file. It records every copied file and SHA-256 digest in
`.well-known/legacy-compat-manifest.json`, then deletes the temporary Hugo output.

The build also emits `.well-known/site-route-manifest.json`, a complete route/status/owner/content
type/indexability contract. `npm run verify:site` checks that manifest against the built files,
redirect targets, canonical and hreflang metadata, all 27 XML endpoints, internal links, Hugo route
parity, and representative behavior markers for image compression, model evaluations, and
highlights.

This is not a second publisher and it does not route traffic between two deployments. Cloudflare
Pages receives one immutable static artifact. Astro-owned paths can never be overwritten by the
compatibility merge. Moving a compatibility route to Astro requires a reviewed ownership-manifest
change plus URL, behavior, accessibility, and visual parity evidence.

The 99 executable files under `/eval-demos/` are static compatibility assets, not trusted app code.
Their versioned aggregate hash lives in `astro/raw-html-policy.json`; Cloudflare `_headers` applies a
CSP sandbox without `allow-same-origin`, disables indexing, strips referrers, and denies sensitive
browser capabilities. A later release may move them to a dedicated origin without changing the
knowledge routes.

Cloudflare Pages is the sole production publisher. GitHub Actions builds and uploads an immutable
`astro/dist` verification artifact but no longer publishes GitHub Pages. Rollback keeps the previous
standalone Hugo Cloudflare deployment and its build configuration for at least one complete release
cycle.
