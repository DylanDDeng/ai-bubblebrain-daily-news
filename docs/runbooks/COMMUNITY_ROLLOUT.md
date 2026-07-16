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

Secrets never enter Astro, GitHub artifacts, Worker variables, or logs.

## Release order

1. Run `bash scripts/test-supabase-local.sh`.
2. Run `npm test`, `npm run community:check`, `npm run admin:check`, and
   `npm run verify --prefix astro`.
3. Push the additive Supabase migration. Confirm `page_comments` returns the two legacy page rows,
   `comments` returns 401 to anon, and Gallery/Video rows are absent from the view.
4. Deploy the Community API with `COMMENTS_WRITE_ENABLED="false"`. Confirm `/health` and a 503 write
   response from the production hostname.
5. Deploy Astro login and read-only discussion. Confirm callback is noindex and the legacy page shows
   exactly two comments.
6. Configure a real Turnstile widget for `bubblenews.today`. Never use Cloudflare test keys while a
   public production write path is enabled.
7. Run a controlled write Canary. The Worker environment and database setting must both be enabled;
   disable both immediately after the test until the release review is complete.
8. Attach Cloudflare Access + MFA to `admin.bubblenews.today`, disable `workers.dev`, then deploy the
   admin Worker. Test unauthenticated 401, non-allowlisted 401, same-origin moderation, and the kill
   switch.
9. Open production writes only after the independent security, data, and UX reviews pass.

## Rollback

1. Set the Community Worker `COMMENTS_WRITE_ENABLED` variable to `false`.
2. Call service-role-only `admin_set_comment_writes(false)` or use the protected admin switch. The
   database switch is authoritative even if an old frontend remains cached.
3. Re-deploy the last known-good Astro artifact from GitHub Actions.
4. Roll back the Community Worker with `wrangler rollback <version> --name bubble-community-api` if
   required.
5. Keep the additive database migration. Fix database issues with a new forward migration; do not
   run a destructive down migration against the preserved 13 comments and 14 favorites.

## Current production-safe state

- The database kill switch defaults to off.
- The Community Worker deploys with writes off.
- Astro hides the composer when no real Turnstile site key is present.
- Gallery/Video comments and favorites remain stored but are not publicly routed.
