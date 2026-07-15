# Structured daily recovery runbook

Use this runbook when production temporarily returns to legacy publication long enough to leave one
or more missing `data/daily/YYYY-MM-DD.json` reports. The structured builder intentionally fails
closed on a gap inside its active seven-day history epoch.

## Safety rules

- Keep production in `legacy` and `DAILY_STRUCTURED_WRITES_ENABLED=false` while investigating.
- Do not fabricate empty JSON reports or infer structured item identities from legacy Markdown.
- Do not move the original `DAILY_STRUCTURED_START_DATE` backwards.
- Resume at an Asia/Shanghai report boundary, not in the middle of a partially published report day.
- Deploy and test configuration changes separately from Astro Pages or Supabase changes.

## Start a new history epoch

1. Confirm the last complete structured date and list every missing structured date.
2. Choose the next untouched Asia/Shanghai report date as the resume date.
3. Set `DAILY_STRUCTURED_RESUME_DATE` to that date in the Worker configuration. It must be on or after
   `DAILY_STRUCTURED_START_DATE` and no later than the report date being processed.
4. Keep scheduled writes disabled and run the morning batch manually in staging with the same epoch
   dates. The response must include the chosen `history_epoch_start_date`.
5. Verify the generated JSON and both Markdown artifacts, their schema, and renderer CI.
6. Run one production manual canary through the publication PR path. Wait for its required checks and
   merge before enabling scheduled structured writes.
7. Observe morning, afternoon, night, and late-night batches. The resume date remains the epoch start;
   the normal seven-day window fills naturally after seven report days.

This procedure intentionally starts a new deduplication epoch. Cross-day duplicate protection only
uses structured reports from the new epoch until the seven-day window refills. Record this accepted
temporary limitation in the release evidence.

## Roll back again

If any canary or scheduled batch fails:

1. Set `DAILY_PUBLISH_MODE=legacy` and `DAILY_STRUCTURED_WRITES_ENABLED=false` on the hardened Worker.
2. Leave a failed publication PR unmerged. Close it only after recording its candidate SHA and CI
   result.
3. Do not delete structured reports that were already merged.
4. Select a later untouched report date for the next `DAILY_STRUCTURED_RESUME_DATE` and repeat this
   runbook.

## Publication lock recovery

The production pull-request publisher serializes candidates with the persistent Git ref
`automation/daily-lock-main`. Normal release advances this ref with a non-force compare-and-swap to a
commit whose message starts with `Publication lock released`; it does not delete the ref. A released
state can be acquired immediately. An active lock is considered stale only after 15 minutes according
to its Git commit committer timestamp and the current Worker clock. Invalid or future timestamps fail
closed and must not be auto-cleared.

If a run crashes while holding the lock:

1. Set `EXTERNAL_WRITES_ENABLED=false` before manual intervention.
2. Confirm there is no running Worker invocation, publication Action, or open publication PR still
   changing its head.
3. Read the lock ref, commit message, and timestamp twice, at least 15 minutes apart. A released commit
   needs no cleanup. Continue only when an active-lock SHA is unchanged and older than the TTL.
4. Prefer triggering a new manual run: the publisher takes over the stale ref with a non-force
   fast-forward compare-and-swap. Two contenders cannot both win.
5. Delete the lock ref manually only when takeover cannot run and the state is corrupt. Immediately
   before deletion, read it again and abort if its SHA changed. After deletion, read the ref again and
   confirm that it no longer exists. Record the deleted SHA and timestamp in the release evidence.
6. Re-enable external writes only after one manual legacy canary creates, validates, and merges its
   publication PR.

Never force-update the lock ref and never delete a fresh lock. A changed owner SHA means another run
owns it, even when the earlier run has already returned an error.

## Main advanced while a publication PR is open

Strict branch protection requires the publication head to contain the latest `main`. If `main`
advances while a candidate is waiting for checks, the merge is expected to stop. Do not disable the
up-to-date requirement and do not merge `main` into the candidate.

On the next publication batch, the Worker holds the publication lock and:

1. Validates the pending single-parent chain with the same policy used by CI.
2. Fails closed when `main` changed any pending daily artifact path.
3. Replays each validated artifact commit, in order, onto an immutable latest-`main` snapshot.
4. Creates a new SHA-suffixed branch and PR before closing the old PR.
5. Records the old candidate SHA in the new PR so older trigger markers follow the replay alias.

The new PR must run every required check again. If `main` advances again, a later batch repeats the
same bounded replay. An unrelated second publication PR, an alias cycle, more than eight commits,
more than three report dates, or an incomplete GitHub comparison stops automation for investigation.

## Required evidence

- Worker version and Git SHA before and after the exercise.
- Original start date, gap dates, and chosen resume date.
- Manual trigger response and publication PR URL.
- CI run, merged commit, and artifact byte-consistency result.
- The legacy rollback version and the exact flags used.
