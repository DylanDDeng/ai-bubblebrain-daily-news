# Content database v4.1 local implementation evidence

Evidence refreshed: 2026-07-18 02:20 UTC

Branch: `codex/content-database-v4-1`
Base source SHA: `da3cb67b7c285d6e917935783474e287d0503200`

## Decision

The code, local database, historical import, editorial publication path, Workers, workflows and
release-pinned Astro build are locally **GO**. ADR-002 subsequently selected the existing `test1`
Supabase project with strict logical isolation. All 11 content migrations are deployed there and all
seven production switches remain false, so production publication remains **NO-GO** while the
unchecked hard gates in `docs/content-database/PHASE_GATES.md` still apply.

## Database and import evidence

- `npx supabase db reset --local`: clean migration from baseline through all eleven content migrations.
- `npx supabase test db`: 3 files / 211 pgTAP checks passed; 105 are content-database security checks.
- `bash scripts/test-supabase-local.sh`: clean reset, first test pass, second migration application,
  and second test pass all succeeded.
- `plpgsql_check_function_tb` over all 53 PL/pgSQL functions in `private`: zero errors and warnings.
- Historical importer: 2 reports, 322 items and 884,244 exact bytes; a second import returned the
  same snapshot IDs with `idempotent=true`.
- `2026-07-16`: 815,804 bytes,
  `e2e89e7d44b155a598ea871a8c87f5ee86dc795e71224f32050a0c4778ecf331`.
- `2026-07-17`: 68,440 bytes,
  `63d2681bc45889ad5c62a120e20a5f40c62b5c2ac755983269514f19d0598560`.
- Editorial integration passed initial release, promotion/current pointer, draft, Preview, publish
  claim, materialization, finalization and active override. Missing and duplicate report dates were
  rejected; staging and finalization were idempotent; the base release retained zero active-override
  links while the editorial release had exactly one.
- The live-ingestion publication slot now binds `(report_date, batch, content_sha256)` to one
  reservation/release. Retries before finalize reuse the reservation; retries after a committed
  response is lost return the same release with exactly one outbox row; different payloads CAS-fail.
- Publication attempts are append-only: a retry after failure appends the next `attempt_number`,
  while a late failure cannot downgrade a successful terminal attempt.
- Public manifest/report/item/search RPCs deny unpromoted releases. Preview and Production builds
  retain exact-byte access only through authenticated Deployer endpoints using a dedicated build
  secret; public reads begin only after production artifact verification.
- Report-scoped hide removes one report placement without creating a global override. Global
  suppression remains Owner-only; both paths preserve the base release and produce an audited,
  immutable successor release.
- The Deployer emits structured alerts for every DLQ row and actionable outbox backlog older than
  ten minutes. Closed-day audit export and encrypted logical-backup workflows query live R2 lock
  rules and reject a non-covering/short/disabled rule before upload. A separately gated scheduled
  monitor fails if PITR is disabled or the newest encrypted backup exceeds the one-hour RPO. Its
  dedicated HMAC callback appends the current status through the Deployer-only RPC; Dashboard marks
  the result stale when no successful check arrives within 45 minutes.
- A separate five-minute production observability workflow reads a deployer-only database snapshot,
  validates canonical batch terminal status at +10 minutes, compares two `/v1/current` endpoints and
  two static custom-domain manifests with the current pointer, checks search freshness and outbox/DLQ,
  and evaluates Cloudflare five-minute 5xx/cache signals. Configuration requires the dedicated
  `content_deployer` role, two distinct origins per endpoint set and a read-only analytics token.
  The evaluator tests cover healthy, drift/failure, malformed counters, zero-traffic, privileged-role
  rejection and exact acknowledgement of the owner-approved shared topology. The live alert-channel
  fired/recovered drill remains open.
