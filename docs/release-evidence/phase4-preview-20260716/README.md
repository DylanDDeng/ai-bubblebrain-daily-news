# Phase 4 real Astro Preview evidence

Evidence updated: 2026-07-16 03:41 UTC

Repository: `DylanDDeng/ai-bubblebrain-daily-news`

## Current decision

The previous immutable Preview remains useful defect-discovery evidence, but it is not a passing
accessibility Gate: its axe report contained two serious `incomplete` rules. A local candidate now
returns zero violations and zero incomplete checks. Phase 4 remains **NO-GO** until that candidate is
deployed, the full Preview Gate is rerun against its exact immutable deployment, and the release
record contains explicit user approval for that same Preview and source SHA.

## Previous immutable Preview under revalidation

- Source SHA: `81d017ae4e4fb644e18c61d0f1db41654c2e9a0f`
- Deployment ID: `2747fe96-fdde-44ce-8c39-b92261df8415`
- Origin: `https://2747fe96.ai-bubblebrain-daily-news.pages.dev`
- Route-manifest records: 594
- Artifact SHA-256: `47599a2dcef1475296b38d745146052e391c18f2cbe18dcb3f7673f80fc4113c`
- PR #18 checks: site build, Worker security, renderer parity, database security, and Cloudflare
  Pages all passed; publication promotion was correctly skipped for the evidence PR.

The browser target was
`/daily/2026/07/2026-07-16/` and contained 157 stable `news-<id>` anchors.

## Browser and accessibility checks

The browser commands used the repository Playwright CLI wrapper with isolated sessions. Mobile
and no-JavaScript runs supplied explicit context configuration through `open --config`.

| Check | Result |
| --- | --- |
| Desktop | 1280x720, 157 anchors, zero horizontal overflow |
| Mobile | 390x844, 157 anchors, zero horizontal overflow |
| Keyboard | first `Tab` focused `跳到正文`; `Enter` moved focus to `#main-content` |
| No JavaScript | 390x844, 157 anchors and full content remained; page displayed `筛选需要 JavaScript；当前已展示全部内容。`; zero horizontal overflow |
| axe-core 4.12.1 | WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags; 0 violations, 27 passes, but 2 serious incomplete rules; Gate failed |
| Lighthouse desktop | performance 0.99, accessibility 1.00, best practices 1.00, SEO 0.66 |
| Lighthouse mobile | performance 0.97, accessibility 1.00, best practices 1.00, SEO 0.66 |

The SEO score reflects the intentionally non-indexable `pages.dev` Preview host and is not treated
as production SEO evidence. Canonical and robots behavior is checked by the route verifier.

The initial axe run against predecessor Preview `4d1d2d76` at `bba32d5` found one serious
`color-contrast` violation on the batch-count label (4.28:1 versus the required 4.5:1). Commit
`81d017a` changed that label from `--dt-ink-faint` to `--dt-ink-soft`, and the deployed immutable
Preview above returned zero violations. Independent review then inspected the report's
`incomplete` array and found two serious unresolved rules: `aria-prohibited-attr` on two generic
named containers and `color-contrast` on 1,337 nodes. Therefore the old report is retained only as
defect-discovery evidence and is not treated as a pass.

The local candidate replaces those containers with named `nav` and `section` landmarks, renders the
decorative rail as an `aria-hidden` element, removes opacity from the entry animation, removes the
Astro body gradient, and increases faint-text contrast in both themes. axe-core 4.12.1 at
`2026-07-16T03:37:46.533Z` then returned 0 violations, 0 incomplete checks, and 27 passes. Its raw
report SHA-256 is `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`.
This local result must still be reproduced on the next immutable Cloudflare Preview.

## 404 and route verification

The custom missing route returned HTTP 404 and rendered the localized Astro 404 page with canonical
`https://bubblenews.today/404`. The local release manifest and deployed manifest match the exact
source and artifact hashes above.

