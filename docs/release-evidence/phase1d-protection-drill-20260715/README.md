# Phase 1D protected publication drill

Date: 2026-07-15 UTC

Source branch: `codex/astro-phase-1a`

Source SHA: `b6b54e8f54bf8bb49c88ac95b89cec22ded22a71`

Temporary base: `codex/phase1d-protection-drill-20260715`

The temporary base was isolated from `main`. No production Worker variable, Supabase schema, Pages
production configuration, or production publication mode changed during this drill.

## Protection policy

- Required checks: `worker-security`, `renderer-parity`
- Strict up-to-date requirement: enabled
- Enforce administrators: enabled
- Force pushes: disabled and verified with an HTTP 422 rejection
- Branch deletion: disabled and verified with an HTTP 422 rejection

## Initial fail-closed evidence

[PR #2](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/2), candidate
`1b274114e161cc993ed150e66ec666cedd589bf7`, remained unmerged because the first temporary base was
outside the Worker CI pull-request filter. The candidate was recorded, commented, closed, and its
branch deleted before the corrected drill. Run `29395904388` also exposed the obsolete inline
`auto-sync-daily` heredoc. The workflow was restricted to `main` pushes, changed to call the
maintained sync script, and granted explicit `contents: write` permission.

The promotion workflow was also corrected so a temporary drill base skips the production
`build-and-deploy.yml --ref main` dispatch. The independent review after both corrections was
`GO` with P0=0 and P1=0.

## Successful protected promotion

[PR #3](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/3) exercised a valid legacy
publication candidate:

- Candidate: `bba4aaf50b8f04c7447f2d041c625ebae2fce39a`
- Worker CI run: `29396544131`
- Merge commit: `df21c5315727c2c0f4b18f26fa4da7b6ba0626af`
- `worker-security`: passed
- `renderer-parity`: passed
- `promote-publication`: passed
- Production Pages dispatch step: skipped

## Strict up-to-date rejection and replay

[PR #4](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/4) advanced only the temporary
base after its required checks passed:

- Head: `fd1ef3b1f08c2329fc7764d4d15d492bf909163c`
- Merge commit: `be479abee1dfc232e4b35dc3c636e53afdd121e2`

The actual Worker publication code created [PR #5](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/5)
from the older base:

- Candidate: `faea2228e589d34035531b593a684927ee7f528f`
- Worker CI run: `29396779161`
- `worker-security`: passed
- `renderer-parity`: passed
- Policy verification: passed
- Promotion: rejected because the head was not up to date with the protected base

The next actual Worker publication validated and replayed the old afternoon commit onto the latest
base, appended the night commit, created [PR #6](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/6),
and then closed PR #5:

- Replayed commit: `95fa35418bb4931adbcfe9d0c0db5864279099a7`
- Successor head: `e74b072639d313c3d60c15b9803a0789826522ae`
- Worker CI run: `29396920819`
- Merge commit: `bf5530f09a8e90e330f4cd2df5f21ed13eebf811`
- Alias lookup from the old candidate resolved to the merged successor

## Lost response reconciliation

For [PR #7](https://github.com/DylanDDeng/ai-bubblebrain-daily-news/pull/7), the test wrapper allowed the
real GitHub pull-request create request to succeed and then deliberately discarded the response.
The production publication code listed existing publication PRs, found the exact candidate branch,
and returned `reconciled: true` without creating a duplicate.

- Candidate: `f3ca37a24ba976f3cdae0bd85152ec5daa4c3b14`
- Worker CI run: `29397022278`
- Merge commit: `1a3d2610962a43e209466a9bce4bf7781c905d8a`
- All required checks and promotion: passed

## Local and independent gates

- Root test suite: 193/193 passed
- Atomic Git suite: 29/29 passed
- Production Worker dry-run bundle: passed
- Staging Worker dry-run bundle: passed
- Astro diagnostics: 0 errors, 0 warnings, 0 hints
- Astro tests: 8/8 passed
- Astro build: 212 pages
- Hugo/Astro parity: 208 daily routes
- `git diff --check`: passed
- Independent review: `GO`, P0=0, P1=0

## Cleanup

After evidence capture, remove the temporary branch protection, the temporary base, its persistent
drill lock ref, and temporary local worktree. The production `main` protection decision remains a
separate Gate after the remaining Phase 1D staging and recovery exercises.
