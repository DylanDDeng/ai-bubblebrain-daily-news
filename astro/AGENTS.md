# Astro migration guidelines

## Scope

- This directory is the Astro replacement renderer for Bubble's Brain.
- Hugo remains the production renderer until an explicit cutover decision.
- Read existing content from `../content`; do not copy or rewrite historical Markdown in bulk.
- Treat `../data/daily/*.json` as the future structured source of truth.
- Keep public URLs compatible with Hugo, especially `/daily/:year/:month/:date/` and `/en/`.

## Architecture boundaries

- Cloudflare Worker owns fetching, normalization, deduplication, classification, and publishing.
- JSON data must conform to `../schemas/daily-report.schema.json`.
- Astro owns rendering, navigation, SEO, RSS, and progressively enhanced interactions.
- Do not put selection, scoring, or deduplication business logic in Astro templates.
- Keep user-specific state behind Supabase or another authenticated API; never commit private notes.

## Commands

Run commands from this directory:

```sh
npm run dev
npm run check
npm run lint
npm run test
npm run validate:data
npm run build
npm run verify
```

When starting a long-lived development server, use `npm run dev -- --background`. Manage it with
`npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## Development rules

- Use TypeScript strict mode.
- Prefer Astro components and framework-free scripts until shared client state justifies an island.
- Build pages as static HTML by default. Add SSR only for authenticated private content.
- Preserve canonical URLs, language routes, RSS behavior, and no-JavaScript readability.
- Add or update tests whenever route identity or data-contract behavior changes.
- Run `npm run verify` before claiming the Astro project is ready.
