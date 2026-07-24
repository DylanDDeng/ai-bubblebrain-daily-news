#!/usr/bin/env bash

set -euo pipefail

run_supabase() {
  if command -v supabase >/dev/null 2>&1; then
    supabase "$@"
  else
    npx supabase "$@"
  fi
}

started_here=false
cleanup() {
  if [[ "$started_here" == "true" ]]; then
    run_supabase stop --no-backup >/dev/null
  fi
}
trap cleanup EXIT

if ! run_supabase status --output json >/dev/null 2>&1; then
  run_supabase start \
    --exclude edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector \
    --log-level warn
  started_here=true
fi

run_supabase db reset --local
run_supabase test db

db_container="$(docker ps --format '{{.Names}}' --filter 'name=supabase_db_' | head -n 1)"
if [[ -z "$db_container" ]]; then
  echo "Supabase database container was not found" >&2
  exit 1
fi

for migration in supabase/migrations/*.sql; do
  docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done

run_supabase test db
CONTENT_TEST_DATABASE_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" \
  node scripts/test-content-failure-matrix-local.mjs
echo "Supabase migrations, second-run idempotency, pgTAP, and failure matrix passed."
