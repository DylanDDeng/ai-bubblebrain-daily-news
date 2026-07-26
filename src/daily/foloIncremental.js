import { getFoloDataApi } from '../folo.js';

const STATE_KEY = 'daily:folo-incremental:v1';
const CHECKPOINT_PREFIX = 'daily:folo-incremental:v2:checkpoint:';
const RECONCILE_PREFIX = 'daily:folo-incremental:v2:reconcile:';
const PENDING_PREFIX = 'daily:folo-incremental:v2:pending:';
const STATE_TTL_SECONDS = 60 * 24 * 60 * 60;
const MAX_DATE_MS = 8_640_000_000_000_000;
const REVERSED_TIMESTAMP_WIDTH = String(MAX_DATE_MS).length;
const DEFAULT_OVERLAP_MINUTES = 10;
const DEFAULT_RECONCILE_HOURS = 6;

function parseBoundedInteger(value, fallback, minimum, maximum, label) {
    const candidate = String(value === undefined || value === null || value === '' ? fallback : value).trim();
    if (!/^\d+$/.test(candidate)) throw new Error(`${label} must be an integer`);
    const parsed = Number(candidate);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }
    return parsed;
}

function explicitInstant(value) {
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function appendOnlyKey(prefix, instant) {
    const milliseconds = Date.parse(instant);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_DATE_MS) {
        throw new Error('Invalid Folo incremental checkpoint instant');
    }
    return `${prefix}${String(MAX_DATE_MS - milliseconds).padStart(REVERSED_TIMESTAMP_WIDTH, '0')}`;
}

function instantFromAppendOnlyKey(prefix, key) {
    const suffix = String(key || '').slice(prefix.length);
    if (!new RegExp(`^\\d{${REVERSED_TIMESTAMP_WIDTH}}$`).test(suffix)) return null;
    const milliseconds = MAX_DATE_MS - Number(suffix);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_DATE_MS) {
        return null;
    }
    try {
        return new Date(milliseconds).toISOString();
    } catch {
        return null;
    }
}

async function latestAppendOnlyInstant(kv, prefix) {
    if (typeof kv?.list !== 'function') return null;
    const page = await kv.list({ prefix, limit: 1 });
    const key = page?.keys?.[0]?.name;
    return key ? instantFromAppendOnlyKey(prefix, key) : null;
}

async function readLegacyState(kv) {
    if (!kv || typeof kv.get !== 'function') return null;
    const raw = await kv.get(STATE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const completedAt = explicitInstant(parsed?.completed_at);
        const reconciledAt = explicitInstant(parsed?.last_reconciled_at);
        return completedAt
            ? {
                  completed_at: completedAt,
                  last_reconciled_at: reconciledAt,
              }
            : null;
    } catch {
        return null;
    }
}

async function readState(kv) {
    const completedAt = await latestAppendOnlyInstant(kv, CHECKPOINT_PREFIX);
    if (completedAt) {
        return {
            completed_at: completedAt,
            last_reconciled_at: await latestAppendOnlyInstant(kv, RECONCILE_PREFIX),
        };
    }
    return readLegacyState(kv);
}

export function foloIncrementalEnabled(env) {
    return String(env.FOLO_INCREMENTAL_ENABLED).toLowerCase() === 'true';
}

