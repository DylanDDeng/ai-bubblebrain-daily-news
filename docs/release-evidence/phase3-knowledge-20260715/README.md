# Phase 3 knowledge-base implementation evidence

Date: 2026-07-15 UTC

Branch: `codex/astro-phase-3`

Base: `origin/main@8ed05acde833ee01e7fbec85fd4e7e8ebc762d28`

Candidate SHA: pending the final Phase 3 review commit

This evidence covers non-production implementation and validation only. No Supabase production
migration, structured production publication, Pages cutover, or PR #9 merge occurred.

## Current decision

- Phase 3 implementation: pending final independent review.
- Production promotion: **NO-GO**.
- Blocking P0: a credential recovered from historical Worker version metadata still authenticated
  to GitHub with HTTP 200 on the non-echo probe. It must be revoked and re-probed as 401/403.
- PR #9 remains Draft.

## Structured-data preflight

- `origin/main` contains only `data/daily/.gitkeep`; it contains no production daily JSON.
- The working tree contains no `data/daily/*.json` production report.
- Production Worker version `48db3075-f23f-4324-af83-779d4235b80d` remains 100% deployed with:
  - `DAILY_PUBLISH_MODE=legacy`
  - `DAILY_STRUCTURED_WRITES_ENABLED=false`
  - `DAILY_PRODUCER_VERSION=phase1d-production`
  - `GITHUB_BRANCH=main`
  - `GITHUB_PUBLISH_STRATEGY=pull_request`

Therefore the daily v1 taxonomy additions remain eligible for the first structured report. This
preflight must be repeated immediately before any production structured write.

## Taxonomy and Astro evidence

- Registry schema, semantic lifecycle rules, provider coverage, and referential validation pass.
- Taxonomy evolution validation rejects removed IDs/slugs/aliases, changed entity types, reactivated
  tombstones, and changed merge targets.
- All 11 structured source providers have an explicit mapping entry and a mapping/fallback fixture.
- Historical merged IDs remain valid in daily reports and resolve to canonical IDs for search and
  directory counts; deprecated tombstones remain addressable.
- Search is indexed per news item across reports and targets stable `#news-<id>` anchors.
- Shareable filters use stable topic/entity IDs.
- Astro build generates `dist/_redirects` from the registry for true Cloudflare Pages 301 behavior;
  redirect HTML remains a fallback. A real Pages preview status/Location check remains a Phase 4 Gate.

Validated locally:

- Root tests: 217/217 passed.
- Taxonomy targeted tests: 24/24 passed.
- Astro tests: 14/14 passed.
- Astro diagnostics: 0 errors, 0 warnings, 0 hints.
- Astro build: 240 pages and generated `dist/_redirects`.
- Hugo/Astro renderer parity: 208 daily routes.
- Production and isolated staging Worker dry-run bundles passed.
- Hugo strict build with `--panicOnWarning --printPathWarnings` passed.

## Supabase linked preflight

Linked project: `znurdobjryrhshzkalup`

Migrations staged locally and absent remotely:

- `20260715000100_legacy_baseline.sql`
- `20260715000200_add_private_entity_state.sql`

Read-only checks:

- Linked `db lint --level warning`: no schema errors.
- Final linked `db push --dry-run --include-all` listed only the two migrations above and explicitly
  reported that migrations would not be pushed.
- Final linked migration list shows both local versions with an empty remote version.
- Production migration has not been applied.

## Backup and row counts

Supabase reported no platform backup entries and PITR is disabled. Before any migration, a local
logical backup of the linked `public` schema and data was created under the untracked, never-staged
directory `output/phase3-pre-migration-20260715/`.

- `schema.sql`: 6,842 bytes,
  SHA-256 `2202c8f2610ea228c49d67ae207f847fc70f73c326fd68f5681dd111544eddf9`
- `data.sql`: 5,265 bytes,
  SHA-256 `977a5040bac05327f603aadac06749c82897931d14ad36004d904a0c94f45533`

Exact pre-migration rows from the COPY sections in that dump:

| Table | Rows |
| --- | ---: |
| `public.profiles` | 2 |
| `public.comments` | 13 |
| `public.favorites` | 14 |

Post-migration exact counts, authenticated production smoke tests, and the backup restore reference
must be appended before production migration approval.

## Local database Gate

- Local reset applied both migrations successfully.
- pgTAP: 42/42 passed.
- The same two migrations were executed a second time against the same database.
- pgTAP after the second run: 42/42 passed.
- Tests cover anon denial, two authenticated users, cross-user reads/updates/deletes, forged owner,
  duplicate state, trimmed and typed entity keys, stable news/topic/entity ID patterns, annotation
  limits, and owner delete.
- Authenticated legacy client shapes cover ordinary image and `video:<id>` select, insert, duplicate,
  delete, same ID across two users, and cross-user isolation.

The compatibility behavior is frozen in `docs/contracts/PRIVATE_STATE_COMPATIBILITY.md`.

## Forward-fix and rollback

- Both migrations are additive; `favorites.image_id` is retained unchanged.
- New image/video clients do not switch to generic state during this observation window.
- Rollback disables new knowledge-state UI/API access and retains both additive tables.
- Any data correction after production writes uses a new forward-fix migration.
- Destructive down migrations are forbidden without a separately verified backup and approval.

## Remaining approval conditions

1. Revoke the historical GitHub credential and verify the old value returns HTTP 401/403.
2. Commit the reviewed Phase 3 candidate and record its immutable SHA and CI results.
3. Complete independent review with P0=0 and P1=0 for the non-production implementation.
4. Before production apply, record exact backup location, pre/post counts, and authenticated smoke.
