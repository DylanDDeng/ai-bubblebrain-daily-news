# Private state compatibility contract

Phase 3 adds `entity_state` and `annotations` without changing the legacy `favorites` table or
`favorites.image_id` API.

## Compatibility window

- Existing image and video clients remain the only writers and readers of legacy favorites.
- Both ordinary image IDs and `video:<id>` continue to use the existing authenticated owner-only
  select, insert, and delete policies.
- The migration performs one idempotent snapshot backfill into `entity_state`; later legacy writes
  are not silently dual-written.
- During the observation window, no new client may treat the generic image/video rows as the source
  of truth. This prevents a partial dual-write from creating hidden divergence.
- New knowledge-base state uses only `daily_item`, `topic`, and `entity`. Image/video migration to
  a generic client is a later, separately reviewed expand-and-observe release.

## Rollback and repair

- Rollback disables new knowledge-state UI/API reads and writes while leaving both additive tables
  and all legacy columns in place.
- Data already written to the additive tables is retained. Corrections use a forward-fix migration;
  no destructive down migration is allowed without a separately verified backup and approval.
- Production evidence must include pre/post row counts and authenticated legacy image/video smoke
  tests before the compatibility window can close.
