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

### Gate semantics

- `GO` means every required check for that phase has objective evidence and no open P0/P1 finding.
- `NO-GO` means implementation may continue, but no production state may be changed for that phase.
- Production changes must be split into independently reversible database, Worker code, Pages, and
  Worker publication-mode changes.
- A failed required check must stop promotion. Do not weaken branch protection, skip CI, or combine
  changes to make a deadline.
- Evidence for a release candidate belongs in `docs/release-evidence/<release-id>/` and must identify
  the Git SHA, Cloudflare deployment/version IDs, Supabase migration versions, test commands, and
  rollback target.

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

### Phase 1D: structured publisher production readiness

Phase 1D finishes the production-safety work started in Phase 1. New Worker code may be deployed to
production while production remains in legacy mode, but structured writes must not be enabled yet.

Required implementation:

- Publish through a temporary ref and a CI-backed promotion path that is compatible with protected
  `main`; neither the structured nor legacy publisher may bypass required checks by patching `main`.
- Preserve atomic three-file publication, optimistic concurrency, replay safety, and response-loss
  recovery through promotion.
- Define an explicit cross-day recovery/backfill protocol so a temporary legacy rollback cannot
  permanently break the seven-day structured history requirement.
- Keep staging isolated: separate branch and KV, no cron, and external writes disabled except during
  an explicitly recorded manual exercise.

Gate:

- `main` rejects force pushes and deletion and requires `worker-security` and `renderer-parity` on an
  up-to-date branch.
- The publisher succeeds under the same protection rules through the supported promotion path.
- Conflict, duplicate trigger, lost response, concurrent update, and failed-promotion tests pass.
- Staging completes all four batches and the JSON plus two Markdown artifacts are byte-consistent.
- A `structured -> legacy -> structured` recovery exercise crosses an Asia/Shanghai date boundary
  without leaving a missing structured day.
- Production has a known-good hardened Worker version running with legacy mode and structured writes
  disabled before any later publication-mode canary.

Rollback:

- Revert to the known-good hardened Worker version with legacy flags; do not use an old unhardened
  deployment as the long-term rollback target.
- Leave failed temporary refs unpromoted, record the reason, and resume through the documented
  recovery/backfill path.

### Phase 3: knowledge-base behavior

- Freeze stable topic/entity IDs, slugs, aliases, and rename behavior before adding pages.
- Keep classification in the Worker; Astro indexes and renders the resulting contract.
- Add fixed topics, entity pages, news-level search, and shareable filter URLs.
- Add a generic authenticated state layer keyed by `entity_type + entity_id` for favorites, read
  state, and annotations.
- Use an expand-contract Supabase migration: add generic tables while retaining
  `favorites.image_id` throughout the compatibility window.
- Keep public content in Git and private state in an authenticated data store.

Gate:

- Topic/entity schema, stable identifiers, aliases, and fixtures validate in Worker and Astro tests.
- Search indexes individual news items across daily reports and preserves shareable filters.
- `supabase/migrations/` contains an idempotent baseline and additive migrations; linked dry-run
  output is archived before applying anything.
- RLS tests cover anonymous access, two distinct users, cross-user reads/writes, duplicate state,
  annotation limits, updates, and deletion.
- Existing image and `video:<id>` favorites remain stored and owner-readable. Because Gallery/Video
  were removed from the Astro product scope, migration `20260716000400` freezes browser writes
  instead of preserving a retired client mutation path.
- A backup reference, before/after row counts, smoke tests, and a forward-fix plan exist before the
  production migration is applied.

Rollback:

- Do not drop or rename legacy columns during this migration. Disable new UI/API reads and keep the
  additive tables in place if rollback is needed.
- Prefer a forward-fix migration after data has been written; destructive down migrations require a
  separate approval and verified backup.

### Phase 4: Astro release candidate and real Pages preview

- Freeze the complete production URL manifest and define which routes are preserved or redirected.
- Implement homepage and non-daily routes required for whole-domain replacement, or explicitly
  implement and test a route-level coexistence architecture.
- Require URL, status, internal-link, RSS, sitemap, robots, 404, canonical, hreflang, metadata,
  accessibility, and performance parity.
