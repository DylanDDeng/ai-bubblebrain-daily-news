# Private state archive compatibility contract

Phase 3 added `entity_state` and `annotations` without changing the legacy `favorites` table or
`favorites.image_id` API. The 2026-07-16 auth/comments rollout removed the Gallery/Video product
surfaces and supersedes the earlier browser-write compatibility window with migration
`20260716000400_freeze_unused_legacy_writes.sql`.

## Compatibility window

- Existing image and video favorites remain stored and owner-readable for recovery and future
  migration, but the retired Gallery/Video clients are no longer supported writers.
- Authenticated browsers retain owner-only select access to `favorites`, `entity_state`, and
  `annotations`; insert, update, and delete privileges are revoked for all three tables.
- The migration performs one idempotent snapshot backfill into `entity_state`; later legacy writes
  are not silently dual-written.
- No current Astro feature treats generic or legacy private-state rows as writable source of truth.
- Any future restoration must use a bounded API and a separately reviewed expand-and-observe
  migration; direct PostgREST writes must not be restored implicitly.

## Rollback and repair

- Rollback leaves the read-only archive tables and all legacy columns in place.
- Data already written to the additive tables is retained. Corrections use a forward-fix migration;
  no destructive down migration is allowed without a separately verified backup and approval.
- Production evidence must include pre/post row counts, owner-read isolation, and authenticated
  insert/update/delete denial for all archived private-state tables.
