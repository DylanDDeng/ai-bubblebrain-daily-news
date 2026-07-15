# External link audit

The Astro release gate audits every distinct HTTP(S) link rendered by the deployed Pages preview.
The audit is evidence for migration safety, not a promise that third-party content will remain
available forever.

Run it against an immutable Preview SHA:

```sh
npm run verify:preview -- \
  https://<deployment>.pages.dev \
  <40-character-git-sha> \
  astro/dist/release-manifests/site-route-manifest.json \
  --check-external \
  --external-waivers=config/external-link-waivers.json \
  --external-report=output/external-link-audit.json
```

## Outcomes

Every URL has exactly one terminal outcome in the JSON report:

- `success`: the final HTTP response is 2xx or 3xx.
- `confirmed-dead`: a lightweight GET confirms HTTP 404 or 410.
- `reachable-restricted`: the server responds but refuses or limits automated access.
- `transient-upstream`: the final response is 5xx after retry.
- `transport-unknown`: timeout, reset, or another non-deterministic network error after retry.
- `circuit-open`: not requested after three direct transient failures from the same origin.
- `policy-failure`: deterministic DNS/TLS failure or an unsafe target/redirect.
- `incomplete`: not requested before the global deadline.

HEAD is only an optimization. Any HEAD result that could be classified as unavailable is checked
again with a ranged GET before it can become `confirmed-dead`.

## Gate budgets

The gate cannot pass on accepted failures alone. It requires at least 90% direct probe coverage and
25% explicit success, permits at most 10% circuit-open results, at most 5% transport-unknown, at most
5% transient-upstream, and no incomplete results. Confirmed-dead and policy-failure URLs always fail.
An exceeded budget is `INCONCLUSIVE`, not success.

The full report is written atomically before the process exits. It records the Preview origin, Git
SHA, timestamps, configuration, budgets, every result, and the evidence that opened each origin
circuit. A missing report is itself a failed Gate.

## Historical link rot

For this Phase 4 cutover, confirmed-dead links are zero-tolerance unless the exact URL has a current,
version-controlled waiver in `config/external-link-waivers.json`. Every waiver includes its reason,
owner, accepted outcomes, and expiry date. An exact-URL waiver cannot suppress a different URL or a
different failure class.

Origins that block the release-audit network may receive a short-lived origin waiver only for
transient network outcomes. Each origin waiver has a hard `max_urls` cap. Exceeding the cap, reaching
the expiry date, changing to a hard DNS/TLS/dead-link outcome, or leaving no unwaived success evidence
keeps the Gate red or inconclusive. Waived results remain in the JSON report with their original
outcome and full waiver evidence; they are excluded only from the release budget denominator.

Review or remove every waiver before its expiry. Never use wildcards or an unbounded origin allowlist.

## Network safety

The verifier accepts only HTTP(S), resolves every hostname, blocks localhost, private, loopback,
link-local, documentation, multicast, and metadata-style addresses, and validates every redirect
target before following it. This keeps synchronized content from turning the audit into an internal
network probe.