- Every evaluated five-minute result is first appended as immutable healthy/unhealthy evidence through
  a Deployer-only RPC. The two-day observation evaluator then requires the eight exact canonical
  scheduled triggers, terminal attempts, semantic releases, complete report/site/artifact and Broker
  edge identity, a reconciled outbox, healthy external checks, no manual retry/rebuild and no rollback.
  A passing result is content-addressed, re-downloaded and archived only under a covering 365-day R2
  lock. The real two-natural-day window, independent incident register and reviewer evidence remain open.
- Online audit is quarterly range-partitioned with forced RLS. Scheduled retention prunes only
  successful publication attempts and deployed outbox rows older than 180 days; failure, DLQ and
  recovery evidence is preserved for at least one year.
- Routine Admin now serves an Access-protected Content Desk at `/` with Dashboard, Reports,
  Content, Drafts, Releases, Operations and Audit navigation. Control serves a separately protected
  Control Desk with Releases, Operations, Audit and Danger Zone. Both use nonce-bound CSP without
  external assets or browser database credentials. Manual outbox retry and same-release rebuild
  exist only in Control, require Owner/TOTP/reason/typed confirmation, are idempotent and write
  same-transaction audit records.
- Access JWT validation now covers RS256/JWKS, issuer, audience, expiry, not-before, issued-at future
  skew and `exp > iat`. Routine and Control use distinct Access audiences, and every Admin read now
  consumes a request-bound `admin.read` assertion plus a server-side role binding. Both Admin hosts
  expose an authenticated `/v1/session` bootstrap that issues
  a ten-minute `__Host-` HttpOnly/Secure/SameSite=Strict CSRF cookie; every mutation still requires
  exact Origin plus the matching request header.
- Identity attestation uses detached Ed25519 signatures verified by `pgsodium`; Postgres stores only
  public keys. Action/audience policy prevents Routine from requesting or executing a publish, while
  Control publish requires a Publisher/Owner binding and fresh TOTP. The rotation command stages a
  second public key, optionally retires the prior version, rejects key-ID replacement/reuse and
  writes an Owner-attributed audit record.
- Static Wrangler and workflow environment preflights reject placeholders, all-zero Hyperdrive IDs,
  malformed immutable IDs, non-HTTPS endpoints, weak/missing secrets and any unacknowledged shared
  topology. Isolated projects remain the default; `test1` requires the exact ADR-002 topology and
  blast-radius acknowledgement. The static preflight still fails until real runtime values exist.

## Runtime and workflow evidence

- All eight Wrangler dry-runs passed: main Worker, Content API, Attestation, Deployer, Production
  Broker, Routine Admin, Control Plane and Editorial Materializer. Bundle results are in
  `worker-dry-runs.json`.
- All eight content GitHub Actions workflows parsed as YAML and passed formatting checks. The protected
  runtime preflight checks the exact code SHA and requires live indefinite locks for report snapshot,
  site manifest, asset and artifact-inventory prefixes without deploying anything.
- Root test suite under Node 22.17.0: 36 files / 468 tests passed.
- Astro full verification under Node 22.17.0: 11 files / 65 tests, 623 Git-owned route records,
  27 XML endpoints, CSP verification and Hugo accepted-set verification passed.
- The release-pinned mock build adds the English pages for the two DB-owned cutover dates and has
  625 records. This explains the intentional 623/625 mode difference.
- Two consecutive pinned builds produced the same 511 files / 94,018,029 bytes, complete dist hash,
  embedded artifact fingerprint and byte-identical content-addressed inventory. The inventory is
  171,554 bytes and addresses the same 94,018,029-byte asset set. The inventory SHA
  `f95f9a734a4a8a4d69e3a04cd7e3f6aa9e63aaec3d45c3ee6bbebfcc54d1230b` and site artifact
  fingerprint `055d97c64da2d55aba16a98e81d925c91728b2340d6d93a9afed88cb45ad55c1`
  are intentionally distinct immutable identities.
- CI artifact upload now validates every local asset, uses eight bounded conditional-write workers,
  GET-verifies every R2 asset and inventory, and fails closed on an existing non-exact object. Local
  tests cover first upload, idempotent reuse, collision, local drift, Pages check-missing, R2 hash
  verification and direct-upload API composition.
