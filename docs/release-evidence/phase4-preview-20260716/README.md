# Phase 4 real Astro Preview evidence

Evidence updated: 2026-07-16 12:42 UTC

Repository: `DylanDDeng/ai-bubblebrain-daily-news`

## Current decision

The current Preview passes the complete technical Gate, including performance parity, zero axe
violations, and zero incomplete rules. Phase 4 remains **NO-GO** only because the release record
does not yet contain explicit user approval for this exact immutable Preview and source SHA.

## Current immutable Preview

- Source SHA: `58b155f4d277fd4cde8856c9be9a57d26000cfc6`
- Deployment ID: `e4cd8eea-20b0-494e-a681-e23bc96b5277`
- Origin: `https://e4cd8eea.ai-bubblebrain-daily-news.pages.dev`
- Route-manifest records: 605
- Artifact SHA-256: `d29a2e7af2cde49902d48edd70766d9bdcaa142a5ab9cee47111b2e9a06ee307`
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
| Lighthouse desktop | performance 0.98, accessibility 1.00, best practices 1.00, SEO 0.66 |
| Lighthouse mobile | performance 0.99, accessibility 1.00, best practices 1.00, SEO 0.66 |

The SEO score reflects the intentionally non-indexable `pages.dev` Preview host and is not treated
as production SEO evidence. Canonical and robots behavior is checked by the route verifier.

The initial axe run against predecessor Preview `4d1d2d76` at `bba32d5` found one serious
`color-contrast` violation on the batch-count label (4.28:1 versus the required 4.5:1). Commit
`81d017a` changed that label from `--dt-ink-faint` to `--dt-ink-soft`, and its immutable deployment
`2747fe96` returned zero violations. Independent review then inspected that old report's
`incomplete` array and found two serious unresolved rules: `aria-prohibited-attr` on two generic
named containers and `color-contrast` on 1,337 nodes. Therefore the old report is retained only as
defect-discovery evidence and is not treated as a pass.

The accessibility fix replaces those containers with named `nav` and `section` landmarks, renders the
decorative rail as an `aria-hidden` element, removes opacity from the entry animation, removes the
Astro body gradient, and increases faint-text contrast in both themes. axe-core 4.12.1 at
`2026-07-16T03:37:46.533Z` then returned 0 violations, 0 incomplete checks, and 27 passes. Its raw
report SHA-256 is `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`.
The current immutable Preview independently reproduced 0/0 on both the homepage and daily route at
`2026-07-16T11:37:20.058Z` and `2026-07-16T11:37:22.819Z`.

An exact-SHA Lighthouse run on predecessor `11dc1c3` exposed a real performance regression:
desktop 0.57 and mobile 0.69 on the daily route. The bottleneck was the render-blocking Google CJK
font stylesheet and its approximately 1 MiB of downloaded font subsets. Commit `58b155f` removed
those remote font requests in favor of the existing native Chinese system-font stack. The deployed
edge result improved to desktop 0.98 and mobile 0.99 with accessibility and best practices still at
1.00. The predecessor reports remain untracked defect-discovery evidence and are not used as a pass.

## 404 and route verification

The custom missing route returned HTTP 404 and rendered the localized Astro 404 page with canonical
`https://bubblenews.today/404`. The local release manifest and deployed manifest match the exact
source and artifact hashes above.

The first full verifier run against this Preview reached the end with one transient edge timeout at
`/search/index.json`. A bounded direct re-probe returned HTTP 200 in 3.963 seconds. The second full
run then passed cleanly: 605 routes, redirects, headers, metadata, custom 404, and 4,563 parsed
external links. External network probing was not requested in that run because the separate bounded
audit below covers it.

## External-link audit

The current exact Preview link-policy candidate is:

- Source SHA: `58b155f4d277fd4cde8856c9be9a57d26000cfc6`
- Preview: `https://e4cd8eea.ai-bubblebrain-daily-news.pages.dev`
- Started: `2026-07-16T12:37:04.716Z`
- Finished: `2026-07-16T12:40:25.222Z`
- Result: `PASS_WITH_WARNINGS`
- 4,563 discovered links; 1,720 evaluated directly with 100% direct coverage of the unwaived set;
  1,254 successes; 0 unwaived confirmed dead; 0 policy failures; no Gate violations
- One known deleted GitHub URL is covered by its exact-URL waiver; 2,842 transient network outcomes
  are covered by owned, exact-origin, cardinality-capped waivers, for 2,843 total waivers expiring
  2026-08-15
- Local raw-report SHA-256:
  `a419b64bb815ffb17d4108ca3604fd3cead98f07ac42af24ea222f441186e94c`

The first exact-Preview attempt was `INCONCLUSIVE` because four existing origin-waiver caps no
longer matched the expanded route manifest. Review found no unwaived hard failure and confirmed the
additional URLs were the same bounded historical source classes. The caps were updated only to the
exact `58b155f` cardinalities: `http://x.com` 107, `https://x.com` 1,567,
`https://huggingface.co` 11, and `https://www.youtube.com` 10. Outcomes, owners, and expiry dates
remain unchanged. The audit then passed within all coverage and failure-ratio budgets. Older failed
or predecessor audits are retained only as defect-discovery or historical evidence and are not used
as the current passing Gate.

## Local artifact hashes

Raw reports and screenshots stay under untracked `output/`. The safe machine-readable summary is
[`evidence-manifest.json`](evidence-manifest.json). A second tracked
[`browser-evidence-extract.json`](browser-evidence-extract.json) preserves the non-sensitive tool
versions, timestamps, direct Gate fields, manual/incomplete axe checks, and raw-report hashes. The
raw browser files remain on the release-owner workstation until rollback handoff and separate
cleanup approval; production database dumps are excluded from this retention record. Important
hashes are:

- deployed axe JSON: `e667696adb82d39d02001914798e5ee784debc5e0443bbee75cde46abb99ee15`
- local accessibility-fix axe JSON: `f945af7cad405c6ea9cf2391ba45530d9ceedd7954b32e34df9e7f4438ff320c`
- desktop Lighthouse JSON: `6ecac542f77cf132bf0d0b4b8f0929a84b6c19c3f29f8cc6ba8c6356c8c39128`
- mobile Lighthouse JSON: `7b6e14a1ab04157614920d3898d1f9b6fda4528512f2043f787d3faf215bcf29`
- desktop screenshot: `b196307db1bcc1ffbcd336a7f9362e351dc14ad11601bf59456fcfb8140b613d`
- mobile screenshot: `0dd3487b74de037b05a66d9b3730641fb894f4a06c341fcfd90511b3e35634bb`
- no-JavaScript screenshot: `f41d22b6c0dbfa9d49c6f046a20373239d6d967b0780d36fdaae5ef0cee565b3`

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
`https://e4cd8eea.ai-bubblebrain-daily-news.pages.dev` at
`58b155f4d277fd4cde8856c9be9a57d26000cfc6`. Any later UI-affecting commit invalidates that target
and requires a new Preview Gate and approval.
