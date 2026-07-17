# Phase 5 cutover and Phase 6 observation evidence

Observation date: 2026-07-16 Asia/Shanghai; complete follow-up date: 2026-07-17 Asia/Shanghai

Evidence updated: 2026-07-17 19:24 UTC

Production repository: `DylanDDeng/ai-bubblebrain-daily-news`

Release owner: Chengsheng Deng

Component owners during the observation window: Git publication, Cloudflare Pages, Worker, and
Supabase — Chengsheng Deng. Rollback-owner acceptance remains explicitly pending in
[`ROLLBACK_HANDOFF.md`](ROLLBACK_HANDOFF.md).

## Current decision

- Phase 5 production state remains operational and its auditable Gate is **GO**.
- Phase 6 complete-day production observation for `2026-07-17` is now **OBSERVED AND PASSED**.
- Release authorization: **GO WITH EXPLICIT OBSERVATION WAIVER**. The release owner explicitly
  accepted shipping before the four `2026-07-17` production batches are observed and moved that
  observation to post-release follow-up; that follow-up observation is now complete.
- Open P0 findings: none confirmed.
- Open P1 findings: none confirmed after the final evidence update. The exact current Astro Preview
  is explicitly approved, and the historical PAT has objective HTTP 401 revocation evidence.
- Remaining blockers to close the Goal: independent final review must stay GO, and the rollback
  owner must explicitly accept the scoped handoff. Cleanup remains unauthorized.
- Truthfulness constraint: the original `2026-07-16` afternoon window remains missed/pending. It is
  not rewritten as successful and is not counted as the complete-day proof.

The release-owner decision and its exact scope are archived in
[`production-observation-waiver.json`](production-observation-waiver.json). It waives the
complete-day observation only as a pre-release blocking condition. It does not claim that any
unobserved batch passed, authorize cleanup, remove rollback targets, or waive immediate production
smoke checks.

## 2026-07-16 Cron remediation and rapid Staging evidence

The original `afternoon` production window did not publish. The report on protected `main` remains
at 157 `morning` items with `afternoon`, `night`, and `lateNight` pending. Production KV has no
afternoon success marker, failure marker, or residual lease, and GitHub has no afternoon candidate
branch or publication PR. Because the pre-remediation Worker did not persist this failure, absence
of a marker is not treated as success.

Three fail-closed defects were diagnosed through isolated Staging Cron probes and fixed on protected
`main`:

- PR #21 / `1e567561934e664cad0fa99c49371f83470bb958`: strict provider failures, bounded retry,
  cancellable deadlines, and safe scheduled failure markers.
- PR #22 / `d472a19d3a4cc937cdfb40b4380c18be09da48a2`: 90-second provider deadline for translated
  sources.
- PR #23 / `803a734a32d5b0492d6a19b18ba291ac5d687b2e`: stable canonical URL identity for GitHub
  Trending instead of rank indexes.

All required checks passed on each PR. The final every-minute Staging probe ran at
`2026-07-16T10:30:03Z` from producer `803a734a32d5b0492d6a19b18ba291ac5d687b2e` and published
`4dc72c22f9484d6ae32e7ec28d4fd5b75567bb8d` to the isolated
`codex/worker-staging-phase6` branch. Its confirmed KV marker records `success=true`,
`mode=structured`, `batch=morning`, `publication_status=published`, and 107 fresh items from 184
accepted inputs. The resulting report has 264 unique items.

The exact Staging commit passed:

- schema, semantic, identity, and filename validation;
- byte-for-byte regeneration of both 403,076-byte Markdown artifacts, each with SHA-256
  `733a51267069146acf28b7fbf47168f5b373224f68d974e2a8378b5b5a837c55`;
- 328 Worker tests and 46 Astro tests;
- a 300-page build and 605-record route contract;
- 264/264 search-item-to-HTML-anchor parity;
- HTTP 200 for the daily JSON/page, search, topics, and entities on immutable Pages Preview
  `344a3def-2138-44f0-ae42-9167711b6893`;
- live JSON parity with SHA-256
  `8515c29c1ae4fb4e45be548a4c753620cca93c81fc80eb9ae3a72937583986f0`.

Independent review found no P0, P1, or P2 issue in this Staging evidence. The temporary every-minute
Cron was removed, all three Staging write controls were returned to fail-closed values, and the
residual lease was deleted. Final Staging safe version:
`02e57c58-15dc-455d-8c41-8f44a39e42ef`.

