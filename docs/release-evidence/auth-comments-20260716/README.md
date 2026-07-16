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
- pgTAP: 106 tests passed in both the initial migration run and the idempotency rerun
- Root Worker and community tests: 363 tests passed
- Astro unit tests: 63 tests passed
- Astro typecheck and lint: passed
- Complete Astro artifact: 621 routes verified
- Hugo/Astro renderer parity: 208 daily routes passed
- Enforced CSP and external-script artifact gate: passed
- Production, staging Community, and Admin Worker dry-run bundles: passed
- Production migrations `20260716000100`, `20260716000200`, `20260716000300`, and
  `20260716000400`:
  applied and aligned locally/remotely
- Production database lint: no schema errors
- Supabase Security Advisor: 0 errors; the two narrow public read-RPC warnings are expected, and
  leaked-password protection is irrelevant while Email auth is disabled
- Anonymous `get_page_comments`: 200 with exactly 2 legacy page rows
- Anonymous `comments` base table: 401
- Gallery thread through `get_page_comments`: 400
- Browser profile updates: revoked; Google profile attribution is read-only
- Legacy favorites, entity state, and annotations remain owner-readable, but authenticated
  insert/update/delete privileges are revoked while their Astro features are absent
- Admin moderation RPC: restricted to `page:/` threads; Gallery/Video archives cannot be mutated
- Production Auth callback allowlist: only `https://bubblenews.today/auth/callback/`
- Production Auth providers: Google enabled; Email disabled
- Real Turnstile widget: managed mode, hostname restricted to `bubblenews.today`
- Community Worker secrets: service role and real Turnstile secret present
- Community Worker pre-proof version: `3d1fd390-3d81-494d-9910-3f8ecf585532`
- Community Worker pre-proof deployment: `3d6f2552-8e73-449a-938c-d935a5bd64f6`
- Previous safe rollback version: `fa39969d-53c8-406b-932e-7e575f38f0a4`
- Exact rollback command: `npx wrangler rollback fa39969d-53c8-406b-932e-7e575f38f0a4 --config wrangler.community.toml --name bubble-community-api --yes`
- Community API health: 200 with `writesEnabled=false`
- Community API write while disabled: 503
- Unapproved Community API origin: 403
- Browser mobile: account entry visible without opening navigation
- Browser discussion: one root plus one reply, total count 2
- Browser composer: hidden while anonymous; production build contains the real hostname-bound site key
- Read-only capability Gate: composer remains hidden for authenticated users unless the immutable
  build explicitly sets `PUBLIC_COMMENTS_WRITE_UI_ENABLED=true`

## Main cutover and rollback proof

- Publication PR: `#26`
- Final PR head: `fea446b1b84a9a8543351bba87762e293113b110`
- Main merge: `1e6b3e3cee42e747b691c7655108a6ea4c49363b`
- Main and local release tree: `2e6f616b6c49166329d0557d3cd7ebeba112ca51`
- Main Worker CI run: `29528750327`, success
- Main Astro build run: `29528750370`, success
- Cloudflare Pages production deployment: `5e2e285d-0b47-4b92-93ba-97b77fbb672d`, exact
  source `1e6b3e3`
- Custom-domain article discussion: ready state, 2 rows, UI form hidden, no mutation controls
- Rollback proof deployment: `cd4e10be-b29e-42aa-b3f3-9d951e3015a9`, 100% traffic to
  `fa39969d-53c8-406b-932e-7e575f38f0a4`
- Rollback proof smoke: health 200 with writes off, approved-origin write 503, unapproved Origin 403
- Restored Community Worker version: `1bfcdc56-c6a0-45e3-bef3-f03fdf666998`
- Restored Community Worker deployment: `20b0fa3d-a8ea-46d4-9aac-4ccca153234f`, built from the
  exact main tree above
- Restored smoke: health 200 with writes off, approved-origin write 503, unapproved Origin 403
- Restored secrets: `SUPABASE_SERVICE_ROLE_KEY` and `TURNSTILE_SECRET_KEY` present

## Remaining production Gates

- Authenticated create/reply/delete Canary using the real widget
- Cloudflare Access application with MFA for `admin.bubblenews.today`
- Admin deployment and mutation smoke test
- Independent final security/data/UX review after those external controls are active