- Add news-level search output from Phase 3.
- Run Astro in static mode first.
- Build a real Cloudflare Pages preview from `astro/dist`; a green Hugo preview is not evidence for
  this phase.
- Use the Node version required by the Astro project in Cloudflare Pages.
- Switch the production build command only after explicit preview approval.
- Keep a Hugo rollback path for at least one release cycle.

Gate:

- Full-site Hugo/Astro URL, status-code, canonical, redirect, and internal-link comparison passes.
- RSS and sitemap XML validate and contain the accepted compatibility set.
- Desktop/mobile, keyboard-only, no-JavaScript, axe, Lighthouse, 404, and external-link checks pass
  against the real Astro Pages preview.
- Historical raw HTML has a documented and tested rendering/safety baseline.
- Cloudflare Pages is the single declared production publisher; any remaining GitHub Pages workflow
  has a non-conflicting purpose or is disabled before cutover.
- The user approves the exact Astro preview deployment recorded in the release evidence.

Rollback:

- Retain the last successful Hugo production deployment and a tested configuration-only change that
  restores its build command/output directory.

### Phase 5: controlled production cutover

Production changes run as separate, observable promotions in this order:

1. Apply the backward-compatible Supabase expand migration.
2. Deploy hardened Worker code while production remains in legacy mode.
3. Switch Cloudflare Pages from Hugo to the approved Astro release candidate; do not change Worker
   publication mode in the same change.
4. After Astro stability is confirmed, choose a new Asia/Shanghai report boundary, set the structured
   start date, run a manual canary, and only then allow the four scheduled batches to take over.

Gate:

- Phase 1D, Phase 3, and Phase 4 are `GO`, including protected-main publisher compatibility.
- A cutover manifest records Git SHA, Pages deployment, Worker version, Supabase migrations, safe
  variable snapshot, owners, observation windows, and rollback targets.
- Database, Worker code, Pages, and publication mode each have an independent stop/rollback decision.
- 5xx, unexpected 404, missing routes, inconsistent publication artifacts, or abnormal item counts
  immediately stop promotion and invoke rollback.

Rollback:

- Pages returns to the retained Hugo deployment/configuration.
- Worker returns to hardened code with legacy flags.
- Supabase remains additive and preserves old rows; retired private-state mutation paths stay
  frozen and can be restored only behind a separately reviewed bounded API.

### Phase 6: observation, rollback proof, and cleanup handoff

Phase 6 proves continuous operation and recovery; a successful first deployment is insufficient.

Gate:

- Observe at least one complete Asia/Shanghai report day and all four successful batches.
- Daily JSON and both Markdown outputs remain consistent, and CI passes for Worker-authored changes.
- Search and topic/entity pages pass production smoke tests. Archived favorites, read state, and
  annotations retain owner-read isolation and reject browser insert/update/delete operations.
- Pages rollback and restoration are exercised and recorded.
- Worker cross-day rollback/resume or backfill is exercised and recorded.
- Supabase RLS, legacy/new-client compatibility, and before/after row counts are re-verified.
- No open P0/P1 finding remains, and the independent final review is `GO`.

Cleanup begins only after the observation window:

- Keep Hugo for at least one complete release cycle.
- Remove Hugo, compatibility reads, or legacy database fields only in later, separately reviewed PRs.
- Mark the migration complete only after evidence is archived and the rollback owners accept the
  handoff.

## Cutover checklist

- Every valid Hugo daily route exists in Astro.
- Chinese and English route counts match the accepted compatibility baseline.
- RSS and sitemap entries are equivalent.
- Canonical links point to `https://bubblenews.today`.
- Historical raw HTML renders safely enough for the accepted compatibility baseline.
- Search indexes individual news items after structured data is available.
- `npm run verify` passes in CI.
- The production build change is isolated from Worker and database changes.
- The real Pages preview is generated by Astro, not Hugo.
- Protected-main publication works through the supported promotion path.
- Supabase changes are additive and legacy Gallery/Video favorites remain preserved and private.
- The release evidence names independent rollback targets for Pages, Worker, and Supabase.