The remediated production Worker was deployed from `main@803a734` at 100% as code version
`e534753a-04d7-4365-952c-7bd02874b450`, preserving structured mode, protected pull-request
publication, and the four declared Cron triggers. A manual afternoon recovery was not allowed past
the authenticated route: three attempts returned HTTP 401 before acquiring a lease or creating a
Git candidate. No auth bypass or direct Git write was attempted. This failed recovery does not
close the production observation Gate.

## 2026-07-17 production observation preflight

At `2026-07-16T13:02:59Z`, a read-only preflight confirmed that the next complete observation day
starts from a clean, intended state:

- `origin/main` remains `803a734a32d5b0492d6a19b18ba291ac5d687b2e`, with no open Worker,
  structured-publication, or daily candidate PR.
- Worker deployment `8818fa66-7166-416d-98d6-b29aec1030ea` sends 100% traffic to active version
  `7f5a6a92-60f0-45dc-b1fa-c9d20f36aa1f`. That secret-only successor retains code version
  `e534753a-04d7-4365-952c-7bd02874b450` and producer `803a734`.
- Safe variables remain structured, writes enabled, `main` plus pull-request publication; six
  expected Secret bindings are present and no PAT-shaped binding exists.
- The Cloudflare schedules API reports exactly `0 2,7,15,19 * * *`, last modified
  `2026-07-16T10:50:11.356286Z`.
- Production KV contains no `2026-07-17` structured lease or trigger marker before the first batch.
- `https://bubblenews.today` returns HTTP 200 and its 605-record release manifest reports source
  `803a734` with artifact SHA-256
  `109c525eb1c01061ad4cb34f9a4422a2b531f5ef49a70c6dd5690e76dec6dfe0`.

No deployment, trigger, KV, Git, or Pages state was changed by this preflight.

## Supabase and rollback preflight

At `2026-07-16T13:09:56Z`, Supabase CLI `2.109.1` confirmed that linked project
`znurdobjryrhshzkalup` still has exact local/remote migration agreement for versions
`20260715000100` and `20260715000200`. The first read-only migration-list connection failed
transiently while the concurrent linked lint succeeded; one bounded retry then returned the exact
two-version match. Linked `db lint --level warning` reported no schema errors.

The retained Worker rollback version `3538c9be-f09e-4482-b626-9d359ea1b30b` was also re-read from
Cloudflare. It remains legacy mode with structured writes disabled, protected `main` pull-request
publication, six expected Secret bindings, and no PAT-shaped binding. Neither the database nor the
rollback deployment was mutated. The final authenticated Auth/RLS, legacy-client, and exact
row-count smoke remains mandatory after the complete production observation day.

## Current exact Preview technical closure

PR #18 now has an immutable current Preview at
`https://e4cd8eea.ai-bubblebrain-daily-news.pages.dev`, source
`58b155f4d277fd4cde8856c9be9a57d26000cfc6`, artifact SHA-256
`d29a2e7af2cde49902d48edd70766d9bdcaa142a5ab9cee47111b2e9a06ee307`. All CI checks passed.
The deployed verifier passed 605 routes and 4,563 parsed external links on its second full run after
one transient `/search/index.json` timeout and a successful HTTP 200 direct re-probe. Homepage and
daily-route axe returned 0 violations and 0 incomplete checks. Daily-route Lighthouse returned
performance 0.98 desktop and 0.99 mobile, with accessibility and best practices at 1.00. Responsive,
keyboard, and no-JavaScript checks retained all 157 news anchors with no horizontal overflow. The
exact Preview external-link audit passed with warnings: 4,563 URLs, all 1,720 unwaived URLs directly
probed, 1,254 successes, no unwaived confirmed dead or policy failures, and 2,843 bounded waivers.

This closes both the current Preview's technical checks and its approval Gate. The user explicitly
approved this exact URL and SHA with `我批准`; the machine-readable record is
[`../phase4-preview-20260716/preview-approval.json`](../phase4-preview-20260716/preview-approval.json).
Any later UI-affecting commit invalidates the target.

## Requirement-to-evidence audit

This audit separates work that is already complete from the three checks that are intentionally
deferred until their scheduled Asia/Shanghai batch windows. A later batch failure still changes
Phase 6 back to a hard stop; it does not invalidate the completed implementation and cutover work
unless it exposes a regression in those earlier Gates.

