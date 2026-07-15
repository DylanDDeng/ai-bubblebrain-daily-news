# Daily report schema compatibility

`daily-report.schema.json` is the framework-independent public data contract for the Astro migration.

- `schema_version: 1`, `identity_version: 1`, and `dedupe_version: 1` are frozen together when the
  first production JSON is published. Existing v1 fields cannot be removed, renamed, or change
  meaning.
- Additive optional fields require fixtures and compatibility tests before use.
- Breaking changes require a new schema version and a parallel reader during migration.
- Worker publishing owns normalization, stable IDs, deduplication, and deterministic artifacts.
- Hugo and Astro are consumers; they must not independently reimplement identity or deduplication.
- `data/daily/YYYY-MM-DD.json`, `daily/YYYY-MM-DD.md`, and `content/daily/YYYY-MM-DD.md` must be generated from the same report object.

## Source registry v1

`src/daily/sourceRegistry.js` is the complete registry for the 11 active adapters. `source_type` is
the stable provider key and is never inferred from a display name. `content_type` is the separate
rendering class. `src/daily/sourceAdapters.js` maps every active legacy adapter object to exactly one
provider key so Phase 1C can preserve provider identity without changing the legacy transformed
payload.

| Provider key | Content type | Primary identity |
| --- | --- | --- |
| `aibase` | `news` | source ID |
| `xiaohu` | `news` | source ID |
| `qbit` | `news` | source ID |
| `xinzhiyuan` | `news` | source ID |
| `openai_newsroom` | `news` | source ID |
| `github_trending` | `project` | canonical URL |
| `huggingface_papers` | `paper` | source ID |
| `jiqizhixin` | `paper` | source ID |
| `twitter` | `socialMedia` | source ID |
| `twitter_extra` | `socialMedia` | source ID |
| `reddit` | `socialMedia` | source ID |

Adding or renaming a provider requires a registry entry and identity-policy tests. Display-name
changes do not affect identity.

## Identity v1

An input may emit several exact claims:

- `source:<provider>:<source_id>` when a valid provider-scoped source ID exists;
- `url:<canonical_url>` when a non-root canonical URL exists;
- `fallback:<provider>:<normalized_title>:<published_date>` only when neither exact claim exists.

Claims are stored only as `c_<sha256>`. A provider policy selects the primary claim, which becomes
`n_<sha256>`. Raw URLs never appear in IDs. Phase 1 uses `e_<same-sha256>` as the event ID; this is a
temporary strict validation option so later event clustering can evolve without changing item IDs.

URL canonicalization is pure and network-free. It accepts only credential-free HTTP(S), normalizes
scheme/host/default ports, removes fragments and an explicit tracking-parameter allowlist, sorts
query pairs by code point, and preserves unknown business parameters, path case, and trailing
slashes. A domain root is never a URL identity claim.

## Dedupe v1

- Same-day entries are connected by any shared claim and reduced as a graph, independent of input
  order.
- An existing current-day item wins over later duplicates, preserving its item ID, first batch, and
  first `ingested_at`; new exact claims may be added.
- Cross-day dedupe reads structured reports only and filters incoming items matching any exact claim
  in the inclusive previous seven report dates. Seven is a v1 constant, not caller configuration.
- Cross-day matching never deletes an item already present in the current report.
- `structuredStartDate` is mandatory. The builder derives all expected history dates internally;
  missing reports on or after that date, duplicate history dates, or invalid history fail closed.

## Time and deterministic output

All report dates use `Asia/Shanghai`. Exact timestamps must carry an explicit timezone; ambiguous
timezone-less timestamps are not promoted to exact time. Injected `runAt` must also contain an
explicit offset or `Z`. `exact`, `date_only`, and `inferred` have separate schema and semantic
constraints.

All four batch slots are present in order. An unexecuted slot is `pending`, has `generated_at: null`,
and cannot contain items. A completed empty batch is distinct: it is `completed`, carries its actual
run time, and has an empty `item_ids` array.

`buildDailyArtifacts()` is a pure boundary: time is injected through `runAt`, it performs no file,
KV, GitHub, AI, or network I/O, and it emits stable JSON plus byte-identical compatibility Markdown
files. JSON object keys use canonical code-point ordering, independent of insertion order and host
locale. An exact rerun with a later clock is a byte-identical no-op. Golden checksums protect JSON
and Markdown ordering, whitespace, and final newlines.

Phase 1B does not import these modules from the legacy scheduled or manual publishing path and does
not publish structured JSON. Wiring is deferred to Phase 1C, where structured mode must remain
fail-closed until its atomic publication Gate passes.
