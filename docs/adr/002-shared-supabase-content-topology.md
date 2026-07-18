# ADR-002: Share the existing Supabase project with strict logical isolation

- Status: Accepted
- Date: 2026-07-17
- Project: `test1` (`znurdobjryrhshzkalup`)

## Context

ADR-001 selected physical project isolation for the v4.1 production topology. Creating another free project is blocked by the account's two-active-project limit, and the product owner prefers one backend for one product. The existing project already hosts Auth, profiles, comments, favorites and community state.

## Decision

Content and community data share one Supabase Postgres instance. Isolation remains explicit at every lower layer:

- content objects stay in the restricted `private` schema and use content-specific table names;
- `content_rpc_owner` remains `NOLOGIN`, while the five runtime roles remain `NOINHERIT`, `NOBYPASSRLS`, without memberships and with a 20-connection ceiling;
- runtime roles receive function execution only and no direct content or community base-table access;
- content tables use forced RLS, immutable release records and seven fail-closed switches;
- production tooling defaults to `isolated_project`; using `test1` requires both
  `CONTENT_DATABASE_TOPOLOGY=shared_project` and the exact
  `CONTENT_SHARED_PROJECT_ACK=I_ACCEPT_SHARED_AUTH_CONTENT_BLAST_RADIUS:znurdobjryrhshzkalup`;
- installing the schema does not enable any content production capability.

The 11 content migrations were applied to `test1` on 2026-07-17. All seven capability switches were verified `false` after deployment.

## Consequences

This reduces cost and operational duplication, but content and community now share compute, connection, migration and disaster-recovery blast radius. A project-level PITR restore affects both domains. A content-only recovery must therefore restore the encrypted logical backup into a temporary project and selectively reconcile content objects; it must not rewind the live shared project without a combined Auth/Community impact review.

Capacity alerts must include total project connections and database load. Content role credentials remain unacceptable for Community operations, and `service_role` remains unacceptable for Content Workers.

## Reversal

The content schema, immutable R2 objects and logical backups preserve a future split path. A later migration can restore content objects into a dedicated Supabase project, rotate the five role credentials and Hyperdrive bindings, verify exact release identities, and then retire shared-project access without rewriting content history.