| Migration stage | Required outcome | Objective evidence | Status / remaining gap |
| --- | --- | --- | --- |
| Day 0 / Phase 1A | Parallel static Astro renderer, stable daily routes and schema validation; Hugo remains production | PR #1; `f57398f`, `319350a`; Worker security and renderer-parity checks passed | **GO** |
| Phase 1 | Authenticated/idempotent structured publishing; deterministic JSON plus two Markdown artifacts; atomic Git publication | `7373132`, `6926019`, `dfcc3ab`; protected-publication conflict, replay, duplicate, lost-response and promotion tests in [`../phase1d-protection-drill-20260715/README.md`](../phase1d-protection-drill-20260715/README.md) | **GO** |
| Phase 2 | JSON-driven Hugo/Astro timeline, historical fallback, navigation/filtering, responsive and no-JavaScript behavior, renderer parity | `3d0cc78`; 208-route Hugo/Astro comparison; [recovered browser artifact summary](../phase2-browser-20260715/README.md); current exact Preview regression | **GO**; the historical browser command transcript/URL was not recoverable and is explicitly scoped in the summary |
| Phase 1D | Protected-main promotion, four isolated staging batches, byte consistency and cross-day structured/legacy recovery | PR #1 required checks; [`../phase1d-protection-drill-20260715/README.md`](../phase1d-protection-drill-20260715/README.md); [`../phase1d-staging-20260715/README.md`](../phase1d-staging-20260715/README.md); [historical production checkpoint and PAT HTTP 401 proof](../phase1d-production-20260715/README.md); hardened legacy Worker `3538c9be-f09e-4482-b626-9d359ea1b30b` | **GO** |
| Phase 3 | Stable taxonomy/search contracts and additive authenticated state with legacy-client compatibility and RLS isolation | PR #10; [`../phase3-knowledge-20260715/README.md`](../phase3-knowledge-20260715/README.md); linked migrations through `20260716000400`; production two-user Auth/RLS smoke and exact restored row counts below | **GO**; final production smoke was repeated in the Phase 6 complete-day follow-up |
| Phase 4 | Whole-domain Astro route ownership and real Pages preview, including URL/XML/metadata/404, accessibility, performance, no-JS and external-link checks | `3bde526` through `58b155f`; [tracked Preview evidence, artifact manifest, and explicit approval](../phase4-preview-20260716/README.md); external audit `PASS_WITH_WARNINGS`; deployed axe 0 violations and 0 incomplete; clean 605-route deployed verifier; Lighthouse 0.98/0.99 | **GO** |
| Phase 5 | Independently reversible Supabase, Worker, Pages and publication-mode promotions with explicit rollback targets | Cutover manifest below; PRs #15–#17; Pages `b12e9087-78fb-4cf9-b925-897272e4c88c`; Worker `fbe0c15a-acb3-4298-9c5d-aabfe2f8966a`; successful Pages rollback/restoration drill | **GO** |
| Phase 6 | Complete report day, four successful production batches, final artifact and production smoke, independent review and rollback-owner handoff | Morning canary PR #15, scheduled morning PR #19, Cron remediation PRs #21–#23, isolated Staging commit `4dc72c2`, production PRs #29–#32, final `main@d7a35de`, Pages `99a26c75`, and current production/recovery evidence below | **OBSERVED AND PASSED FOR 2026-07-17**; independent final review and rollback-owner handoff remain required before closing the Goal |

The complete-day observation and final Supabase/RLS repeat are now recorded as post-release
follow-up evidence. Rollback-handoff acceptance remains pending. Cleanup remains unauthorized and
all rollback targets remain retained.

## Cutover manifest

The machine-readable snapshot is
[`cutover-manifest.json`](cutover-manifest.json). It records both the original cutover baseline and
the final `2026-07-17` post-release observation state.

| Component | Production target | Rollback target |
| --- | --- | --- |
| Git | `main@d7a35de97377c5b2ff80c5be825e70226637f63d` | Component-specific targets below |
| Pages | `99a26c75-cadd-4fd4-ab0f-ae80d006a729` | Hugo `b3c338c3-3342-40bf-965d-7e2e5b5545fa` |
| Worker | active version `7f5a6a92-60f0-45dc-b1fa-c9d20f36aa1f`, code `e534753a-04d7-4365-952c-7bd02874b450` | Hardened legacy `3538c9be-f09e-4482-b626-9d359ea1b30b` |
| Supabase | `20260715000100`, `20260715000200`, `20260716000100`, `20260716000200`, `20260716000300`, `20260716000400` | Additive forward-fix; retain legacy tables and fields |

