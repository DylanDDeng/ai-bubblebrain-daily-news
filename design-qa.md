# Quiet Index design QA

## Evidence

- Source visual truth: `/Users/chengshengdeng/.codex/generated_images/019f62a1-585d-79d1-9dc5-3c48a6521f26/exec-22b23764-6833-4b1b-b1a3-c10cafcc8355.png`
- Browser-rendered desktop implementation: `/Users/chengshengdeng/Documents/CloudFlare-AI-Insight-Daily/output/design-reference/quiet-index-implementation-desktop-qa-final.png`
- Browser-rendered mobile implementation: `/Users/chengshengdeng/Documents/CloudFlare-AI-Insight-Daily/output/design-reference/quiet-index-implementation-mobile-final.png`
- Browser-rendered AI infographic tool: `/Users/chengshengdeng/Documents/CloudFlare-AI-Insight-Daily/output/design-reference/quiet-index-ai-infographic-desktop.png`
- Full-view side-by-side comparison: `/Users/chengshengdeng/Documents/CloudFlare-AI-Insight-Daily/output/design-reference/quiet-index-comparison-desktop-final.png`
- Focused hero/index comparison: `/Users/chengshengdeng/Documents/CloudFlare-AI-Insight-Daily/output/design-reference/quiet-index-comparison-hero-final.png`
- Desktop comparison viewport: 1280 × 1024, with the source and implementation normalized to a 1280 × 911 content crop.
- Mobile viewport: 390 × 844.
- State: light theme, homepage at the top of the document, latest structured daily report dated 2026-07-16.

## Findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: the final homepage uses the intended editorial serif/sans/mono hierarchy. Browser checks confirmed Noto Serif SC at heading weights 600/700, Noto Sans SC 400, and IBM Plex Mono 400. The Chinese title remains on one line at desktop widths and wraps without clipping on mobile.
- Spacing and layout rhythm: the left rail, hero, archive-paper art, compact daily strip, and lower two-column index follow the source composition. The final 1280px layout has no horizontal overflow; the 390px layout collapses to one column without clipped controls.
- Colors and visual tokens: warm paper `#f4f1e9`, ink `#20201e`, cobalt `#254f99`, and oxblood `#b34135` are consistently applied across the homepage, knowledge pages, daily timeline, and tools. Light/dark switching was tested in the browser.
- Image quality and asset fidelity: the archive-paper image is a real raster asset, loads at 2072 × 759 intrinsic resolution, remains sharp at the rendered size, and matches the source's bone-paper, blue-stamp, and red-registration-mark art direction.
- Copy and content: homepage labels describe the real archive, use current counts, and link to actual sections. The intentionally removed AI Creative sections remain excluded. The retained AI Infographics route now has a complete, understandable tool UI instead of an empty article.
- Icons: visible controls use one Phosphor icon family; no emoji or handmade SVG substitutes are used for interface icons.
- Accessibility and behavior: skip link, semantic navigation, labeled search fields, button pressed states, focus styles, and mobile tap targets are present. The daily live-result status now announces only the filtered count.

## Comparison history

### Iteration 1 — blocked

- [P1] Homepage hero title was much larger than the source, wrapped into two lines at desktop width, and pushed the index below the fold.
- [P2] The archive-card caption extended 16px beyond the desktop viewport.
- [P1] `/ai-tools/ai-infographics/` rendered as an empty article even though it remains part of the knowledge site's AI Tools section.
- [P2] The daily result live region included the no-JavaScript fallback sentence after filtering.

### Fixes applied

- Reduced the hero type scale, removed the extra kicker, narrowed the archive art column, and tightened the hero/index vertical rhythm.
- Converted the archive caption to bounded vertical writing and removed the overflow.
- Added an Astro-native AI infographic tool with local API-key storage, input validation, Moonshot generation, sandboxed preview, zoom, copy, download, reset, and responsive states.
- Moved the `<noscript>` fallback outside the daily `aria-live` result status.

### Iteration 2 — passed

- Post-fix full-view and focused comparisons show the intended quiet editorial composition and hierarchy.
- Desktop: `scrollWidth === innerWidth` at 1280 and 1440 checks.
- Mobile: `scrollWidth === innerWidth === 390` on the homepage, daily timeline, and AI infographic tool.
- Daily search/filter test: selecting “项目” produced 13 records; searching “openinterpreter” produced one visible record and announced `1条资讯`.
- Theme toggle and mobile menu both changed their visible/ARIA state correctly.
- Browser console: no application warnings or errors on the tested routes.
- Full verification passed: 46 tests, 300 generated pages, 605 route-contract records, 27 XML endpoints, 0 Hugo compatibility files, and 99 sandboxed demos.

## Primary interactions tested

- Desktop and mobile navigation
- Mobile menu open/close
- Light/dark theme switch
- Daily content-type filter and search
- Highlights and model-evaluation search controls present
- Article and archive links
- AI image compressor input present
- AI infographic validation and API-key visibility toggle

## Follow-up polish

- [P3] The homepage deliberately uses current archive records and counts instead of reproducing the mock's fictional activity ledger verbatim.
- [P3] English copy is longer than Chinese and wraps earlier at mid-size desktop widths; this is expected localization behavior.

final result: passed
