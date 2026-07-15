# Astro migration plan

## Goal

Replace Hugo as the presentation layer without coupling ingestion to a specific site generator or
changing public URLs during the migration.

## Non-goals for Day 0

- No production traffic moves to Astro.
- No Hugo templates are deleted.
- No historical Markdown is rewritten.
- No static-to-SSR migration.
- No Supabase-to-D1 migration.
- No Worker publishing behavior changes yet.

## Stable contracts

### Public routes

- Chinese daily: `/daily/YYYY/MM/YYYY-MM-DD/`
- English daily: `/en/daily/YYYY/MM/YYYY-MM-DD/`
- Chinese is the unprefixed default language.
- Existing paths must not change without redirects and a link audit.

### Daily report data

- Canonical location: `data/daily/YYYY-MM-DD.json`
- Schema: `schemas/daily-report.schema.json`
- Timezone: `Asia/Shanghai`
- Score scale: `0-10`
- `id` identifies a stable source item.
- `event_id` groups multiple sources covering the same event.
- `published_at`, `ingested_at`, and `time_precision` must remain distinct.

Markdown in `content/daily` and `daily` is a deterministic compatibility product generated from the
same in-memory report object. JSON and Markdown must not be maintained independently.

## Migration phases

### Day 0: parallel renderer foundation

- Create the Astro static project in `astro/`.
- Read existing daily Markdown without copying it.
- Preserve daily permalink shapes.
- Establish schema validation, tests, linting, formatting, and build checks.
- Keep Hugo as the only production renderer.

### Phase 1: safe structured publishing

- Authenticate the manual Worker trigger.
- Add a run lock and batch idempotency key.
- Deduplicate using a stable normalized item ID.
- Generate daily JSON and both Markdown outputs from one report object.
- Commit all outputs atomically through the Git Data API.

### Phase 2: timeline parity

- Render the daily timeline from JSON in both Hugo and Astro.
- Fall back to historical Markdown when JSON is absent.
- Add date navigation, batch grouping, mobile layout, and no-JavaScript content.
- Compare route counts and HTML snapshots between renderers.

### Phase 3: knowledge-base behavior

- Add fixed topics and entity pages.
- Add news-level search and shareable filter URLs.
- Generalize Supabase state to `entity_type + entity_id` for favorites, read state, and annotations.
- Keep public content in Git and private state in an authenticated data store.

### Phase 4: production cutover

- Require URL, RSS, sitemap, metadata, accessibility, and performance parity.
- Run Astro in static mode first.
- Switch the build command only after production preview approval.
- Keep a Hugo rollback path for at least one release cycle.

## Cutover checklist

- Every valid Hugo daily route exists in Astro.
- Chinese and English route counts match the accepted compatibility baseline.
- RSS and sitemap entries are equivalent.
- Canonical links point to `https://bubblenews.today`.
- Historical raw HTML renders safely enough for the accepted compatibility baseline.
- Search indexes individual news items after structured data is available.
- `npm run verify` passes in CI.
- The production build change is isolated from Worker and database changes.
