# Content database backup and isolated restore runbook

## Targets

- published content RPO 0 through immutable report/site/artifact objects;
- database/admin RPO at most one hour;
- restore-to-service RTO at most four hours.

## Backup setup

1. Enable Supabase PITR and record its retention window. No Phase 5 cutover without evidence.
2. Create the dedicated `content_backup` credential separately from all runtime roles. It has
   `BYPASSRLS` only because the content tables force RLS; its object grants are read-only and limited
   to the content table families in `private`, excluding the shared project's community tables.
3. Configure the hourly backup workflow with the database URL, dedicated R2 S3 credentials and an offline-held age recipient.
4. Set `CONTENT_DATABASE_PROJECT_REF` to the target project. The workflow extracts the project ref
   from the database URL and requires an exact match. Using `znurdobjryrhshzkalup` additionally
   requires `CONTENT_DATABASE_TOPOLOGY=shared_project` and the exact ADR-002 acknowledgement.
5. Give `R2_LOCK_READ_API_TOKEN` read-only access to R2 bucket-lock configuration. Before any upload, the workflow reads the live lock rules and requires an enabled rule covering the exact object key for at least 30 days.
6. Confirm audit export objects use `bubble-content-audit`; its workflow independently requires a live covering lock rule for at least 365 days.
7. Configure `SUPABASE_MANAGEMENT_API_TOKEN` and separate list/read-only backup-monitor credentials.
   Configure the exact Deployer `/internal/recovery-health` URL and a dedicated callback secret that
   matches only the Worker's `RECOVERY_MONITOR_SECRET`. Set `CONTENT_RECOVERY_MONITOR_ENABLED=true`
   only after the production database credentials exist. The monitor checks PITR and the newest encrypted
   backup twice per hour, appends signed health to the Admin Dashboard and fails high when either PITR
   is disabled or backup age exceeds 3,600 seconds.
8. Route failed `Content Recovery RPO Monitor` runs to the high-severity operations channel. GitHub's
   schedule is not the alert receiver; an external monitor must also alert when the scheduled workflow
   itself has not completed within 45 minutes. Dashboard independently marks its last result `stale`
   after that interval.

The daily audit workflow exports exactly one closed UTC day in append order, encrypts
the JSONL before upload, writes to a ciphertext-content-addressed key, and re-downloads
the object to verify its byte length and SHA-256. A manual rerun must name the closed
UTC date explicitly; a later export with different bytes receives a different immutable
key rather than overwriting prior evidence.

The backup workflow creates a PostgreSQL custom-format dump of the explicit content table families,
not the shared project's unrelated community tables. It records plaintext and ciphertext hashes plus
start/completion time and tool version, encrypts before upload, addresses the object by ciphertext
SHA-256, verifies a live covering R2 lock rule, then re-downloads it and compares checksum and length.
A conditional-write failure is accepted only if a subsequent `HEAD` proves the content-addressed
object exists; arbitrary upload errors are never swallowed. A GitHub artifact is not a backup.

`scripts/assert-r2-lock.mjs` and `scripts/assert-content-recovery-health.mjs` are fail-closed parsers for the Cloudflare and Supabase responses. Their local unit tests prove prefix, duration, disabled-rule, stale-backup and disabled-PITR rejection; only real workflow evidence can satisfy the production gate.

## Monthly restore drill

1. Create or select an empty, isolated Supabase restore project. Never restore over production.
2. Download the chosen locked backup with read-only recovery credentials and verify its ciphertext SHA-256.
3. Decrypt with the offline age identity and restore with the matching `pg_restore`
   major version. The dump intentionally omits owner and ACL metadata so it can enter a
   clean isolated project without importing production credentials.
4. Run every repository migration in lexical order, not only newer migrations. The
   migrations are literal-second-run idempotent and restore the dedicated
   `content_rpc_owner`, forced RLS, function ownership and exact grant matrix that the
   ownerless dump cannot preserve. Then compare migration checksums.
5. Run all pgTAP tests and the five-role allow/deny matrix.
6. Compare report/release/item counts and sample at least ten report snapshot hashes against R2.
7. Rebuild the current `site_release_id` byte-exact and compare artifact fingerprint/route identity.
8. Verify auth/Profile/community RLS remains isolated and unchanged.
9. Record achieved RPO/RTO, commands, hashes and reviewer in `docs/release-evidence/content-restore-<date>/`.
10. Destroy the temporary restore project's secrets after evidence capture.

Any failed hash, role grant or current-release rebuild makes the restore drill NO-GO and blocks production cutover.

The scheduled health monitor proves availability and freshness, not restore correctness. A successful monthly isolated restore within the one-hour RPO and four-hour RTO remains mandatory.
