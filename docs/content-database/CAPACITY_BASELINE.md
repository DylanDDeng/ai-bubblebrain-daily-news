# Content database capacity baseline

Measured on 2026-07-17 from branch `codex/content-database-v4-1`.

| Signal                         | Current measured value |                                        Initial hard budget / alert |
| ------------------------------ | ---------------------: | -----------------------------------------------------------------: |
| Git packed objects             |                  5,472 |            Observe monthly; no history rewrite before 250 MiB pack |
| Git pack size                  |              46.54 MiB |                              Alert at 150 MiB; redesign at 250 MiB |
| Structured report files        |                      2 |                                   Import coverage must remain 100% |
| Structured report bytes        |          884,244 bytes |                               R2/DB byte totals must match exactly |
| Structured items               |                    322 |                      No fixed product cap; schema cap 1,000/report |
| Static search index            |        1,089,227 bytes |                        Maximum 8 MiB and maximum seven report days |
| Pinned Astro route contract    |            625 records | Must never regress below the checked-in contract floor without ADR |
| Pinned Astro output files      |                    511 |            Pages plan file-count limit must remain at least 2x P95 |
| Pinned Astro output size       |                 91 MiB |                Observe against the one-year 1.25 GiB asset-set cap |
| Pinned build wall time (local) |            about 6.1 s |                                            CI P95 budget 8 minutes |

## One-year projection and service budgets

The first two reports total 884,244 bytes and 322 items. A deliberately conservative projection uses 500 KiB/report and 200 items/report:

- exact report payloads: about 178 MiB/year;
- rows: about 73,000 report-item placements/year;
- four immutable site manifests/day: budget 250 MiB/year;
- four production artifacts/day at the current uncompressed size would be too expensive; artifacts therefore use content-addressed deduplication and the operational budget is 150 GiB/year, with an alert at 70%;
- Content API database P95: 250 ms for item/report and 750 ms for Chinese substring search;
- Content API 5xx: critical above 1% for five minutes;
- outbox oldest queued item: high above ten minutes;
- build peak RSS: 4 GiB on the pinned 7 GiB CI runner;
- content-addressed artifact manifest: 2 MiB; total Pages asset set: 1.25 GiB; individual Broker-fetched asset: 25 MiB;
- Supabase egress: 10 GiB/month warning, 20 GiB/month hard review;
- Pages production deployments: maximum four scheduled releases/day plus incident recovery.

The one-year projection proved that a whole-site tar is not a viable Worker boundary. Production therefore uses a content-addressed inventory and immutable per-file R2 objects. The Broker holds only one bounded upload batch (or one file above the 4 MiB batch target) and never materializes the full asset set.

The Git-owned compatibility build currently has 623 records. The pinned contract has 625 because the two DB-owned dates (`2026-07-16` and `2026-07-17`) each add the English route generated from the immutable report manifest. Both modes retain the same 27 XML endpoints; the two-record difference is intentional source ownership, not route loss.

## Measured one-year local projection

Evidence: `docs/release-evidence/content-database-v4-1-local-20260717/one-year-capacity.json`.

- 365 reports × 200 items = 73,000 immutable report-item placements;
- 248,834,215 exact report bytes; 392,400,019-byte local database;
- report P95 11.858 ms, item P95 2.093 ms and Chinese substring search P95 24.635 ms (local Postgres projection, not a production latency claim);
- the Chinese plan used both title and summary `pg_trgm` GIN indexes;
- 20 simultaneous database connections were observed, matching the role limit;
- Astro built 826 pages in 59.9 seconds end-to-end with 3,457,024,000-byte peak RSS;
- 1,393 Pages files / 1,083,970,303 bytes; largest file 18,334,262 bytes;
- content-addressed inventory 465,820 bytes; Broker peak asset 18,334,262 bytes;
- static search stopped at 8,381,329 bytes, six report days and 1,083 items, proving both the seven-day ceiling and 8 MiB truncation path.

## Required Phase 4 load evidence

Before production publication is enabled, generate a one-year projection dataset and archive:

- Chinese substring recall/ranking examples and `pg_trgm` query plans;
- P50/P95/P99 API latency and peak database connections;
- Astro build time, peak RSS, fetched R2 bytes and artifact size;
- Pages file count and largest file;
- seven-day/8 MiB search truncation behavior;
- R2 and Supabase monthly cost projection.

Budget overrun may reduce historical-search availability or delay noncritical rebuilds. It may not skip release identity, Preview, fencing, edge verification or rollback gates.
