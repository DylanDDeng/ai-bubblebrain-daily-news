# Grok X ingestion

The structured daily workflow runs Grok X Search alongside the existing Folo
sources. `grok_x` is a `socialMedia` provider whose primary identity is the
canonical X status URL.

- Production handles are configured with `GROK_X_HANDLES` and split into
  groups of at most 20 per xAI request.
- Regular runs use a three-hour overlapping publication window.
- The Beijing-midnight run uses a 48-hour reconciliation window.
- Image and video understanding are required and remain enabled.
- Every returned URL, handle, status ID, and exact timestamp is validated
  locally before the item enters normalization and deduplication.
- Any failed handle group discards the complete Grok result for that run.
- Grok provider failures are non-blocking warnings, so Folo and later cron
  runs continue.
- `XAI_API_KEY` is a Cloudflare Worker secret and must never be committed.
