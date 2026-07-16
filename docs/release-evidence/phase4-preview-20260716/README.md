# Phase 4 real Astro Preview evidence

Evidence updated: 2026-07-16 03:52 UTC

Repository: `DylanDDeng/ai-bubblebrain-daily-news`

## Current decision

The accessibility-fix Preview now passes the complete technical Gate, including zero axe violations
and zero incomplete rules. Phase 4 remains **NO-GO** only because the release record does not yet
contain explicit user approval for this exact immutable Preview and source SHA.

## Current immutable Preview

- Source SHA: `f9448fd699b84fce58272ac4de3f53143d06ce28`
- Deployment ID: `546c94c2-6131-4d8e-bf18-ab519b9261f4`
- Origin: `https://546c94c2.ai-bubblebrain-daily-news.pages.dev`
- Route-manifest records: 594
- Artifact SHA-256: `b54077b81f9928837cabdaca1f84d96ee1408b61cecc15196af47f7b103b2482`
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
| axe-core 4.12.1 | WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags; 0 violations, 0 incomplete rules, 27 passes |
| Lighthouse desktop | performance 1.00, accessibility 1.00, best practices 1.00, SEO 0.66 |
| Lighthouse mobile | performance 0.98, accessibility 1.00, best practices 1.00, SEO 0.66 |

The SEO score reflects the intentionally non-indexable `pages.dev` Preview host and is not treated
as production SEO evidence. Canonical and robots behavior is checked by the route verifier.

The initial axe run against predecessor Preview `4d1d2d76` at `bba32d5` found one serious
`color-contrast` violation on the batch-count label (4.28:1 versus the required 4.5:1). Commit
`81d017a` changed that label from `--dt-ink-faint` to `--dt-ink-soft`, and its immutable deployment
`2747fe96` returned zero violations. Independent review then inspected that old report's
`incomplete` array and found two serious unresolved rules: `aria-prohibited-attr` on two generic
named containers and `color-contrast` on 1,337 nodes. Therefore the old report is retained only as
defect-discovery evidence and is not treated as a pass.

The fix replaces those containers with named `nav` and `section` landmarks, renders the
decorative rail as an `aria-hidden` element, removes opacity from the entry animation, removes the
Astro body gradient, and increases faint-text contrast in both themes. axe-core 4.12.1 at
`2026-07-16T03:37:46.533Z` then returned 0 violations, 0 incomplete checks, and 27 passes. Its raw
report SHA-256 is `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`.
The immutable Cloudflare Preview independently reproduced that 0/0 result at
`2026-07-16T03:46:16.131Z`.

## 404 and route verification

The custom missing route returned HTTP 404 and rendered the localized Astro 404 page with canonical
`https://bubblenews.today/404`. The local release manifest and deployed manifest match the exact
source and artifact hashes above.

The first full verifier run against this Preview reached the end with one transient edge timeout at
`/search/index.json`. A bounded direct re-probe returned HTTP 200 in 1.328 seconds. The second full
run then passed cleanly: 594 routes, redirects, headers, metadata, custom 404, and 4,491 parsed
external links. External network probing was not requested in that run because the separate bounded
audit below covers it.

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

- deployed axe JSON: `d86b52ca5bb58b147b5f8543a0167688b76a0a6b3c7cfd1d902ad536f4dd88a2`
- local accessibility-fix axe JSON: `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`
- desktop Lighthouse JSON: `6210a7a7954d9b6d68e6e6ce618d8a1ba255c43825632f7612fdd37a7b942b57`
- mobile Lighthouse JSON: `d747424dd5e9f71dff0558612333d7158267076d1cb3e497d21dca9cccb92689`
- desktop screenshot: `dff172e3a6938ce8724d023c87082c9f61ff15924e57ba36d5d9707f2d421e97`
- mobile screenshot: `affa620047c47e2767f290f3b73c3e09f9a37545d86a56de40b061a162fb9199`
- no-JavaScript screenshot: `1a08fd8d76981fc062c244901b5d2b521e889ab07469f09ac00ff271d560c1c0`

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

The user must explicitly approve
`https://546c94c2.ai-bubblebrain-daily-news.pages.dev` at
`f9448fd699b84fce58272ac4de3f53143d06ce28`. Any later UI-affecting commit invalidates that target
and requires a new Preview Gate and approval.
