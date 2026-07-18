# ADR-001: Content database v4.1 boundaries and platform deviations

> Production-topology amendment: ADR-002 replaces the physical-isolation choice with an
> owner-approved shared Supabase project protected by strict logical isolation. All other release,
> fencing, immutability and fail-closed requirements remain in force.

- Status: Accepted for implementation; production write switches remain disabled
- Date: 2026-07-17
- Scope: high-frequency structured daily reports only

## Decision

Structured daily content uses Supabase Postgres for facts, revisions, relationships, release catalogs, fencing state, drafts, roles and audit metadata. Exact report bytes, site manifests, production artifacts, audit exports and logical backups use separate private Cloudflare R2 buckets. Git remains the source for code, migrations, tests and configuration; it remains the production content source during the dual-write phase.

Astro builds only from an immutable `site_release_id`. A build may not query a latest report or revision. The frozen ownership boundary is:

- dates before `2026-07-16`: exact Git code SHA owns legacy Markdown;
- dates on or after `2026-07-16`: the site release manifest owns structured reports;
- an overlap, duplicate route owner or unexplained post-cutover gap fails the build.

Release pinning does not make an unpromoted release public. Public Content API report, item, search and manifest RPCs return content only when the release has an artifact with `production_verified_at`. Preview and Production builds use the authenticated Deployer endpoints backed by `get_build_release_manifest_v1` and `get_build_release_report_v1`; those endpoints require `CONTENT_BUILD_API_SECRET`, return exact R2 bytes only after hash and byte-length verification, and set `Cache-Control: private, no-store`. This keeps an immutable build input available without exposing staged content through the reader capability.

Production publication has one owner: the exact-artifact GitHub workflow plus the Production Deploy Broker. The Broker alone holds the production Pages token. Cloudflare Git production publishing and manual `wrangler pages deploy` are prohibited after the Phase 5 cutover. Manual recovery uses the Broker and the same database fencing slot.

Production artifacts use `sha256-content-addressed-pages-v1`: a small immutable JSON inventory binds every safe path to byte length, SHA-256, Cloudflare Pages asset hash and an immutable `assets/sha256/<hash>` R2 object. The outer inventory hash is the release artifact identity. This replaces whole-site in-memory tar extraction after the one-year projection exceeded the original 96 MiB Broker assumption. The CI uploader validates the inventory and local files without retaining the whole site in memory, uses eight bounded workers for conditional R2 writes, and GET-verifies every asset and the inventory; an existing non-exact object fails closed. The Broker verifies the inventory and embedded route identity first, asks Pages which hashes are missing, then fetches and verifies only those assets in bounded batches. Rollback reads the same locked inventory and assets. Legacy deterministic tar verification remains accepted only for already registered local/backward-compatible artifacts.

Git-first mirroring uses a database publication slot keyed by report date and batch, bound to the exact report content SHA-256. A retry before finalization reuses the same reservation; a retry after a committed response is lost returns the same finalized release and cannot add a second outbox row. A different payload for the occupied slot is a CAS conflict. Failed mirrors are repaired from the exact open PR candidate or the exact merged/squash commit and never refetch providers.

Publication attempt history is append-only. `attempt_number` is monotonic within the semantic
`(report_date, batch_id, input_sha256)` identity: an in-flight retry may reuse the single `started`
row, but a retry after failure appends a new row and can never overwrite or downgrade a terminal
success.

Production promotion and rollback verify the deployed identity at all configured endpoints, purge the explicitly configured Content API current-pointer URLs, and only then execute pointer CAS. An invalid purge configuration or Cloudflare purge failure is fail-closed and cannot be reported as deployed. The Broker token therefore needs only Pages deployment and the named zone-cache purge capability; those permissions require a real pre-cutover negative drill.

## Capability isolation

Five Postgres LOGIN roles are created with `NOINHERIT`, `NOBYPASSRLS`, no schema creation and no base-table privileges:

- `content_ingestor`: ingestion, snapshot and editorial materialization RPCs;
- `content_editor`: read-only admin, draft and Preview RPCs;
- `content_controller`: role/settings/suppression and rollback authorization RPCs;
- `content_reader`: release-pinned public read/search RPCs;
- `content_deployer`: outbox, artifact, deployment, fencing and pointer RPCs.

