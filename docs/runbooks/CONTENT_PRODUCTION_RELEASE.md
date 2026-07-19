# Content production release and rollback runbook

## Preconditions

1. Confirm the Supabase topology from ADR-002, all five capability connections and Hyperdrive bindings.
2. Confirm all content settings are false before deployment.
3. Dispatch the protected `content-runtime-preflight.yml` against the exact candidate SHA. It performs
   no deployment and must prove live indefinite lock coverage for report snapshots, site manifests,
   artifact assets and artifact inventories. Separately confirm audit and backup retention rules.
4. Run `npm run content:production:preflight`. It must reject every `REPLACE_WITH_*`, `replace-with-*`, all-zero Hyperdrive ID, malformed Access origin/audience, invalid zone ID, non-HTTPS endpoint and incomplete verifier/purge set. For `test1`, every database workflow must also set `CONTENT_DATABASE_TOPOLOGY=shared_project` and the exact ADR-002 acknowledgement.
5. Confirm the exact code SHA is on the workflow ref and Node is `22.17.0`.
6. Run `bash scripts/test-supabase-local.sh`, root tests, Astro verify and all content Worker dry-runs.
7. Confirm Cloudflare Git production publishing is disabled and the production token exists only in the Broker. The token must have the production Pages deploy permission and cache-purge permission only for `CLOUDFLARE_ZONE_ID`.
8. Resolve every HTTPS URL in `CONTENT_API_PURGE_URLS`; it must contain each public `/v1/current` convenience endpoint and no wildcard.
9. Configure `CONTENT_BUILD_API_ORIGIN` to the isolated Deployer origin and store a dedicated `CONTENT_BUILD_API_SECRET` in both release and editorial Preview workflow environments. It must not be a reader, Broker or database credential. Both workflows run the environment preflight after checkout and reject weak/missing secrets, malformed UUID/SHA inputs and placeholder-like URLs before build or upload.
10. Verify public manifest/report/item/search calls deny a known unpromoted release ID while the authenticated Deployer build endpoints return its exact R2 bytes.
11. Configure a Workers Observability alert on structured Deployer errors where `component=content-deployer`, `event=outbox_alert` and `reasons` contains either a DLQ count or a queued/failed row older than ten minutes.
12. Enable the recovery monitor and route backup/PITR age failures to the high-severity channel.
    Configure its `CONTENT_RECOVERY_CALLBACK_SECRET` to match only the Deployer's
    `RECOVERY_MONITOR_SECRET`; archive one successful live monitor and Dashboard callback before cutover.
13. Provision the attestation key without ever copying private material into Postgres:
    generate an Ed25519 key pair offline, set `ATTESTATION_ED25519_PRIVATE_JWK` only on the Identity
    Attestation Worker, and pass the raw 32-byte public key as base64url in
    `ATTESTATION_ED25519_PUBLIC_KEY` to `npm run content:bootstrap`. The same immutable key ID must be
    configured as `ATTESTATION_ED25519_KEY_ID` in both places.
14. Configure and manually dispatch `content-observability.yml`, then enable its five-minute schedule.
    A failed job is a high-severity alert and must feed the production incident channel. Archive a
    fired-and-recovered drill before cutover; local implementation alone does not close this gate.

## Production observability workflow

Use the `content-production-observability` GitHub environment. Configure:

- secret `CONTENT_OBSERVABILITY_DATABASE_URL` for the `content_deployer` role;
- variables `CONTENT_DATABASE_PROJECT_REF`, `CONTENT_DATABASE_TOPOLOGY` and
  `CONTENT_SHARED_PROJECT_ACK`; unacknowledged shared-project use is rejected;
- secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID` and a read-only
  `CLOUDFLARE_ANALYTICS_API_TOKEN` scoped to zone analytics;
- two distinct exact `/v1/current` endpoints in `CONTENT_CURRENT_URLS`;
- two distinct custom-domain
  `/release-manifests/site-route-manifest.json` endpoints in `CONTENT_STATIC_MANIFEST_URLS`;
- exact UTC cutover timestamp in `CONTENT_OBSERVABILITY_STARTED_AT`; canonical batch slots before
  this boundary are intentionally outside the monitor's SLA;
- optional `CONTENT_API_CACHE_HIT_MINIMUM` and `CONTENT_API_CACHE_SAMPLE_MINIMUM` variables, then
  set `CONTENT_OBSERVABILITY_ENABLED=true` only after the manual run is healthy.

Every run validates configuration before connecting, reads only
`private.get_content_observability_v1()`, probes both API and static identities without cache,
queries the preceding five-minute Cloudflare analytics window, and exits nonzero for a batch lacking
terminal status ten minutes after a canonical slot, a failed batch, identity drift, stale search,
5xx above 1%, cache degradation with enough samples, a stale outbox row or any unresolved DLQ row.
Rows explicitly terminalized as `superseded_by_history_bootstrap` remain immutable evidence but are
not actionable DLQ alerts. A valid
zero-traffic window does not create a false 5xx/cache alert because the explicit endpoint probes
still prove reachability.

For the required drill, use an isolated non-production monitor environment. First lower the cache
threshold above the measured value or point one manifest URL at a known stale Preview, verify one
failed workflow reaches the high-severity channel, restore the exact production configuration, and
archive the following successful run. Do not alter production content, database rows, current
pointer or immutable R2 objects to manufacture the alert.

## Attestation key rotation

1. Generate a new Ed25519 key pair offline and choose a never-before-used key ID.
2. Stage the public key while the previous key remains active:

   ```sh
   CONTENT_DATABASE_ADMIN_URL=... \
   CONTENT_DATABASE_PROJECT_REF=... \
   CONTENT_OWNER_ACCESS_SUB=... \
   CONTENT_ATTESTATION_ROTATION_REASON='scheduled Ed25519 rotation' \
   ATTESTATION_ED25519_NEW_KEY_ID=content-attestation-YYYY-MM-v2 \
   ATTESTATION_ED25519_NEW_PUBLIC_KEY=... \
   npm run content:attestation:rotate
   ```

3. Deploy the Attestation Worker with the matching new key ID and
   `ATTESTATION_ED25519_PRIVATE_JWK`, then verify both Admin audiences and a Control TOTP action.
4. Retire the prior public key by rerunning the command with a fresh new key ID/public key when
   rotating again, or during the same planned cutover add
   `ATTESTATION_ED25519_RETIRE_KEY_ID=<prior-id>`. The script requires an active Owner, refuses the
   unacknowledged shared topology and key-ID replacement/reuse, and writes `attestation.key.stage` or
   `attestation.key.rotate` audit evidence.
5. Never place the private JWK in a database URL, migration, audit record or repository file.

## Normal release

1. Ingestion creates one canonical report byte sequence and writes the content-addressed report object.
2. The database transaction records the verified object, reserves a monotonic site release and creates the outbox row.
3. The dispatcher starts `content-release.yml` with the exact code/content/release/environment identity.
4. GitHub fetches the pinned manifest and reports only from the authenticated Deployer build endpoints using `CONTENT_BUILD_API_SECRET`. Public reader RPCs remain unavailable until production verification.
5. GitHub builds twice-verifiable static output. Its bounded-concurrency uploader validates every local file against the inventory, conditionally writes each unique `assets/sha256/<hash>` R2 key, GET-verifies every asset byte length and SHA-256, then conditionally writes and GET-verifies the inventory before registering its hash. Any pre-existing non-exact object is a critical collision.
6. The exact files deploy to the Preview project. Route parity must pass before the workflow contacts the Broker.
7. The Broker compares the signed request to immutable database state, obtains the promotion fencing token, verifies the exact R2 inventory and embedded route identity, fetches only missing assets in bounded batches, direct-uploads Pages assets, and verifies every configured endpoint. The deployment-specific URL and `pages.dev` alias retain byte-for-byte verification for HTML, daily JSON and search JSON. The custom domain is explicitly declared in `TRANSFORMED_HTML_VERIFY_URLS` because Cloudflare Email Address Obfuscation can rewrite HTML containing an email address; it must still return the exact release identity, exact non-HTML critical artifacts and successful HTML responses. An undeclared transformed origin or fewer than `VERIFY_MIN_EXACT_ENDPOINTS` exact-byte origins fails closed.
8. `MAX_PRODUCTION_INCONSISTENCY_MS` is the hard window from production upload start through multi-origin convergence (240 seconds in production). Pending origins are probed concurrently until the deadline instead of failing after a fixed retry count. The Broker records the measured `convergence_elapsed_ms`; exceeding the bound fails the promotion and restores the last-known-good artifact before any pointer CAS.
9. Only after multi-endpoint convergence does the Broker purge every configured Content API current-pointer URL. Purge failure stops the operation before pointer CAS and must not be reported as deployed.
10. After the purge succeeds, the Broker CASes the current pointer generation and records `production_verified_at`; only then may public release-pinned RPCs serve that release.

The Broker's pointer transaction is the sole authoritative `edge_verified` event. The GitHub
workflow must not append a second, weaker completion callback after Broker commit; otherwise the
Admin verifier diff could mistake callback metadata for the exact multi-origin identity evidence.

Do not retry a failed production upload manually. Re-run the same dispatch or invoke Control `POST /v1/reconcile`; both use the existing fencing state.

Publishing a verified editorial Preview also runs only on the Control hostname:
`POST /v1/drafts/:draft_id/publish`. It requires a Publisher/Owner binding, the Control Access
audience and fresh TOTP. Routine Admin can edit/rebase and request Preview but has neither the route
nor database permission to publish.

For a failed or dead-lettered pre-promotion outbox row, use Control
`POST /v1/operations/retry` with `RETRY <outbox_id>`. This preserves the existing outbox and
dispatch identity and grants one additional bounded attempt. To prove reproducibility without
changing content, use `POST /v1/operations/rebuild` with `REBUILD <site_release_id>`; one
idempotency key creates one new dispatch for the same immutable release. Both actions require
Access plus fresh TOTP, an incident reason and an Owner binding, and both are audited. Neither path
replaces the fenced `/v1/reconcile` flow once production upload has begun.

## Automated recovery

The Broker runs every five minutes. For an interrupted `deploying`, `verifying`, `rolling_back` or `reconciling` slot it:

- extends the same fenced operation;
- reads the real latest Pages production deployment;
- purges the configured current-pointer URLs and commits the pointer if the target identity is fully converged;
- otherwise deploys and verifies the current pointer's last-known-good R2 artifact;
- marks recovery evidence or `rolling_back_failed`.

`rolling_back_failed` is P0. Freeze publication and do not issue a new release until Pages state and database state agree.

## Owner rollback

1. Open the isolated Control hostname and complete Access plus TOTP step-up.
2. Select a release whose artifact is marked `production_verified_at`.
3. Enter a reason and type `ROLLBACK <site_release_id>`.
4. Control authorizes but does not change the pointer. The Broker deploys the old exact artifact, verifies all endpoints, and purges the configured current-pointer URLs before pointer CAS.
5. The rollback commit increments pointer generation. A late callback from the replaced release is rejected.

Never mutate or delete the bad report, manifest or artifact. Correct content through a new revision/release.

## Immediate freeze

For drift, credential compromise or unexplained publication:

1. Disable `publication`, `admin_publish` and affected mirror/preview settings through Control.
2. Revoke the component-specific secret or Hyperdrive credential; do not rotate unrelated roles first.
3. Preserve Worker security logs, outbox row, slot, audit record, Pages deployment ID and R2 object hashes.
4. Reconcile or rollback through the Broker.
5. Start a new two-day observation window after the defect is fixed and verified.

## Two-day observation gate

The five-minute production observability workflow appends every healthy and unhealthy result through
the Deployer-only `record_content_observability_v1` RPC. These rows are immutable runtime evidence;
an alert that later recovers remains visible to the gate.

1. Choose the next untouched Asia/Shanghai report date `D`. Do not use a rolling 48-hour interval.
2. Let both `D` and `D+1` complete naturally. The final `lateNight` slot belongs to report date
   `D+1` but runs at 03:00 Asia/Shanghai on `D+2`, so the machine gate cannot close until 03:10.
3. Run the `Content Two-Day Observation Gate` workflow with `start_date=D`.
4. The gate requires the exact eight `scheduled:<unix-ms>` trigger identities, a final successful
   attempt and one semantic release per slot, verified report/site/artifact identities, authoritative
   Broker multi-edge evidence within the 60-second limit, deployed outboxes without leases and a
   matching healthy external observation before the next slot. Any unhealthy check, manual
   retry/rebuild, production failure or rollback fails the whole window.
5. The passing JSON is content-addressed and written to `observation-windows/<D>/<sha256>.json` in
   the 365-day locked audit bucket, then re-downloaded and byte-verified. The short-lived GitHub
   artifact is only an archive receipt.
6. Attach the separate incident register and three independent P0/P1 reviews. The machine result
   explicitly states that these human/external proofs remain required and cannot grant production GO
   by itself.

On any failure, fix and verify the defect, then start a fresh window at the next Asia/Shanghai 00:00.
