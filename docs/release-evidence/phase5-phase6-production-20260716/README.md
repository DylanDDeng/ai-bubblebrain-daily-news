# Phase 5 cutover and Phase 6 observation evidence

Observation date: 2026-07-16 Asia/Shanghai

Evidence updated: 2026-07-16 00:49 UTC

Production repository: `DylanDDeng/ai-bubblebrain-daily-news`

Release owner: Chengsheng Deng

## Current decision

- Phase 5 controlled production cutover: **GO**.
- Phase 6 observation and cleanup handoff: **NO-GO**.
- Open P0/P1 findings: none.
- Remaining blocker: only the `morning` batch has completed for the observation date. The scheduled
  `afternoon`, `night`, and `lateNight` batches must complete and pass their publication, CI, Pages,
  and artifact-consistency Gates before Phase 6 can be approved.

This document must not be interpreted as permission to skip the complete-day observation Gate.

## Cutover manifest

The machine-readable snapshot is
[`cutover-manifest.json`](cutover-manifest.json). It intentionally records Phase 6 as `no-go` while
the observation day is incomplete.

| Component | Production target | Rollback target |
| --- | --- | --- |
| Git | `main@3765b785bcf411fe7630416bde4fb88204898d74` | Component-specific targets below |
| Pages | `b12e9087-78fb-4cf9-b925-897272e4c88c` | Hugo `b3c338c3-3342-40bf-965d-7e2e5b5545fa` |
| Worker | `fbe0c15a-acb3-4298-9c5d-aabfe2f8966a` | Hardened legacy `3538c9be-f09e-4482-b626-9d359ea1b30b` |
| Supabase | `20260715000100`, `20260715000200` | Additive forward-fix; retain legacy tables and fields |

Production Pages:

- Immutable origin: `https://b12e9087.ai-bubblebrain-daily-news.pages.dev`
- Custom domain: `https://bubblenews.today`
- Build source SHA: `3765b785bcf411fe7630416bde4fb88204898d74`
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

The immutable deployment and custom domain both passed `scripts/verify-preview.mjs` against source
SHA `3765b785bcf411fe7630416bde4fb88204898d74`:

- 594 declared routes
- redirects and response headers
- metadata and canonical URLs
- custom 404 behavior
- 4,479 parsed external links; external network validation was not requested for this Gate

The canonical `2026-07-16` report passed additional semantic smoke checks on both origins:

- Source and deployed JSON SHA-256:
  `e0e30a5e7218eaaca3f2e609488519c460e225ee023a86faa313ba56adca9d66`
- 145 report items
- 145 search-index items with exact canonical keys and hrefs
- 145 `news-<id>` HTML anchors
- `/topics/`, `/entities/`, and `/search/`: HTTP 200

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

The current Astro deployment `b12e9087-78fb-4cf9-b925-897272e4c88c` was immediately promoted again.
By 2026-07-16 00:48:39 UTC, the custom domain simultaneously reported:

- Astro shell marker present and Hugo marker absent
- release manifest source SHA `3765b785bcf411fe7630416bde4fb88204898d74`
- canonical daily JSON HTTP 200

The complete 594-route deployed-preview verifier then passed again on the custom domain. Production
was left on the intended Astro target.

## Worker rollback and recovery proof

Cloudflare reports the structured Worker version at 100%:

- Version: `fbe0c15a-acb3-4298-9c5d-aabfe2f8966a`
- Message: `Phase 5 structured boundary 2026-07-16 d3e9094`
- Created: 2026-07-15 23:44:02 UTC

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

| Batch | Publication PR | Status | Items added | CI and Pages |
| --- | --- | --- | ---: | --- |
| morning | [#15](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/15) | completed | 145 | passed |
| afternoon | pending | pending | 0 | pending |
| night | pending | pending | 0 | pending |
| lateNight | pending | pending | 0 | pending |

Morning publication commit `62b3049b0ed566b5fec2b2fd7fafbeed85ba8553` was merged as
`3bdabac567a52b03c4f7a254913d0d86d7de8c7f`. The initial Pages artifact exposed a production
integration defect: Astro's bundled `import.meta.url` could not locate canonical daily data, leaving
search empty and rendering Markdown fallback. PR #16 preserved canonical JSON bytes in the Astro
artifact, and PR #17 fixed build-time data resolution and added fail-closed item/search/anchor Gates.
All post-fix preview and production checks passed before this observation continued.

## Final Phase 6 completion checklist

The following items remain mandatory:

- [ ] Observe and merge the `afternoon` structured publication with all required checks green.
- [ ] Observe and merge the `night` structured publication with all required checks green.
- [ ] Observe and merge the `lateNight` structured publication with all required checks green.
- [ ] Confirm all four batch IDs and item lists are complete in the final canonical JSON.
- [ ] Confirm final JSON and both Markdown artifacts match the structured renderer outputs.
- [ ] Re-run production search, topic/entity, anchor, custom-domain, Supabase/RLS, and row-count smoke.
- [ ] Record final Pages and Worker deployment/version IDs after the complete day.
- [ ] Complete independent final review with no open P0/P1 finding.
- [ ] Obtain rollback-owner handoff acceptance before cleanup begins.

Hugo, legacy reads, and legacy database fields remain retained. No cleanup is authorized by this
in-progress evidence document.
