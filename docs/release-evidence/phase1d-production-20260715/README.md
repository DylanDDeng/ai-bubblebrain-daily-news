# Phase 1D production readiness evidence

Date: 2026-07-15 UTC

Production remained in legacy publication mode throughout this Gate. Structured writes were never
enabled, and no Supabase schema change was made.

## Protected source and promotion path

The hardened Worker source landed through
[PR #1](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/1):

- Source branch: `codex/astro-phase-1a`
- Source commit: `b6e4035c3d569e3bcfb1a2ffd47d0ecc5b138cce`
- Merge commit: `ef090addb2e5a03b29ff7f5d9bd4caef6c0c6601`
- Required checks: `worker-security`, `renderer-parity`
- Cloudflare Pages preview: passed

The production `main` branch protection observed before and after the canary was:

- Strict up-to-date checks: enabled
- Required checks: `worker-security`, `renderer-parity`
- Enforce administrators: enabled
- Force pushes: disabled
- Branch deletion: disabled

The Worker publishes to `automation/daily/*` temporary refs and opens a pull request. The promotion
job verifies the publication policy and Git ancestry before merging; it does not patch protected
`main` directly.

## Production Worker baseline

The first hardened production deployment was version
`58f149e0-99c4-4a64-8bc7-ce339eb03bee`. After rotating the admin token, version
`9fde3a5e-7b50-4cdb-bf40-1d05ad370113` became active. The first production canary correctly failed
closed when its GitHub credential could create a ref but could not create a pull request.

The GitHub credential was replaced without printing it. The resulting version
`890d207f-4503-4e8e-8588-100dcba17b84` was deployed at 100%, retained the hardened bindings, and
completed the production canary below:

- `DAILY_PRODUCER_COMMIT_SHA=ef090addb2e5a03b29ff7f5d9bd4caef6c0c6601`
- `DAILY_PRODUCER_VERSION=phase1d-production`
- `DAILY_PUBLISH_MODE=legacy`
- `DAILY_STRUCTURED_WRITES_ENABLED=false`
- `EXTERNAL_WRITES_ENABLED=true`
- `GITHUB_BRANCH=main`
- `GITHUB_PUBLISH_STRATEGY=pull_request`

An independent post-canary audit found one unused Secret binding whose name itself matched a GitHub
PAT shape. A non-logging API probe confirmed that the credential was active, so the finding was
treated as a real exposure. The binding was removed from the Worker immediately. Version
`48db3075-f23f-4324-af83-779d4235b80d` was then deployed at 100% with the same seven safe variables,
six expected Secret bindings, and no PAT-shaped binding. A public runtime smoke request returned the
expected HTTP 302.

Version `48db3075-f23f-4324-af83-779d4235b80d` is the current contained Worker baseline. Version
`890d207f-4503-4e8e-8588-100dcba17b84` remains the canary-proven predecessor. Version
`9fde3a5e-7b50-4cdb-bf40-1d05ad370113` is retained only as incident history because its publication
credential cannot complete the protected pull-request path. The leaked PAT must be revoked in
GitHub before Phase 1D can receive a final `GO`; deleting the Worker binding cannot erase its name
from immutable historical version metadata.

## Production legacy canary

The authenticated canary used a redacted bearer token:

```text
POST /incrementalDaily
Content-Type: application/json
{"date":"2026-07-15","batch":"afternoon"}
```

The Worker returned HTTP 200 with `mode=legacy`, 162 fetched and selected items, and a pending
publication candidate:

- Candidate commit: `a03af2ea2a5cb158789ec088590e8480deff895b`
- Candidate branch: `automation/daily/2026-07-15-afternoon-legacy/a03af2ea2a5c`
- Publication: [PR #8](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/8)
- Worker CI run: `29402166723`
- `worker-security`: passed
- `renderer-parity`: passed
- `promote-publication`: passed
- Candidate Cloudflare Pages preview: passed
- Merge commit: `8ed05acde833ee01e7fbec85fd4e7e8ebc762d28`

The merge was performed only after both protected required checks passed. Cloudflare Pages then
completed production deployment `b3c338c3-3342-40bf-965d-7e2e5b5545fa` from
`main@8ed05acde833ee01e7fbec85fd4e7e8ebc762d28`.

## Verification

The final local verification used Node.js 22.17-compatible dependencies:

- `npm test`: 193/193 passed
- `npm run worker:check`: passed
- `npm run worker:check:staging`: passed
- `npm run verify:renderers`: passed across 208 daily routes
- `npm run verify --prefix astro`: passed
- Astro diagnostics: 0 errors, 0 warnings, 0 hints
- Astro tests: 8/8 passed
- Astro build: 212 pages
- `git diff --check`: passed

The staging rollback baseline remains version `0e62a58e-8cb1-418e-9f08-cb5a70ed2956` with external
writes disabled. Production structured publication remains disabled until the later Phase 5 Gate.

## Open security Gate

- P0: revoke the exposed fine-grained GitHub PAT and confirm that the same credential no longer
  authenticates.
- Containment already completed: the anomalous Worker binding was deleted, the expected six Secret
  bindings remain, and production continues in legacy mode with structured writes disabled.
