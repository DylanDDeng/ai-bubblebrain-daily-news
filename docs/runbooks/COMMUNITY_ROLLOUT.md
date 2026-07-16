# Community rollout and rollback

## Boundaries

- `bubblenews.today` is a static Astro site. It owns Supabase PKCE sign-in and public comment reads.
- `community-api.bubblenews.today` is the only public comment mutation boundary.
- `admin.bubblenews.today` is a separate Worker and must not be deployed until Cloudflare Access with
  MFA is attached to the hostname.
- The existing `ai-daily` Worker and its `/login` route are not ordinary-user authentication.

## Required production secrets

Community API:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SECRET_KEY`

Admin Worker:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`

Secrets never enter Astro, GitHub artifacts, Worker variables, or logs.

## Release order

1. Run `bash scripts/test-supabase-local.sh`.
2. Run `npm test`, `npm run community:check`, `npm run admin:check`, and
   `npm run verify --prefix astro`.
3. Push the additive Supabase migration. Confirm `get_page_comments` returns the two legacy page
   rows, `comments` returns 401 to anon, and Gallery/Video thread IDs are rejected by the RPC.
4. Deploy the Community API with `COMMENTS_WRITE_ENABLED="false"`. Confirm `/health` and a 503 write
   response from the production hostname.
5. Build and deploy Astro login and read-only discussion with
   `PUBLIC_COMMENTS_WRITE_UI_ENABLED=false` (the fail-closed default). Confirm callback is noindex,
   the legacy page shows exactly two comments, and an authenticated user sees the read-only message
   instead of the composer.
6. Configure a real Turnstile widget for `bubblenews.today`. Never use Cloudflare test keys while a
   public production write path is enabled.
7. Run a controlled write Canary. Set `PUBLIC_COMMENTS_WRITE_UI_ENABLED=true` in the immutable Astro
   build, and enable both the Worker environment and database setting. The UI flag is presentation
   gating only; the Worker and database remain the security boundaries. Disable both security
   switches immediately after the test until the release review is complete. Then reset the GitHub
   and Pages build variable to `false`, rebuild the same exact source, redeploy the read-only
   artifact, and verify an authenticated user has no composer, reply, or delete controls. Do not
   leave a Canary artifact with its UI capability enabled while either security switch is off.
8. Attach Cloudflare Access + MFA to `admin.bubblenews.today`, disable `workers.dev`, then deploy the
   admin Worker. Test unauthenticated 401, non-allowlisted 401, same-origin moderation, and the kill
   switch.
9. Open production writes only after the independent security, data, and UX reviews pass.

## Rollback

1. Set the Community Worker `COMMENTS_WRITE_ENABLED` variable to `false`.
2. Call service-role-only `admin_set_comment_writes(false)` or use the protected admin switch. The
   database switch is authoritative even if an old frontend remains cached.
3. Re-deploy the last known-good Astro artifact from GitHub Actions.
4. Roll back the Community Worker to the verified writes-off version with
   `npx wrangler rollback fa39969d-53c8-406b-932e-7e575f38f0a4 --config wrangler.community.toml --name bubble-community-api --yes`
   if required. After recovery, redeploy the intended exact source and repeat the health, disabled
   write, and Origin checks.
5. Keep the additive database migration. Fix database issues with a new forward migration; do not
   run a destructive down migration against the preserved 13 comments and 14 favorites.

## Current production-safe state

- The database kill switch defaults to off.
- The Community Worker deploys with writes off.
- Astro hides the composer unless `PUBLIC_COMMENTS_WRITE_UI_ENABLED` is exactly `true` and the
  environment has a matching real Turnstile site key.
- Gallery/Video comments and favorites remain stored but are not publicly routed.
