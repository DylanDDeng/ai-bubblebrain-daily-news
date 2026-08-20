# Design QA

## Previous Ricoui baseline

### Reference

- Source theme: Ricoui Astro Starter (`design-reference/ricoui-source-desktop.png`, `design-reference/ricoui-source-mobile.png`)
- Desktop comparison: `design-reference/qa-desktop-comparison-final.png`
- Mobile comparison: `design-reference/qa-mobile-comparison.png`
- Final implementation: `design-reference/bubble-theme-desktop-light-final.png`, `design-reference/bubble-theme-mobile-light-final.png`

### Visual review

- Warm white canvas, Ricoui blue and yellow palette, Instrument Serif display type, and Inter body type match the reference direction.
- Floating navigation, restrained rounded cards, dashed separators, browser-frame knowledge map, and responsive spacing remain coherent across desktop and mobile.
- Intentional deviations: Bubble's Brain knowledge content and search replace the starter copy and CTA; the decorative background grid is omitted; existing Phosphor icons are retained.

### Interaction review

- Mobile navigation drawer opens and closes correctly at 390 x 844.
- Light and dark themes both render and toggle correctly.
- Search navigation was exercised without an observed regression.
- Browser console errors: none.

Previous result: passed.

## Editorial knowledge UI refresh

## Comparison target

- Source visual truth: `design-reference/1kpapers-source-desktop.png`
- Final homepage implementation: `design-reference/bubble-editorial-home-desktop.png`
- Full-view comparison: `design-reference/qa-editorial-home-comparison.png`
- Focused article view: `design-reference/bubble-editorial-article-desktop.png`
- Focused command-search view: `design-reference/bubble-command-search-desktop.png`
- Browser/CSS viewport: 1280 x 720 at device scale factor 1
- Source and implementation screenshots: 1265 x 712 pixels; no density scaling was applied
- State: light theme, homepage after the WebGL letter's ready state; search populated with `DeepSeek`; article outline open

## Findings

- No actionable P0, P1, or P2 issues remain in the captured desktop experience.
- Fonts and typography: the implementation intentionally retains the site's system sans stack for Chinese instead of copying the source's editorial serif. Heading scale is now restrained: the homepage display caps at 5.2rem and article titles at 4.2rem.
- Spacing and layout rhythm: the hero now occupies 68svh with a 600px maximum, so the next knowledge section enters the first viewport. The four knowledge collections use a compact four-column editorial grid at desktop sizes.
- Colors and visual tokens: the source's neutral paper, black ink, thin rules, and small warm accent are translated through the existing site tokens. The existing brand accent and navigation shell are preserved.
- Image quality and asset fidelity: the site's existing real-time WebGL B remains sharp and correctly scaled; no placeholder or recreated source imagery was introduced.
- Copy and content: the visible `KNOWLEDEGE` typo was corrected to `KNOWLEDGE`. Article facts use concise Chinese labels and display live frontmatter values.
- Interaction and accessibility: navigation click and Cmd/Ctrl+K open the command search; title, section, and tag matching returns ranked results; Arrow keys, Enter, Esc, backdrop click, and the close button work. The no-JavaScript `/search/` link remains available. Browser console contained no warnings or errors.
- Responsive implementation: tablet and mobile breakpoints reduce the collection grid, switch the article facts to two columns, reduce display type, and turn the command dialog into a near-full-width surface. The in-app browser enforced a 1280px minimum despite a 390px viewport request, so mobile was code-reviewed and built but not captured as a separate visual artifact.

Focused-region evidence was necessary because the reference does not contain the site's article page or command-search state. The article screenshot verifies title hierarchy, metadata band, tags, and outline alignment; the search screenshot verifies result density, selected state, keyboard hints, and removal of the browser-native blue clear control.

## Comparison history

1. Initial audit found the existing hero was effectively full-screen (`100svh`) with display text up to 8.8rem. It was reduced to `clamp(440px, 68svh, 600px)` and 5.2rem, and the 3D B was reduced to 43vw/600px. Final evidence shows the next section within the first viewport.
2. The first search capture showed a browser-native blue clear control and Esc did not reliably close the dialog. The control is now suppressed and Esc is handled explicitly. The final search state has seven ranked results and no console errors.
3. The first final comparison exposed the `KNOWLEDEGE` brand typo. It was corrected and recaptured; the final homepage heading is `BUBBLE'S KNOWLEDGE`.

## Follow-up polish

- P3: capture a real 390px mobile screenshot when the in-app browser's minimum viewport limitation is removed.

## Implementation checklist

- [x] Shorten and rebalance the homepage hero.
- [x] Use a four-column compact knowledge grid on desktop.
- [x] Add a global command-search panel with keyboard navigation.
- [x] Add article date, collection, reading time, source, and tags.
- [x] Preserve the existing 3D B, site typography rules, content routes, and article outline.
- [x] Pass type checks, lint, tests, production build, CSP checks, and site-route verification.

final result: passed
