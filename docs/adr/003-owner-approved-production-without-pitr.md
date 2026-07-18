# ADR-003: Owner-approved production operation without PITR

## Status

Accepted by the product owner on 2026-07-18.

## Decision

The shared `test1` Supabase project will not purchase or enable point-in-time
recovery (PITR). PITR is not a production activation gate for the content
database. This decision supersedes ADR-001 and the v4.1 gate register wherever
they require PITR as a hard prerequisite.

The product owner explicitly accepts the residual recovery risk and authorizes
the content backend, Routine Admin, Preview, publication, Control and global
suppression capabilities to enter production use.

## Compensating controls

- encrypted logical database backups remain scheduled and monitored;
- report snapshots, manifests and release artifacts remain content-addressed
  and protected by R2 object-lock rules;
- content revisions and releases remain immutable and normal application paths
  do not hard-delete content;
- high-risk Control actions continue to require Access, Owner authorization,
  a typed confirmation, TOTP and an audit record;
- schema changes continue to use additive migrations and take a logical backup
  before any destructive maintenance.

The recovery monitor must remain disabled while it only supports PITR-backed
health evidence. Its disabled state is an accepted configuration, not a claim
that PITR is enabled.

## Production activation

Production activation still requires one authoritative Pages publisher, a
passing runtime preflight and successful smoke verification. Remaining v4.1
observation drills and independent reviews are tracked follow-up evidence; they
do not block the owner-approved activation.
