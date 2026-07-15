# Phase 1D staging and recovery drill

Date: 2026-07-15 UTC

Source branch: `codex/astro-phase-1a`

Source SHA: `0455fe85f032edf6fe39ee1ffc8ed4f30d4bf67e`

Staging publication branch: `codex/worker-staging`

The drill used the isolated `ai-daily-staging` Worker, staging KV namespace, and staging publication
branch. It did not change the production Worker, production Pages configuration, Supabase schema,
or `main`. External writes were disabled again after every write window.

## 2026-07-15 mixed-version exploration

The first report date was useful exploratory evidence, but it is not the Phase 1D four-batch Gate.
The complete first-parent chain is disclosed here because the morning and first afternoon batches
were produced before the final Phase 1D source was deployed:

| Step | Commit | Producer or purpose |
| --- | --- | --- |
| morning | `e3a34149796c0dbdc325bfe586ca799aaff67aa1` | `phase1c-staging` |
| first afternoon | `07ae77a5db0ed92ad79658121780b3eba35b2d10` | `phase1c-staging`, 2 items |
| code update | `26c775142068a6c01a53287be610f4c4a3790b94` | precompile schema validation |
| afternoon rerun | `a679a3355790272e7e18717626fdb9dcf36b4c8a` | Phase 1D deployment |
| night | `31f6c36d25edc20579afc7cb67e0968b6f2039f9` | Phase 1D deployment |
| lateNight | `acbe69748f98d1bbf81a3061a39474e2f6f031b4` | Phase 1D deployment |

Deployment `bea9ce3f-ea29-40c8-a11c-c892e275ff6f` covered only the Phase 1D afternoon rerun, night,
and lateNight steps. The final mixed-version report contained 202 items with batch counts
140 / 37 / 25 / 0. Deployment `635584c1-075e-454f-b847-4867c8ee9702` then closed external writes.

## Structured to legacy boundary

Deployment `91e86035-a6bc-44ac-a9cd-5cd9730a4398` ran a legacy morning publication for report date
`2026-07-16`:

- Commit: `a80dc6fdde3b7bc8b9be774256d896e3299ffbaa`
- Items: 162
- Artifacts: `daily/2026-07-16.md` and `content/daily/2026-07-16.md`
- Both Markdown blobs are byte-identical at 100,129 bytes.
- No `data/daily/2026-07-16.json` was created, so the boundary did not fabricate structured history.

## Phase 1D four-batch and recovery Gate

Deployment `f447f0dc-2b13-4811-8a34-261aa728f343` set
`DAILY_STRUCTURED_RESUME_DATE=2026-07-17` and ran the structured morning publication. Deployment
`4c0cdf12-f892-484d-8169-5a13cd2c2e85`, derived from the same Phase 1D source and bound to a rotated
staging-only admin token, completed the other three batches.

| Batch | Commit | Items added | Status |
| --- | --- | ---: | --- |
| morning | `16e8e0893a810db4c7c1478cff0234eb5f16bc7d` | 162 | completed |
| afternoon | `6b8cd8e1bc67d30bdffe6c1061b963060abbd8f2` | 5 | completed |
| night | `76314492f325e9056a92ffb5ddb631fda0501389` | 0 | completed |
| lateNight | `8888f11f5a9aaeac9a1c5543c73bb3648589d96d` | 0 | completed |

The three newly captured responses are in [`responses/`](responses/). Each returned HTTP 200,
`mode=structured`, `history_epoch_start_date=2026-07-17`, `pending=false`, and
`publication_status=published`. The same authenticated POST shape was used for each batch:

```text
POST /incrementalDaily
Authorization: Bearer <redacted-staging-token>
Content-Type: application/json
{"date":"2026-07-17","batch":"<batch>"}
```

The final report contains 167 items. All four batches are `completed`; its producer is
`phase1d-staging` with commit SHA `0455fe85f032edf6fe39ee1ffc8ed4f30d4bf67e`. The canonical
artifacts at `8888f11f5a9aaeac9a1c5543c73bb3648589d96d` are:

- `data/daily/2026-07-17.json`: 457,117 bytes
- `daily/2026-07-17.md`: 257,395 bytes
- `content/daily/2026-07-17.md`: 257,395 bytes
- The two Markdown blobs are byte-identical.
- SHA-256 values are recorded in [`artifact-manifest.sha256`](artifact-manifest.sha256).
- JSON and both Markdown files matched the canonical structured renderer outputs.
- No synthetic `data/daily/2026-07-16.json` was created.

## Renderer validation with staging data

The source branch and `codex/worker-staging` at `8888f11f5a9aaeac9a1c5543c73bb3648589d96d`
were merged with `--no-commit --no-ff` in an isolated detached worktree. Using Node.js 22.17.0:

- `npm run verify:renderers`: passed; Hugo and Astro matched across 210 daily routes.
- `npm run verify --prefix astro`: passed.
- Structured data validation accepted `2026-07-15` and `2026-07-17`.
- Astro diagnostics: 0 errors, 0 warnings, 0 hints.
- ESLint: passed.
- Astro tests: 8/8 passed.
- Astro build: 214 pages.

The merge was aborted and the temporary verification worktree was removed. None of the staging
drill commits or their `2026-07-15` through `2026-07-17` artifacts were merged into the source
branch.

## Safe final state

Version `0e62a58e-8cb1-418e-9f08-cb5a70ed2956` was deployed at 100% after the final batch. Its
bindings are:

- `EXTERNAL_WRITES_ENABLED=false`
- `DAILY_PUBLISH_MODE=legacy`
- `DAILY_STRUCTURED_WRITES_ENABLED=false`
- `DAILY_PRODUCER_VERSION=phase1d-staging`
- `GITHUB_BRANCH=codex/worker-staging`

A final authenticated write request returned HTTP 409 with `External writes are disabled`, proving
that the staging write window was closed. The temporary token was removed from the local shell.

Production structured publication remains a separate Gate and is not authorized by this drill.
