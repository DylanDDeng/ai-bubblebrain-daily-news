# Supabase schema

The authoritative database schema is the ordered migration history in
`migrations/`. Apply it with the Supabase CLI; do not copy historical bootstrap
SQL into the dashboard.

Database security behavior is covered by the pgTAP suites in `tests/database/`.
