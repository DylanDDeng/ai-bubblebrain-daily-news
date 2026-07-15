# Knowledge taxonomy contract v1

The canonical registry is `data/knowledge/taxonomy.json`; its schema is
`schemas/knowledge-taxonomy.schema.json`.

## Stable identity and rename rules

- `id` is permanent, never reused, and is the value stored in daily reports and personal state.
- Canonical routes are `/topics/<slug>/` and `/entities/<slug>/`.
- A slug may change only when its old value is appended permanently to `slug_aliases`. Alias routes
  redirect and canonicalize to the current slug.
- `aliases` are search/classification names only. They never define a URL.
- Current and historical slugs are unique within their registry type.
- Records are never deleted. `deprecated` is a tombstone; `merged` requires `redirect_to_id` and
  resolves to an extant active record of the same type. Historical daily reports may continue to
  reference any known tombstone or merged ID. Only the classifier and provider mappings are
  restricted to active IDs; search and directory counts resolve merged IDs to their canonical ID.
- Entity `entity_type` is stable. A semantic type change requires a new entity and a merge redirect.

## Classification

The Worker is the only writer of `topic_ids` and `entity_ids`. Upstream provider values are
untrusted: they are normalized and translated only through the versioned `provider_mappings` table.
Unknown values are ignored, then deterministic keyword matching is applied to normalized title,
summary, source, and provider text. Search aliases and keywords both participate in this fallback.
Provider mapping keys must exactly cover the active structured source registry. Matches are de-duplicated and sorted in registry order. If no
topic matches, `topic_other` is emitted. The same input and registry version must produce identical
ordered IDs.

Daily report v1 now carries `taxonomy_version=1`, `classifier_version=1`, `topic_ids`, and
`entity_ids`. This change is allowed only before the first production structured JSON is published.
Once production contains a v1 JSON report, future breaking taxonomy fields require a new daily
schema version.

## Search and state

- Item search targets `/daily/YYYY/MM/YYYY-MM-DD/#news-<stable-item-id>`.
- Shareable filters use stable IDs; display labels and slugs may change without breaking state.
- Unknown or dangling taxonomy IDs fail the build and Worker artifact validation.