export async function resolveFoloIncrementalPlan(
    env,
    {
        runAt,
        kv = env.DATA_KV,
        committedPlan = null,
    } = {},
) {
    const normalizedRunAt = explicitInstant(runAt);
    if (!normalizedRunAt) throw new Error('Folo incremental runAt must be an explicit instant');
    if (!foloIncrementalEnabled(env)) {
        return {
            enabled: false,
            mode: 'disabled',
            run_at: normalizedRunAt,
            inserted_after: null,
            inserted_after_ms: null,
            previous_checkpoint_at: null,
            last_reconciled_at: null,
        };
    }
    if (
        !kv
        || typeof kv.get !== 'function'
        || typeof kv.put !== 'function'
        || typeof kv.list !== 'function'
    ) {
        throw new Error('Folo incremental mode requires DATA_KV');
    }

    const overlapMinutes = parseBoundedInteger(
        env.FOLO_INCREMENTAL_OVERLAP_MINUTES,
        DEFAULT_OVERLAP_MINUTES,
        1,
        60,
        'FOLO_INCREMENTAL_OVERLAP_MINUTES',
    );
    const reconcileHours = parseBoundedInteger(
        env.FOLO_INCREMENTAL_RECONCILE_HOURS,
        DEFAULT_RECONCILE_HOURS,
        1,
        48,
        'FOLO_INCREMENTAL_RECONCILE_HOURS',
    );
    let state = await readState(kv);
    const committedAt = explicitInstant(committedPlan?.run_at);
    // Workers KV list results can lag a successful checkpoint write. Carry the
    // checkpoint promoted in this invocation so the next fetch cannot bootstrap
    // again while the append-only key propagates.
    if (
        committedPlan?.enabled === true
        && committedAt
        && (!state || Date.parse(committedAt) > Date.parse(state.completed_at))
    ) {
        state = {
            completed_at: committedAt,
            last_reconciled_at: ['bootstrap', 'reconcile'].includes(committedPlan.mode)
                ? committedAt
                : explicitInstant(committedPlan.last_reconciled_at),
        };
    }
    if (!state) {
        return {
            enabled: true,
            mode: 'bootstrap',
            run_at: normalizedRunAt,
            inserted_after: null,
            inserted_after_ms: null,
            previous_checkpoint_at: null,
            last_reconciled_at: null,
        };
    }

    const runMs = Date.parse(normalizedRunAt);
    const checkpointMs = Date.parse(state.completed_at);
    if (checkpointMs > runMs) {
        throw new Error('Folo incremental checkpoint cannot be after runAt');
    }
    const lastReconciledMs = state.last_reconciled_at
        ? Date.parse(state.last_reconciled_at)
        : checkpointMs;
    const reconcileDue = runMs - lastReconciledMs >= reconcileHours * 60 * 60 * 1000;
    if (reconcileDue) {
        // Reconciliation must scan deeper pages, but it must not turn back into
        // a rolling full-window import. Re-read everything inserted since the
        // last successful deep scan (plus overlap) so missed pagination is
        // recovered without re-emitting days of historical inventory.
        const insertedAfterMs = Math.max(
            0,
            lastReconciledMs - overlapMinutes * 60 * 1000,
        );
        return {
            enabled: true,
            mode: 'reconcile',
            run_at: normalizedRunAt,
            inserted_after: new Date(insertedAfterMs).toISOString(),
            inserted_after_ms: insertedAfterMs,
            previous_checkpoint_at: state.completed_at,
            last_reconciled_at: state.last_reconciled_at,
        };
    }

    const insertedAfterMs = Math.max(0, checkpointMs - overlapMinutes * 60 * 1000);
    return {
        enabled: true,
        mode: 'incremental',
        run_at: normalizedRunAt,
        inserted_after: new Date(insertedAfterMs).toISOString(),
        inserted_after_ms: insertedAfterMs,
        previous_checkpoint_at: state.completed_at,
        last_reconciled_at: state.last_reconciled_at,
    };
}

export async function commitFoloIncrementalPlan(
    env,
    plan,
    {
        kv = env.DATA_KV,
    } = {},
) {
    if (!plan?.enabled) return false;
    if (
        !kv
        || typeof kv.get !== 'function'
        || typeof kv.put !== 'function'
        || typeof kv.list !== 'function'
    ) {
        throw new Error('Folo incremental mode requires DATA_KV');
    }
    const existing = await readState(kv);
    const existingMs = existing ? Date.parse(existing.completed_at) : -1;
    const runMs = Date.parse(plan.run_at);
    if (!Number.isFinite(runMs)) throw new Error('Invalid Folo incremental plan');
    if (existingMs >= runMs) return false;

    const record = JSON.stringify({
        version: 1,
        completed_at: plan.run_at,
        mode: plan.mode,
    });
    // Immutable, reverse-time keys make concurrent commits monotonic without
    // relying on a non-atomic KV get/put compare-and-set.
    await kv.put(appendOnlyKey(CHECKPOINT_PREFIX, plan.run_at), record, {
        expirationTtl: STATE_TTL_SECONDS,
    });
    if (['bootstrap', 'reconcile'].includes(plan.mode)) {
        await kv.put(appendOnlyKey(RECONCILE_PREFIX, plan.run_at), record, {
            expirationTtl: STATE_TTL_SECONDS,
        });
    }
    return true;
}

export async function stageFoloIncrementalPlan(
    env,
    plan,
    {
        commitSha,
        pullRequestNumber,
        kv = env.DATA_KV,
    } = {},
) {
    if (!plan?.enabled) return false;
    if (!kv || typeof kv.put !== 'function') {
        throw new Error('Folo incremental mode requires DATA_KV');
    }
    if (!/^[a-f0-9]{40}$/.test(String(commitSha || ''))) {
        throw new Error('Invalid pending Folo publication commit');
    }
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) {
        throw new Error('Invalid pending Folo publication pull request');
    }
    const key = `${appendOnlyKey(PENDING_PREFIX, plan.run_at)}:${commitSha}`;
    await kv.put(key, JSON.stringify({
        version: 1,
        plan,
        commit_sha: commitSha,
        pull_request_number: pullRequestNumber,
    }), { expirationTtl: STATE_TTL_SECONDS });
    return true;
}