The first three full verifier attempts each reached the end with exactly one different transient
edge timeout (`/daily/2026/06/2026-06-18/`, `/topics/agents/`, then `/topics/research/`); direct
bounded re-probes of the first two returned HTTP 200. The fourth complete run passed cleanly:
594 routes, redirects, headers, metadata, custom 404, and 4,491 parsed external links. External
network probing was not requested in that run because the separate bounded audit below covers it.

## External-link audit

The final Phase 4 link-policy candidate remains:

- Source SHA: `d3e909420ffe2804a882e9345f4e519ce923960a`
- Preview: `https://2fafb80f.ai-bubblebrain-daily-news.pages.dev`
- Started: `2026-07-15T15:00:57.332Z`
- Finished: `2026-07-15T15:07:11.103Z`
- Result: `PASS_WITH_WARNINGS`
- 4,386 discovered links; 1,393 evaluated directly; 1,321 successes; 0 confirmed dead; 0 policy
  failures; no Gate violations
- 2,993 X-origin links covered by bounded, owned waivers expiring 2026-08-15
- Local raw-report SHA-256:
  `cbdc12ceae62044253eb4685d7d60ee23cb2dae1098779b71c35e06944c88d6a`

The preceding `1b35163` audit failed and is retained only as defect-discovery evidence. It is not
used as a passing Gate.

## Local artifact hashes

Raw reports and screenshots stay under untracked `output/`. The safe machine-readable summary is
[`evidence-manifest.json`](evidence-manifest.json). A second tracked
[`browser-evidence-extract.json`](browser-evidence-extract.json) preserves the non-sensitive tool
versions, timestamps, direct Gate fields, manual/incomplete axe checks, and raw-report hashes. The
raw browser files remain on the release-owner workstation until rollback handoff and separate
cleanup approval; production database dumps are excluded from this retention record. Important
hashes are:

- deployed axe JSON: `5ddb453abe7e3869fda45966a461a6049fe84530bf20bdf9b7bf4192591741a3`
- local accessibility-fix axe JSON: `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`
- desktop Lighthouse JSON: `b04bd722bb72cee23cec692dce4bc3dc1c9ad6e4d4828ed630ab141d058872aa`
- mobile Lighthouse JSON: `d877413133bc2325bee814dc87d27ce0eb3c0f8d4ded014f3846f4c628dbe2f7`
- desktop screenshot: `cdd6b74dc3c6116b7804e0fa2a585a8b04abac9d5a4a01803c2711489c599537`
- mobile screenshot: `54f5a3913e828274ac30eb073a602fa110105b52bde5263889a58dd42c0ef8bd`
- no-JavaScript screenshot: `7cfec940ffa8275550198b65b8b958ad42b228425f855bfebdd1dad947ce0237`

## Publisher exclusivity

The GitHub Pages repository setting still reports `build_type=workflow`, source `main:/`, and the
historical `bubblenews.today` CNAME. It is not an active publisher:

- the repository contains no `actions/deploy-pages`, `actions/upload-pages-artifact`,
  `actions/configure-pages`, or `pages-build-deployment` workflow;
- the GitHub Actions API lists no Pages deployment workflow;
- authoritative DNS uses the Cloudflare nameservers `dilbert.ns.cloudflare.com` and
  `vera.ns.cloudflare.com` with proxied Cloudflare addresses;
- the production response is served by Cloudflare and the deployed Astro release manifest is owned
  by the Cloudflare Pages project.

Cloudflare Pages is therefore the only declared and active production publisher. The inert GitHub
Pages repository setting is recorded rather than mutated while the release is `NO-GO`; disabling it
may be performed as a separately reviewed cleanup action after rollback-owner handoff.

## Remaining approval condition

The UI-affecting accessibility fix invalidates approval of the previous Preview target. The user
must explicitly approve the next exact immutable Preview URL and source SHA after its deployed axe,
Lighthouse, route, keyboard, mobile, no-JavaScript, and overflow checks pass.
