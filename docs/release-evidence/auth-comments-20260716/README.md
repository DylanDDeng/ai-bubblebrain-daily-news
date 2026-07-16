# Auth and comments rollout evidence — 2026-07-16

## Baseline

- Source base: `main@32fd9c484394a62ce6e8d6fd3d87c960ed55d711`
- Supabase project: `znurdobjryrhshzkalup`
- Private public-schema dump: 8,598 bytes
- Dump SHA-256: `df2e7b27833c807e31d18bd16d768022fa21a495bddb8b436e45055f651456d4`
- Raw backup committed: no
- Profiles: 2
- Comments: 13 (2 page, 8 Gallery, 3 Video)
- Favorites: 14
- Entity state: 14
- Annotations: 0

## Verified Gates

- Supabase migrations and second-run idempotency: passed
- pgTAP: 72 tests passed
- Root Worker and community tests: 350 tests passed
- Astro unit tests: 60 tests passed
- Astro typecheck and lint: passed
- Complete Astro artifact: 613 routes verified
- Community and Admin Worker dry-run bundles: passed
- Production migration `20260716000100`: applied
- Production database lint: no schema errors
- Anonymous `page_comments`: 200 with exactly 2 legacy page rows
- Anonymous `comments` base table: 401
- Gallery rows through `page_comments`: 200 with 0 rows
- Community API health: 200 with `writesEnabled=false`
- Community API write while disabled: 503
- Unapproved Community API origin: 403
- Browser mobile: account entry visible without opening navigation
- Browser discussion: one root plus one reply, total count 2
- Browser composer: hidden while anonymous and while no real Turnstile site key exists

## Remaining production Gates

- Real Turnstile widget and secret
- Authenticated create/reply/delete Canary using the real widget
- Cloudflare Access application with MFA for `admin.bubblenews.today`
- Admin deployment and mutation smoke test
- Independent final security/data/UX review after those external controls are active