- Failed database mirrors are retried from the exact open PR candidate or exact merged/squash
  commit without fetching providers or rebuilding content. Main Worker dry-run remained green with
  all database mirror and publication switches false.
- Production Broker tests now cover rollback, explicit cache purge and the 60-second maximum
  production inconsistency window. The window begins before upload, every convergence probe is
  bounded and exceeding the limit fails promotion and requires last-known-good restoration.
  Promotion, rollback and crash reconcile must purge configured `/v1/current` URLs after multi-edge
  verification and before pointer CAS; invalid configuration or purge failure is fail-closed.
- Broker pointer evidence is the sole authoritative edge-verification record and binds inventory
  SHA, artifact fingerprint, manifest, content, code and build environment. The weaker post-Broker
  workflow callback was removed so it cannot overwrite verifier evidence; Admin verifier diff
  requires the complete identity and compares inventory and fingerprint independently.
- The release workflow independently refuses artifact upload unless both `assets/sha256/` and
  `artifacts/sha256/` are covered by live indefinite R2 lock rules.

## Failure and capacity evidence

- `failure-matrix.json` passed 50 identical ingestions, 50 distinct same-day versions, deterministic
  mirror reservation/finalize recovery with one outbox row after commit-response loss, wrong dispatch
  tuple rejection, 50 claimers, lease reclaim and auto-DLQ, public/build release isolation, production
  callback-loss recovery, terminal shadow Preview, A/B/C/rollback/D ordering, editorial kill switches
  before claim/stage/finalize, report-scoped hide, suppression retry, reconciliation TOTP/audit,
  assertion forgery/expiry/replay/auth context and Routine-to-Control denial.
- The same matrix proves append-only publication attempts and Admin Operations: manual retry keeps
  the outbox/dispatch identity, Routine retry is denied, one idempotency key creates one rebuild
  dispatch, and each accepted operation has exactly one audit row. It also proves an Access-authenticated
  but unbound principal cannot read Admin data and runtime roles cannot bypass the attested read gateway.
- `one-year-capacity.json` passed 365 reports / 73,000 placements, indexed Chinese substring search,
  20 concurrent DB connections and the seven-day/8 MiB search bounds. Public latency was measured
  only after fenced production verification. The measured build produced 1,393 files /
  1,083,970,303 bytes in 59.9 seconds with 3.46 GB peak RSS; the largest Broker asset
  was 18,334,262 bytes.
- A full clean reset plus a literal second execution of every migration ended with 211/211 pgTAP
  tests both times.

## Live Cloudflare inventory confirmed

- `bubble-content-report-snapshots`, `bubble-content-site-manifests` and
  `bubble-content-artifacts`: enabled indefinite object locks.
- `bubble-content-audit`: enabled 365-day object lock.
- `bubble-content-backups`: enabled 30-day object lock.
- Preview Pages project: `bubble-content-preview` at
  `https://bubble-content-preview.pages.dev/`.
- Production Pages project remains `ai-bubblebrain-daily-news`; this evidence did not alter its
  Git publisher or production deployment.

## Remaining production hard gates

1. PITR enablement, one live recovery-monitor run, a combined-impact review and a content-only
   logical restore into a temporary project with archived RPO/RTO evidence.
2. Real Hyperdrive IDs/passwords, Cloudflare Access applications/audiences, Worker secrets and
   least-privilege service tokens.
3. Deployed Access/TOTP canary, observability fired/recovered alert drill, R2 writer negative tests,
   fault-injection drills and independent security/platform/admin GO reviews.
4. Phase 5 cutover drills followed by the next complete two-day, eight-slot Asia/Shanghai
   observation window. Cloudflare Git production publishing stays active until that cutover gate.

The machine-readable counterpart is `evidence-manifest.json`. This is local implementation evidence,
not authorization to enable a production switch.

The section-by-section mapping from the v4.1 proposal to code, tests and remaining production gates
is in `docs/content-database/COMPLIANCE_MATRIX.md`.
