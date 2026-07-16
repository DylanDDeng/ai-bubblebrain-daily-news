# Phase 2 browser evidence recovery

Evidence date: 2026-07-15 UTC

Implementation SHA: `3d0cc78f1e3dd416d74412d0b20f7665cd836dd4`

## Scope and decision

This directory recovers the non-sensitive browser evidence that remained only under the untracked
`output/playwright/phase2/` directory. It improves Phase 2 traceability, but it does not invent an
immutable Preview URL or command transcript that the historical artifacts did not record.

The Phase 2 implementation remains covered by the later renderer-parity and current Astro Preview
regression checks. The exact historical browser origin is **not recoverable from these files**, so
this record is supporting evidence rather than a standalone release Gate.

## Recovered artifacts

The Playwright accessibility snapshots were created from 2026-07-15 05:30 through 05:44 UTC. They
show the daily page, skip link, date navigation, timeline batch headings, source links, summaries,
and the no-JavaScript fallback content. The two final screenshots are:

| Artifact | Viewport intent | SHA-256 |
| --- | --- | --- |
| `output/playwright/phase2/desktop-1440.png` | desktop, 1440 px | `8951edf477bcf0247665c46d4b960e7bc93fbcc379812807159b628c0fea3cf2` |
| `output/playwright/phase2/mobile-320.png` | mobile, 320 px | `f34eaaa83b6cdd4f7a57ebb81efeb6b996664a44a6a93dd2db9c6899cd45b0bb` |

Representative accessibility snapshots:

- initial Markdown fallback:
  `94d515fe900c4a8594a239ff21c42ea8a22688b9f59c7187fdc3b207b21b4b0e`
- structured timeline:
  `a9af70ac6621ba0211c7ae46635867f1031b8a47faa534bf514c9730fabb612f`
- compact/no-JavaScript state:
  `8d087a5ae8ab89c3262e1cbcaa04f52b0c850112abf850f26a952c114fc2f827`

Raw screenshots and snapshots remain untracked because `output/` is intentionally excluded from
release commits. The hashes above allow the local source artifacts to be checked without adding a
large browser dump to Git.

## Continuing regression evidence

The later exact Preview browser run is archived in
[`../phase4-preview-20260716/README.md`](../phase4-preview-20260716/README.md). It re-verifies the
same responsive, keyboard, no-JavaScript, item-anchor, and horizontal-overflow behavior against a
real Cloudflare Pages Preview. Renderer parity also continues to compare 208 historical daily
routes in CI.