Production Pages:

- Immutable production origin: `https://99a26c75.ai-bubblebrain-daily-news.pages.dev`
- Custom domain: `https://bubblenews.today`
- Build source SHA: `d7a35de97377c5b2ff80c5be825e70226637f63d`
- Route artifact SHA-256: `bb149918ed1d3e67b70de3e025a6052602faac912f82bee2aebe21c33e9b1715`
- Route records: 623
- Cutover baseline deployment: `b12e9087-78fb-4cf9-b925-897272e4c88c` at
  `3765b785bcf411fe7630416bde4fb88204898d74`
- PR #17: `https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/17`
- PR #17 required checks: site build, Worker security, renderer parity, database security, and
  Cloudflare Pages all passed before merge.

The production Worker publishes through protected-main pull requests and currently has these safe
plain-text controls:

```text
EXTERNAL_WRITES_ENABLED=true
DAILY_PUBLISH_MODE=structured
DAILY_STRUCTURED_WRITES_ENABLED=true
DAILY_STRUCTURED_START_DATE=2026-07-16
DAILY_STRUCTURED_RESUME_DATE=2026-07-16
DAILY_PRODUCER_VERSION=phase1d-production
DAILY_PRODUCER_COMMIT_SHA=d3e909420ffe2804a882e9345f4e519ce923960a
GITHUB_BRANCH=main
GITHUB_PUBLISH_STRATEGY=pull_request
```

Secret values were neither printed nor archived in this evidence.

## Pages production verification

The post-morning immutable production deployment and custom domain both passed `scripts/verify-preview.mjs`
against source SHA `116c23c75fd7d49316586da4bb1549be97629594` after scheduled morning PR #19:

- 594 declared routes
- redirects and response headers
- metadata and canonical URLs
- custom 404 behavior
- 4,491 parsed external links; external network validation was not requested for this Gate

The canonical `2026-07-16` report passed additional semantic smoke checks on both origins:

- Source and deployed JSON SHA-256:
  `65194c5c84720b4b1f90c3806289fc2b88eb0e83900257cee4b98675cb4c9e6f`
- 157 report items
- 157 search-index items with exact canonical keys and hrefs
- 157 `news-<id>` HTML anchors
- `/topics/`, `/entities/`, and `/search/`: HTTP 200

After Cron remediation, Cloudflare Pages production advanced to
`ff3a2b5f-5141-4bd5-8ec5-d66ef692cdb6` from
`main@803a734a32d5b0492d6a19b18ba291ac5d687b2e`. This was the pre-complete-day production
checkpoint. The final complete-day production deployment is recorded below as
`99a26c75-cadd-4fd4-ab0f-ae80d006a729` from
`main@d7a35de97377c5b2ff80c5be825e70226637f63d`.

## Pages rollback and restoration drill

The last successful Hugo production deployment was identified from Cloudflare deployment metadata
and verified through its immutable origin before the drill:

- Deployment: `b3c338c3-3342-40bf-965d-7e2e5b5545fa`
- Source: `8ed05acde833ee01e7fbec85fd4e7e8ebc762d28`
- Immutable root, `2026-07-15` daily route, RSS, and sitemap: HTTP 200
- Hugo generator marker: present
- Astro release manifest: HTTP 404

At 2026-07-16 00:47 UTC, Cloudflare's deployment rollback API promoted that immutable Hugo
deployment. The custom domain changed from the Astro shell to the Hugo shell while root and the
existing daily route remained HTTP 200. During edge propagation, the root had already changed to
Hugo while the previous release-manifest response was still observable. This confirms that
Cloudflare's control-plane state alone is not a sufficient restoration Gate.

The then-current Astro deployment `b12e9087-78fb-4cf9-b925-897272e4c88c` was immediately promoted again.
By 2026-07-16 00:48:39 UTC, the custom domain simultaneously reported:

- Astro shell marker present and Hugo marker absent
- release manifest source SHA `3765b785bcf411fe7630416bde4fb88204898d74`
- canonical daily JSON HTTP 200

