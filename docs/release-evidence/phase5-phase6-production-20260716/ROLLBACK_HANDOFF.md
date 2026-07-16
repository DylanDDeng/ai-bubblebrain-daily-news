# Phase 6 rollback-owner handoff

Observation date: 2026-07-16 Asia/Shanghai

Status: **PENDING**

Cleanup authorized: **NO**

Release note: the release owner explicitly waived the four-batch observation only as a pre-release
blocker in [`production-observation-waiver.json`](production-observation-waiver.json). This handoff
remains `PENDING`; the waiver neither accepts this handoff nor authorizes cleanup.

This record defines the exact responsibility being handed to the rollback owner. It is not an
acceptance record until every prerequisite is complete and the acceptance fields at the end are
filled from an explicit owner response. An implementation author or automated reviewer must not
infer acceptance.

## Retained rollback targets

| Component | Intended production state | Retained rollback target | Rollback action |
| --- | --- | --- | --- |
| Pages | Latest verified Astro deployment for final `main` | Hugo deployment `b3c338c3-3342-40bf-965d-7e2e5b5545fa` at `8ed05acde833ee01e7fbec85fd4e7e8ebc762d28` | Promote the immutable Hugo deployment, then verify the custom domain has converged before declaring recovery |
| Worker | Structured version `fbe0c15a-acb3-4298-9c5d-aabfe2f8966a` | Hardened legacy version `3538c9be-f09e-4482-b626-9d359ea1b30b` | Restore the retained version with `DAILY_PUBLISH_MODE=legacy` and `DAILY_STRUCTURED_WRITES_ENABLED=false`; preserve pull-request publication |
| Supabase | Additive migrations `20260715000100` and `20260715000200` | Existing legacy tables, columns, and RLS-compatible clients | Do not destructively reverse migrations; disable new consumers if required and use an additive forward-fix |
| Git publication | Protected `main` and structured three-file publication PRs | Last verified merge on protected `main` | Leave failed candidates unmerged, preserve evidence, and follow the structured recovery runbook; never force-update the publication lock |

The authoritative component identifiers remain in [`cutover-manifest.json`](cutover-manifest.json).
Worker recovery and history-epoch rules remain in
[`../../runbooks/STRUCTURED_RECOVERY.md`](../../runbooks/STRUCTURED_RECOVERY.md).

## Rollback decision triggers

The owner must stop promotion and choose the affected component rollback when any of these occurs:

- a required publication, renderer, database-security, or Pages check fails;
- the canonical JSON and either Markdown artifact are not exact deterministic regenerations;
- a report item is missing from, duplicated across, or assigned to the wrong batch;
- production has unexpected 5xx responses, missing routes, search/anchor drift, or a deployment
  manifest whose source SHA does not match the promoted `main`;
- Supabase RLS leaks state, forged ownership succeeds, legacy gallery/video clients regress, or row
  counts are not restored after smoke-test cleanup;
- an item-count anomaly cannot be explained and verified before promotion;
- a publication lock is uncertain, changes owner during inspection, or cannot be recovered using the
  documented compare-and-swap path.

Rollback is component-specific. A Pages regression does not authorize changing Supabase, and a
Worker publication failure does not authorize deleting already merged structured reports.

## Required verification after rollback

- Pages: verify root, the observation daily route, RSS, sitemap, renderer marker, and propagation on
  the custom domain rather than relying only on control-plane state.
- Worker: verify the retained version is at 100%, safe non-secret flags match the legacy target, and
  one protected publication path succeeds before scheduled writes resume.
- Supabase: re-run anonymous denial, two-user RLS isolation, legacy favorite compatibility, and exact
  before/after row counts. Temporary users and rows must be removed.
- Git publication: record candidate/head/merge SHAs and CI outcomes; do not weaken branch protection
  or bypass the promotion workflow.

## Preconditions for owner acceptance

- [ ] All four 2026-07-17 batches completed through protected publication PRs.
- [ ] Final canonical JSON and both Markdown artifacts passed the complete report-day verifier.
- [ ] Final immutable Pages deployment and custom domain passed the complete route and production
      smoke checks.
- [ ] Final Worker, Pages, Git, and Supabase identifiers and results are archived.
- [x] Historical PAT revocation has [objective non-secret HTTP 401 evidence](../phase1d-production-20260715/pat-revocation-proof.json).
- [x] The exact immutable Astro Preview has [explicit user approval](../phase4-preview-20260716/preview-approval.json).
- [ ] Independent final review is `GO` with no open P0/P1 finding.

Hugo, compatibility reads, legacy database fields, the legacy Worker version, and the Hugo Pages
deployment remain retained after acceptance. Their removal requires a later, separately reviewed
cleanup release.

## Acceptance record

- Rollback owner: **PENDING EXPLICIT CONFIRMATION**
- Accepted at: **PENDING**
- Accepted evidence revision / Git SHA: **PENDING**
- Explicit acceptance reference: **PENDING**
- Cleanup authorization: **NO — separate approval required**