Runtime components do not receive the existing Supabase `service_role`. Routine Admin and Control Plane use separate Access applications, hostnames, Hyperdrive credentials, Worker secrets and service bindings. Every control mutation requires Access plus TOTP step-up, a reason, typed confirmation, request-bound attestation and a database role lookup.

Editorial removal has two explicit scopes. A `report_hidden=true` draft patch names one `report_date`, removes only that report placement and its generated references, and does not create a global override. Owner-only global suppression removes the item across the site. Both paths preserve the base release, materialize a new immutable snapshot/release, enforce publish kill switches at claim, stage and finalize, and record request/finalization audit events.

## Ed25519 identity attestation

The Identity Attestation Worker signs request-bound assertions with an Ed25519 private key that is
never present in Routine Admin, Control or Postgres. Postgres installs `pgsodium` and stores only the
matching 32-byte public key. `consume_attestation_v1` verifies the detached signature inside the
security-definer RPC before it trusts any subject, audience, action or authentication context.

- assertions expire within 60 seconds and bind `sub`, audience, action, body SHA-256, `iat`, `exp`,
  key ID and a UUID JTI;
- the database consumes each JTI once and resolves the subject's active role server-side;
- action-to-audience policy is fail-closed: draft editing and Preview use Routine, while publishing
  a verified Preview and every production/control mutation use Control;
- Control assertions require the separate Control Access audience plus a newly validated TOTP code;
- rotation stages a new public key under a new immutable key ID, permits both versions during the
  overlap, then retires the prior key; staging/retirement requires an active Owner, a reason and an
  audit record containing public-key hashes but no private material.

Routine and Control Workers can forward assertions but cannot create them. The database never holds
the Ed25519 private key, and a key ID cannot be reused for different key material.

## Function ownership

All functions in the `private` schema are owned by the dedicated
`content_rpc_owner NOLOGIN NOSUPERUSER NOBYPASSRLS` role. The migration identity receives
only a non-inherited, `SET ROLE`-enabled membership needed to create and replace those
functions; none of the five runtime capability roles has any membership or `SET ROLE`
target. Every security-definer RPC also uses `SET search_path = ''`, schema-qualified
objects and an explicit execute grant matrix. pgTAP verifies function ownership,
search-path hardening, runtime role attributes, zero runtime table DML, and the absence
of runtime role memberships on every reset.

## Physical isolation decision

The currently linked project (`znurdobjryrhshzkalup`) also contains community/auth state and is not an acceptable production content database. No production content writes, Hyperdrive creation or principal bootstrap may target it. A new Supabase project is required before Phase 1 production deployment. Creating that project can incur cost and requires explicit owner authorization.

## Retention and recovery

- report snapshots, site manifests and deployed artifacts: indefinite Object Lock;
- audit exports: at least 365 days;
- encrypted logical backups: 30-day Object Lock plus Supabase PITR;
- online audit: quarterly range partitions with forced RLS;
- successful publication attempts and deployed outbox rows: 180 days online;
- failed attempts, DLQ and recovery evidence: at least 365 days;
- published-content RPO: 0 from content-addressed R2;
- database/admin RPO: at most one hour;
- restore-to-service RTO: at most four hours.

PITR availability is a Phase 5 hard gate. If the selected Supabase plan does not support it, the owner must explicitly accept a documented replacement RPO before cutover.

Operational retention is invoked by the Deployer at most once per 23 hours. Runtime code can only
call the bounded pruning RPC; partition DDL remains migration-owned so the Deployer cannot create or
alter tables. Every completed retention run writes an audit record.

Production observability runs from a separate five-minute GitHub workflow. Its database credential
must be the isolated project's `content_deployer` role and can execute only a security-definer
snapshot RPC; owner/service-role connections are rejected by configuration validation. The monitor
compares the database current pointer with two Content API endpoints and two static custom-domain
manifests, evaluates canonical batch terminal status at +10 minutes, search freshness, outbox/DLQ,
and Cloudflare five-minute 5xx/cache signals. It exits nonzero on a high-severity condition. A live
fired-and-recovered alert-channel drill remains a production gate.

## Non-decisions

This migration does not turn the site into a general CMS, move ordinary long-form pages to the database, enable Gallery/Video/comment writes, make Astro SSR, rewrite Git history or allow browsers to write database tables.