The complete 594-route deployed-preview verifier then passed again on the custom domain. Production
was left on the intended Astro target.

## Worker rollback and recovery proof

Cloudflare reported the cutover structured Worker version at 100%:

- Version: `fbe0c15a-acb3-4298-9c5d-aabfe2f8966a`
- Message: `Phase 5 structured boundary 2026-07-16 d3e9094`
- Created: 2026-07-15 23:44:02 UTC

The remediated Worker code is now deployed at 100%:

- Version: `e534753a-04d7-4365-952c-7bd02874b450`
- Message: `Phase 6 cron resilience 803a734`
- Producer SHA: `803a734a32d5b0492d6a19b18ba291ac5d687b2e`
- Cron: `0 2,7,15,19 * * *`
- Publication remains structured through protected-main pull requests.

The independent hardened legacy rollback version remains retained:

- Version: `3538c9be-f09e-4482-b626-9d359ea1b30b`
- Message: `Phase 5 hardened production legacy d3e9094`
- `DAILY_PUBLISH_MODE=legacy`
- `DAILY_STRUCTURED_WRITES_ENABLED=false`
- The repository branch and pull-request publication strategy are unchanged.

The cross-day recovery epoch was exercised in isolated staging before production cutover. The
recorded drill used `DAILY_STRUCTURED_RESUME_DATE=2026-07-17`, completed all four batches, produced
byte-consistent JSON and Markdown artifacts, verified Hugo/Astro renderer parity, and finally
disabled external writes. See
[`../phase1d-staging-20260715/README.md`](../phase1d-staging-20260715/README.md) and its immutable
artifact manifest. Production rollback uses the retained legacy version above; resumption follows
[`../../runbooks/STRUCTURED_RECOVERY.md`](../../runbooks/STRUCTURED_RECOVERY.md) at a new untouched
Asia/Shanghai report boundary.

## Supabase migration and RLS evidence

Linked project: `znurdobjryrhshzkalup`

The linked migration list reports exact local/remote agreement for:

- `20260715000100_legacy_baseline.sql`
- `20260715000200_add_private_entity_state.sql`

Linked `db lint --level warning` reported no schema errors.

Exact row counts from local, untracked logical dumps:

| Snapshot | profiles | comments | favorites | entity_state | annotations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pre-migration | 2 | 13 | 14 | n/a | n/a |
| Post-migration | 2 | 13 | 14 | 14 | 0 |
| Phase 6 observation | 2 | 13 | 14 | 14 | 0 |

The Phase 6 data snapshot has SHA-256
`09372453c3c344335ebe4f3d58b07f768a92263031518f6758b66787646cf579`. Dumps remain under the
gitignored `output/` directory because they contain production user data.

A production Auth plus PostgREST smoke test created two temporary confirmed users and verified:

- anonymous access is denied for `entity_state` and `annotations`
- legacy image and `video:<id>` favorites remain writable, readable, and deletable by their owner
- duplicate legacy favorites retain the unique-constraint behavior
- two users may independently favorite the same legacy ID
- legacy, entity-state, and annotation rows do not leak across users
- forged ownership is rejected
- daily-item favorite/read state can be created and updated
- annotations can be created and updated by their owner

Both temporary users were deleted. Cascading cleanup restored every observed table to its exact
baseline count.

## Observation-day publication status

The scheduled observation window runs from `2026-07-16 10:00` through `2026-07-17 03:10`
Asia/Shanghai (`2026-07-16T02:00:00Z` through the late-night verification checkpoint at
`2026-07-16T19:10:00Z`). The Worker batch schedules and verification checkpoints are:

| Batch | Scheduled (Asia/Shanghai) | Scheduled (UTC) | Verification checkpoint (UTC) |
| --- | --- | --- | --- |
| morning | 2026-07-16 10:00 | 2026-07-16 02:00 | 2026-07-16 02:10 |
| afternoon | 2026-07-16 15:00 | 2026-07-16 07:00 | 2026-07-16 07:10 |
| night | 2026-07-16 23:00 | 2026-07-16 15:00 | 2026-07-16 15:10 |
| lateNight | 2026-07-17 03:00 | 2026-07-16 19:00 | 2026-07-16 19:10 |

