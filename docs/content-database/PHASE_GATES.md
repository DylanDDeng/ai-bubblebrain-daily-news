# Content database v4.1 gate register

This register separates implemented code from production evidence. A checkmark means evidence exists; it does not mean a later production gate is waived.

## Phase 0

- [x] frozen JSON, serializer, stable identity and route contracts
- [x] cutover ownership boundary implemented and overlap/gap fail-closed
- [x] capacity baseline recorded
- [x] release owner, security, retention, RPO/RTO and platform deviations recorded in ADR-001
- [x] current route/XML/root test baseline green locally
- [x] owner-approved shared Supabase topology recorded in ADR-002; 12 content migrations deployed to `test1`
- [x] shared topology requires an exact blast-radius acknowledgement and keeps all seven switches false
- [x] real Access/TOTP canary archived with publication remaining disabled

## Phase 1

- [x] schema, composite constraints, forced RLS and five capability roles
- [x] request-bound 60-second single-use Ed25519 attestation; Postgres stores public keys only
- [x] audited dual-key staging/rotation and immutable key IDs
- [x] Routine Admin / Control separation; Routine cannot publish; dangerous switches default false
- [x] 211 local pgTAP baseline green; updated 112-check content security suite is 112/112 on the shared production schema
- [x] migration clean reset and second-run idempotency
- [x] deployer outbox observability reports any DLQ row and actionable queue backlog older than ten minutes
- [x] quarterly forced-RLS audit partitions and bounded 180-day success retention preserve failure/DLQ evidence
- [x] Access JWT validation checks RS256/JWKS, issuer, audience, expiry, not-before and issued-at chronology; Control adds independent TOTP
- [x] backup/PITR freshness monitor, stale-aware Dashboard callback and fail-closed topology/configuration validators implemented
- [x] five-minute batch +10m, manifest-drift, API 5xx/cache, search-freshness and outbox/DLQ monitor implemented with a deployer-only database RPC
- [x] ADR-003 records the owner's decision not to use PITR; encrypted logical backups and immutable R2 artifacts are the accepted recovery controls
- [x] production R2 writer overwrite/delete negative tests with deployed credentials
- [ ] live batch +10-minute, manifest-drift, API 5xx/cache and search-freshness fired/recovered alert drill archived

## Phase 2

- [x] importer covers 100% of current `data/daily/*.json`
- [x] 2 files / 884,244 bytes imported byte-exact locally
- [x] repeated import returns the same snapshot IDs with zero new versions
- [x] historical raw payload hashes remain null
- [ ] production isolated DB/R2 import evidence

## Phase 3

- [x] Git-first nonblocking mirror path and all switches false
- [x] report/site R2 bindings and ingestor Hyperdrive placeholders defined
- [x] deterministic `(report_date, batch, content_sha256)` reservation/release reconciliation; one outbox row after commit-response loss
- [x] exact open-candidate and merged/squash-commit mirror repair without refetching providers
- [x] local pre-write, R2 verification, DB commit-response loss, open PR and merged PR fault drills
- [ ] one real Asia/Shanghai four-slot dual-write day
- [ ] five dual-write failure injections archived against the shared production stack

## Phase 4

- [x] release-pinned Content API and Chinese substring search
- [x] public release RPCs fail closed until `production_verified_at`; authenticated builds use deployer-only exact-byte RPCs
- [x] deterministic Node 22.17.0 pinned build; two local builds matched
- [x] 625-record mock release route contract, Chinese/English DB-owned routes
- [x] Routine draft, stale rebase, Preview request and publish-request RPCs
- [x] Access-protected Routine and Control consoles with strict nonce CSP and no browser database credentials
- [x] report-scoped hide and global suppression both create new immutable releases with distinct audit scopes
- [x] Routine Content/Operations inventory and verifier diff APIs; Control-only audited retry/rebuild APIs
- [x] exact artifact Preview workflow and callback contract
- [x] one-year local projection: 365 reports / 73,000 placements, indexed Chinese search and bounded build
- [ ] four real release Previews
- [ ] independent security/platform/admin GO reviews

## Phase 5

- [x] fenced Production Deploy Broker implementation and scheduled reconciler
- [x] exact content-addressed R2 path/hash inventory, bounded asset verification and Pages direct upload
- [x] inventory SHA and site artifact fingerprint remain distinct across database, workflow, Broker and verifier evidence
- [x] multi-endpoint identity verification before pointer CAS
- [x] Broker pointer transaction is the sole authoritative edge evidence; Admin requires the complete immutable identity
- [x] 60-second maximum production inconsistency window starts before upload, bounds every probe and fails closed to last-known-good restoration
- [x] explicit Content API cache purge is required before pointer CAS; purge failure is fail-closed
- [x] two-phase Owner rollback implementation
- [x] closed-day audit export and encrypted logical-backup workflows query live R2 lock rules and reject insufficient coverage
- [x] release/Preview workflows reject malformed immutable IDs, placeholder configuration and missing/weak deployment credentials before build
- [x] protected no-deploy runtime preflight requires exact code SHA plus indefinite report/manifest/artifact lock coverage
- [x] Broker deployed with the sole production Pages token
- [ ] Cloudflare Git production publisher disabled
- [ ] deploy-after-upload crash drill; PITR evidence is waived by ADR-003
- [ ] production cache purge permission and failure drill with the deployed Broker token

## Phase 6

- [x] five-minute observability results append immutable healthy/unhealthy evidence through a Deployer-only RPC
- [x] two-day machine gate validates eight exact scheduled triggers, release/edge/outbox identity and absence of manual repair/rollback
- [x] passing machine evidence is content-addressed, re-downloaded and archived under a covering 365-day R2 lock
- [ ] next full `[Asia/Shanghai 00:00 D, 00:00 D+2)` observation window
- [ ] all 8 canonical scheduled slots reconciled without manual repair
- [ ] zero unresolved P0/P1 and zero observation-window rollback
- [ ] read-only, draft, Preview, limited publish and emergency controls opened progressively
- [ ] final three independent reviewers all GO with P0=0 and P1=0

ADR-003 authorizes production activation with the remaining observation and review items tracked as
follow-up evidence. Publication still requires a unique Pages publisher, a passing runtime preflight
and successful smoke verification.
