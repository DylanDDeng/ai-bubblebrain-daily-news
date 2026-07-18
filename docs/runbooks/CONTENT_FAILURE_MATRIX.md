# Content database failure matrix

| Fault                                      | Expected invariant                                                                  | Recovery / evidence                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| DB unavailable during dual write           | Git publication succeeds; no current pointer change                                 | Mirror error log; reconciler imports exact Git JSON later |
| Crash after report R2 PUT                  | Orphan only; no DB reference to unverified object                                   | Safe delayed orphan inventory                             |
| Crash after DB commit                      | Same report hash reuses one reservation, release and outbox row                     | deterministic publication slot reconcile                  |
| GitHub dispatch 204 response lost          | retry uses the same dispatch/release tuple                                          | failed lease retry plus dispatch ID                       |
| duplicate queue / two dispatchers          | one claim per lease                                                                 | `FOR UPDATE SKIP LOCKED`, attempt events                  |
| exhausted claimed lease                    | row enters DLQ once; no stale worker may continue                                   | lease sweep plus structured Deployer alert                |
| wrong finalization dispatch tuple          | no release/outbox identity can be substituted                                       | exact tuple rejection evidence                            |
| callback lost                              | production Preview becomes reclaimable after lease; shadow Preview stays terminal   | exact dispatch retry / Broker reads real manifest         |
| A/B/C Preview out of order                 | only valid predecessor and pointer generation promotes                              | authorization rejection evidence                          |
| stale fencing token                        | no production upload/commit                                                         | DB `Stale production fencing token`                       |
| crash after production upload before CAS   | target commits only if real manifest converges; otherwise old artifact restored     | reconciler evidence                                       |
| Preview verification failure               | no Broker request                                                                   | failed workflow event                                     |
| custom-domain propagation failure          | pointer remains old and exact old artifact is restored                              | multi-endpoint probe evidence                             |
| Content API cache purge failure            | pointer CAS is not attempted and success is not reported                            | repair token/config and retry same fenced operation       |
| rollback authorize then crash              | pointer unchanged                                                                   | same rollback token reconciled                            |
| rollback upload then crash                 | target commit or old public state restored uniquely                                 | real Pages manifest plus generation CAS                   |
| forged actor/email/role                    | ignored; role comes from attested `sub`                                             | negative RPC test                                         |
| expired/replayed assertion                 | mutation rejected                                                                   | consumed JTI / expiry test                                |
| Routine credential calls Control RPC       | execute denied                                                                      | pgTAP grant matrix                                        |
| unpromoted release read through public API | manifest, report, item and search all deny; build capability remains authenticated  | public/build isolation regression                         |
| editorial switch disabled after request    | claim, stage and finalize each fail closed                                          | `admin_publish` and `publication` kill-switch checks      |
| report-scoped hide                         | only named report placement disappears; base release and global overrides unchanged | immutable editorial release and finalization audit        |
| global suppression stage failure           | retry obtains a new reservation; no partial release or reintroduction               | staged-failure retry and immutable suppression release    |
| production reconcile without fresh TOTP    | reconciliation denied and every accepted request audited                            | Access plus TOTP attestation regression                   |
| failed/DLQ manual retry                    | same outbox and dispatch identity; one extra bounded attempt; Owner audit           | Control `POST /v1/operations/retry`                       |
| same-release rebuild repeated              | one new dispatch for one idempotency key; immutable release identity unchanged      | Control `POST /v1/operations/rebuild`                     |
| legacy/DB overlap or gap                   | build fails closed                                                                  | boundary build test                                       |
| R2 existing key with different bytes       | critical collision; no DB reference                                                 | read-after-write mismatch alert                           |
| backup/PITR exceeds RPO                    | production publication frozen                                                       | backup freshness alert                                    |
| Content API failure                        | static HTML/RSS/sitemap remain readable                                             | API error budget alert                                    |

## Mandatory concurrency drills

Before Phase 5, archive automated evidence for 50 identical/different concurrent ingestion payloads, crossed claim order, expired leases, A/B/C release order, forward-vs-rollback contention, stale draft rebase, duplicate callbacks and wrong code/content/artifact/manifest hashes.

Local automated evidence is archived in `docs/release-evidence/content-database-v4-1-local-20260717/failure-matrix.json`: 50 identical and 50 different ingestions; deterministic mirror reservation/finalize retry; append-only failed-then-successful publication attempts; one-outbox commit-response-loss recovery; wrong dispatch tuple rejection; 50 claimers; exhausted-lease DLQ; production callback-loss reclaim; terminal shadow Preview; public/build read isolation; callback monotonicity/identity; A/B/C/rollback/D fencing and recovery; editorial kill switches at claim/stage/finalize; report-scoped hide; global-suppression staged-failure retry; reconciliation TOTP/audit; Owner-attested manual retry and idempotent same-release rebuild; Content/Operations/verifier-diff reads; evidence hashes; 60-second single-use assertions; authentication context; and Routine/Control role separation all passed.

No test may repair correctness through an operator-only database update. Recovery must use the same RPC/Broker/runbook path available during an incident.
