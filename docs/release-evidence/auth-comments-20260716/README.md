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

## Cloudflare Access and Admin

- Access application: `Bubble News Admin`
- Protected hostname: `admin.bubblenews.today`
- Access application ID: `49a90d50-d8d8-439f-bf87-2caa5fc7b115`
- Access AUD: `53966873f61f3a98b431155f0e71d32452f2622e2b88f26096606525659e9473`
- Policy: one allowlisted owner email, MFA required, 24-hour session
- Authenticator-app MFA and the allowlisted App Launcher enrollment path were enabled and exercised
- Unauthenticated requests redirect to Access; an authenticated owner reaches the Admin UI
- Admin Worker: `bubble-community-admin`, `workers_dev=false`, custom domain active
- Admin Worker version: `1694d3d4-62f4-4dba-af27-1fede18bff95`
- Required Admin secrets are present; their values were not recorded
- Authenticated Admin smoke: switch state read successfully, only the two `page:/` rows are listed,
  and no Gallery/Video archive row is exposed to moderation

## Authenticated production Canary and rollback

- Canary Pages deployment: `3db6a2d1-d7d0-4baf-87ac-2cffeb8dd82a`, exact source `1e6b3e3`
- Canary Community Worker version: `aaba8626-c55e-4db2-8006-a30c0df3833a`
- Astro unit tests: 63 passed; typecheck, lint, CSP, and all 621 routes passed before deployment
- Canary article HTML SHA-256 matched between the local exact-source artifact and production:
  `63fcb5d8d333825bd73e92fde179239cf6a40af092d86451848aff4804c66d80`
- Google PKCE production login succeeded and the real hostname-bound Turnstile widget completed
- Root Canary ID `0cb3a6ae-6ac8-436c-b1d4-158e06c73afd` was created at
  `2026-07-17T00:56:20.171954Z`
- Reply Canary ID `20687c2a-1b56-4682-9dc8-fcd137eea482` was created at
  `2026-07-17T00:56:39.703782Z`
- The authenticated browser count advanced from 2 to 3 to 4, proving create and reply through the
  real UI, Worker, Turnstile, and database boundaries
- Both exact Canary rows were removed after evidence capture; no historical row was modified
- Post-cleanup database state: 13 comments total, including 2 page rows, 8 archived `ai-gallery`
  rows, and 3 archived `ai-video` rows; Canary rows remaining: 0
- A follow-up delete-only Canary, ID `4d674405-843d-44ca-9591-b1623347b818`, was created at
  `2026-07-17T01:16:09.545041Z`; the authenticated UI count advanced from 2 to 3 and exposed the
  owner-only delete control
- The browser automation reached the native delete confirmation, but could not accept it reliably;
  this does not count as a passed authenticated UI delete Gate
- The follow-up row was removed by one exact ID/user/content SQL cleanup after both security
  switches were disabled; the database returned to 13 comments and no Canary row remains

## Final read-only convergence

- Database `comments_write_enabled=false`, confirmed at `2026-07-17T01:20:04.923845Z`
- Community Worker writes-off deployment: `d0c31150-4bf2-4b26-8a59-a50b4ce57d23`
- Community Worker writes-off version: `46ffd828-f684-4457-a0ef-5c42b0546182`
- Community Worker health: 200 with `writesEnabled=false`
- Approved-origin mutation while disabled: 503
- Unapproved Origin mutation: 403
- Read-only Astro verification: 63 tests, typecheck, lint, CSP, and 621 routes passed
- Read-only artifact manifest SHA-256: `2e21380081bc52fab3a435c2ca5d589605a32d0243ef18e862fd7fb72e9d4a2d`
- Final Pages production deployment: `f1533f91-6604-44bb-9284-6f49c529ecef`, exact source
  `1e6b3e3`
- Final local/production article HTML SHA-256:
  `641879256017e8851dca25bd8e81fcd83163086ee2962163f822b73a05b4fa64`
- Authenticated Chrome verification: discussion state `ready_data`, visible count 2, composer hidden,
  reply controls 0, delete controls 0, and the read-only notice is visible
- Authenticated Admin verification: switch button reads `开启生产评论写入`, proving the switch is
  currently off; the UI lists exactly the two page comments and no archived Gallery/Video row

## Remaining production Gates

- Complete one authenticated owner delete through the real production UI and native confirmation;
  database cleanup alone is not accepted as proof of this Gate
- Repeat the independent final security/data/UX review after that delete Gate and the subsequent
  three-layer read-only convergence