| Batch | Publication PR | Status | Final batch items | CI and Pages |
| --- | --- | --- | ---: | --- |
| morning | canary [#15](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/15), scheduled [#19](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/19) | completed | 157 | passed |
| afternoon | none | missed Gate; no marker/lease/PR | 0 | not run |
| night | pending | pending | 0 | pending |
| lateNight | pending | pending | 0 | pending |

Morning publication commit `62b3049b0ed566b5fec2b2fd7fafbeed85ba8553` was merged as
`3bdabac567a52b03c4f7a254913d0d86d7de8c7f`. The initial Pages artifact exposed a production
integration defect: Astro's bundled `import.meta.url` could not locate canonical daily data, leaving
search empty and rendering Markdown fallback. PR #16 preserved canonical JSON bytes in the Astro
artifact, and PR #17 fixed build-time data resolution and added fail-closed item/search/anchor Gates.
All post-fix preview and production checks passed before this observation continued.

The scheduled 10:00 Asia/Shanghai morning run then published PR #19 at
`e2dbb1fb2f27381a66890f38b0aa734596e2cb26`, merged as
`116c23c75fd7d49316586da4bb1549be97629594`. This was the expected scheduled continuation of the
manual canary, not a duplicate cron: it preserved all 145 prior items byte-for-byte and added 12
new identities. Schema semantics and identity derivation passed; the canonical JSON and both
Markdown outputs regenerated byte-identically. All publication checks, protected promotion, and
Pages passed. Production deployment `52c8e180-733e-43ec-9973-1e9ceea7ac49`, its immutable origin,
and the custom domain passed the complete 594-route verifier after one transient `/gallery.json`
timeout was retried successfully.

## Post-release complete-day observation

The next complete production candidate, `2026-07-17` Asia/Shanghai, completed all four real
structured batches after the release-owner waiver moved this Gate to post-release follow-up.

| Batch | Publication PR | Head SHA | Merge SHA | Final batch items | Required checks |
| --- | --- | --- | --- | ---: | --- |
| morning | [#29](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/29) | `00389af7a2d12ab97233ec71846b635669997553` | `da3cb67b7c285d6e917935783474e287d0503200` | 27 | passed |
| afternoon | [#30](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/30) | `e0c6d9381fb6b71687eb54a731c322d7b269baf5` | `56c7ba536be30d731be1809fd0e985c2214062ed` | 51 | passed |
| night | [#31](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/31) | `aab860d136716745158dc66759adefb26da37721` | `63246e8dee2f259bf9f018ff8aad93418303eb6e` | 44 | passed |
| lateNight | [#32](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/32) | `63e73f93c1e48959d7c8e92b7e7fb227820ac1c2` | `d7a35de97377c5b2ff80c5be825e70226637f63d` | 11 | passed |

Remote production KV namespace `4cacd7ba71aa4c4c92447012c28345af` contained success markers for
the `2026-07-17` morning, afternoon, night, and lateNight structured runs. No
`structured:attempt-failure:*` markers or `structured:lease:2026-07-17:*` leases were present at the
final checkpoint.

Final `main` is `d7a35de97377c5b2ff80c5be825e70226637f63d`. Cloudflare Pages production
deployment `99a26c75-cadd-4fd4-ab0f-ae80d006a729` serves source `d7a35de` with route artifact
SHA-256 `bb149918ed1d3e67b70de3e025a6052602faac912f82bee2aebe21c33e9b1715` and 623 route records.
The custom domain `https://bubblenews.today` and immutable production origin
`https://99a26c75.ai-bubblebrain-daily-news.pages.dev` both passed `scripts/verify-preview.mjs`
against the local final artifact.

Because the publication merge did not create push-triggered GitHub Actions runs for the merge commit,
`main@d7a35de` was also verified with manual `workflow_dispatch` runs on `main`: Build and Verify
Site run `29607244679` passed, and Worker CI run `29607244674` passed with `worker-security`,
`database-security`, and `renderer-parity` successful. The `promote-publication` job was skipped for
the manual dispatch as expected.

Final local verification used Node `22.17.0`:

- `REPORT_DATE=2026-07-17 npm run verify:report-day`: passed, 4 completed batches, 133 items, and
  byte-exact `data/daily/2026-07-17.json`, `daily/2026-07-17.md`, and
  `content/daily/2026-07-17.md`.
- `npm test`: passed, 22 files and 363 tests.
- `npm run verify:renderers`: passed across 209 daily routes.
- `npm run verify --prefix astro`: passed, including 11 files and 63 tests, Astro check, lint,
  build, CSP, 623 routes, 27 XML endpoints, and 99 sandboxed demos.
- Final daily JSON, search index, and HTML anchors each contained 133 unique item IDs with no
  missing or duplicate IDs.
- `/topics/`, `/entities/`, `/search/`, and `/search/index.json` returned HTTP 200 on the custom
  domain.

Supabase project `znurdobjryrhshzkalup` was rechecked after the complete day. The linked migration
list matched local and remote for `20260715000100`, `20260715000200`, `20260716000100`,
`20260716000200`, `20260716000300`, and `20260716000400`. `supabase db lint --linked` passed with no
schema errors. The final public dump SHA-256 was
`813f106049336a57faeb980c2683eac0d733f1d0efc9298cf8dc31bd38a4bc8a`; row counts remained
`profiles=2`, `comments=13`, `favorites=14`, `entity_state=14`, and `annotations=0`, with comments
distributed as page `2`, Gallery archive `8`, and Video archive `3`. Anonymous base-table REST access to
`comments`, `entity_state`, and `annotations` returned 401; Gallery `get_page_comments` returned
400; the known legacy page thread `page:/daily/2025/12/2025-12-30/` returned 2 rows; Community API
health returned 200 with `writesEnabled=false`. The authenticated owner-delete UI canary remains a
future prerequisite before comments writing is enabled; writes are currently disabled in production.

The `2026-07-16` afternoon window remains permanently missed/pending. It is not counted as a
successful batch.

## Final Phase 6 completion checklist

The following items remain mandatory:

- [x] Diagnose the missed `2026-07-16` afternoon window, validate the fixes with a real isolated
      Cron, deploy the remediated production Worker, and preserve fail-closed evidence.
- [x] Observe all four structured batches for the next complete production date with required checks
      green. The current candidate is `2026-07-17`; the release owner explicitly waived this only as
      a pre-release blocking condition and moved it to post-release follow-up.
- [x] Confirm all four batch IDs and item lists are complete in the final canonical JSON.
- [x] Confirm final JSON and both Markdown artifacts match the structured renderer outputs.
- [x] Re-run production search, topic/entity, anchor, custom-domain, Supabase/RLS, and row-count smoke.
- [x] Record final Pages and Worker deployment/version IDs after the complete day.
- [x] Archive [objective non-secret proof](../phase1d-production-20260715/pat-revocation-proof.json)
      that the historically exposed PAT now returns HTTP 401.
- [x] Complete one clean 605-route run for the latest immutable Astro Preview.
- [x] Record [explicit user approval](../phase4-preview-20260716/preview-approval.json) of that exact Preview/SHA.
- [x] Complete independent post-release review with no open P0/P1 finding.
- [ ] Obtain explicit acceptance of the scoped
      [`ROLLBACK_HANDOFF.md`](ROLLBACK_HANDOFF.md) before cleanup begins.

Hugo, legacy reads, and legacy database fields remain retained. No cleanup is authorized by this
in-progress evidence document.

## Deferred completion procedure

The scheduled batches for the next complete production date are observed rather than manually
duplicated. After each batch:

1. Identify the structured publication PR and record its head SHA, merge SHA, item delta, and batch
   completion timestamp.
2. Require the exact three publication paths for the report date and all protected checks to pass.
3. Confirm promotion to `main`, the resulting immutable Pages deployment, and the deployed release
   manifest SHA before marking that batch complete in this evidence.
4. Stop and invoke the component rollback decision if the item count is abnormal, the three
   artifacts disagree, a required check fails, or production route verification regresses.

After `lateNight`, fetch the final `main` and run the reusable fail-closed byte-consistency check
from the repository root. It verifies the schema, identities, all four batches, one-to-one batch
membership, and exact regeneration of the canonical JSON plus both Markdown compatibility
artifacts:

```bash
REPORT_DATE=2026-07-17 npm run verify:report-day
```

Then rebuild from the final `main`, verify its immutable Pages deployment and custom domain with
`scripts/verify-preview.mjs`, re-run the authenticated Supabase/RLS and exact row-count smoke, and
record the final Worker and Pages IDs. Under the release-owner waiver these are post-release
follow-up rather than blockers for PR #18. Rollback-owner acceptance and cleanup authorization
remain separate explicit decisions.