export async function listPendingFoloIncrementalPlans(
    env,
    {
        kv = env.DATA_KV,
        limit = 16,
    } = {},
) {
    if (!kv || typeof kv.get !== 'function' || typeof kv.list !== 'function') {
        throw new Error('Folo incremental mode requires DATA_KV');
    }
    const page = await kv.list({ prefix: PENDING_PREFIX, limit });
    const pending = [];
    for (const key of page?.keys || []) {
        const raw = await kv.get(key.name);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            if (
                parsed?.plan?.enabled === true
                && explicitInstant(parsed.plan.run_at)
                && /^[a-f0-9]{40}$/.test(String(parsed.commit_sha || ''))
                && Number.isSafeInteger(parsed.pull_request_number)
                && parsed.pull_request_number > 0
            ) {
                pending.push({ key: key.name, ...parsed });
            }
        } catch {
            // Invalid intents expire naturally and can never advance the cursor.
        }
    }
    return pending;
}

export async function removePendingFoloIncrementalPlan(
    env,
    key,
    {
        kv = env.DATA_KV,
    } = {},
) {
    if (!String(key || '').startsWith(PENDING_PREFIX) || typeof kv?.delete !== 'function') {
        return false;
    }
    await kv.delete(key);
    return true;
}

function foloCheckNewUrl(env, scope, insertedAfter) {
    const url = new URL(getFoloDataApi(env));
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/check-new`;
    url.search = '';
    url.searchParams.set('insertedAfter', String(insertedAfter));
    if (scope?.kind === 'feed') {
        const feedId = String(env[scope.idEnv] || '').trim();
        if (feedId) url.searchParams.set('feedId', feedId);
    }
    return url.toString();
}

export async function checkFoloNewEntries(
    env,
    foloCookie,
    scope,
    plan,
    {
        signal,
        fetchImpl = fetch,
        capabilityCache = new Map(),
    } = {},
) {
    if (plan?.mode !== 'incremental' || !Number.isSafeInteger(plan.inserted_after_ms)) {
        return null;
    }
    if (!foloCookie) return null;
    try {
        const headers = {
            accept: 'application/json',
            origin: 'https://app.folo.is',
            'x-app-name': 'Folo Web',
            'x-app-version': '0.4.9',
            Cookie: foloCookie,
        };
        const request = async (insertedAfter, requestScope = scope) => {
            const response = await fetchImpl(
                foloCheckNewUrl(env, requestScope, insertedAfter),
                { method: 'GET', headers, signal },
            );
            if (!response.ok) return null;
            const payload = await response.json();
            return typeof payload?.data?.has_new === 'boolean'
                ? payload.data.has_new
                : null;
        };
        // Some unauthenticated or incompatible Folo sessions answer `false`
        // for every check-new request. Prove the probe can see historical
        // entries before allowing a negative result to skip the full fetch.
        if (!capabilityCache.has('baseline')) {
            capabilityCache.set('baseline', request(0, { kind: 'global' }));
        }
        if (await capabilityCache.get('baseline') !== true) return null;
        return await request(plan.inserted_after_ms);
    } catch {
        // This endpoint is an optimization only. Fail open to the normal scan
        // so an API change or transient probe failure can never hide content.
        return null;
    }
}

export function filterFoloIncrementalItems(items, plan) {
    if (
        !['incremental', 'reconcile'].includes(plan?.mode)
        || !Number.isSafeInteger(plan.inserted_after_ms)
    ) {
        return {
            items,
            scannedCount: items.length,
            missingInsertedAtCount: 0,
        };
    }
    let missingInsertedAtCount = 0;
    const filtered = items.filter(item => {
        const insertedMs = Date.parse(item?.folo_inserted_at);
        if (!Number.isFinite(insertedMs)) {
            missingInsertedAtCount += 1;
            return true;
        }
        return insertedMs >= plan.inserted_after_ms;
    });
    return {
        items: filtered,
        scannedCount: items.length,
        missingInsertedAtCount,
    };
}

export function publicFoloIncrementalEvidence(plan, metrics = {}) {
    return {
        enabled: Boolean(plan?.enabled),
        mode: plan?.mode || 'disabled',
        previous_checkpoint_at: plan?.previous_checkpoint_at || null,
        inserted_after: plan?.inserted_after || null,
        run_at: plan?.run_at || null,
        skipped_provider_count: Number(metrics.skippedProviderCount || 0),
        scanned_count: Number(metrics.scannedCount || 0),
        emitted_count: Number(metrics.emittedCount || 0),
        missing_inserted_at_count: Number(metrics.missingInsertedAtCount || 0),
    };
}
