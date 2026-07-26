import { describe, expect, it, vi } from 'vitest';
import {
    checkFoloNewEntries,
    commitFoloIncrementalPlan,
    filterFoloIncrementalItems,
    listPendingFoloIncrementalPlans,
    removePendingFoloIncrementalPlan,
    resolveFoloIncrementalPlan,
    stageFoloIncrementalPlan,
} from '../../src/daily/foloIncremental.js';

function memoryKv(initial = null) {
    let value = initial ? JSON.stringify(initial) : null;
    const entries = new Map();
    return {
        get: vi.fn(async key => key === 'daily:folo-incremental:v1' ? value : entries.get(key) || null),
        put: vi.fn(async (key, next) => {
            if (key === 'daily:folo-incremental:v1') value = next;
            else entries.set(key, next);
        }),
        delete: vi.fn(async key => entries.delete(key)),
        list: vi.fn(async ({ prefix, limit }) => ({
            keys: [...entries.keys()]
                .filter(key => key.startsWith(prefix))
                .sort()
                .slice(0, limit)
                .map(name => ({ name })),
            list_complete: true,
        })),
        value: () => value ? JSON.parse(value) : null,
    };
}

const enabledEnv = {
    FOLO_INCREMENTAL_ENABLED: 'true',
    FOLO_INCREMENTAL_OVERLAP_MINUTES: '10',
    FOLO_INCREMENTAL_RECONCILE_HOURS: '6',
};

describe('Folo incremental state', () => {
    it('bootstraps once, then advances a successful high-water mark with overlap', async () => {
        const kv = memoryKv();
        const bootstrap = await resolveFoloIncrementalPlan(
            { ...enabledEnv, DATA_KV: kv },
            { runAt: '2026-07-25T00:00:00Z' },
        );
        expect(bootstrap).toMatchObject({
            enabled: true,
            mode: 'bootstrap',
            inserted_after: null,
        });

        await commitFoloIncrementalPlan({ ...enabledEnv, DATA_KV: kv }, bootstrap);
        const incremental = await resolveFoloIncrementalPlan(
            { ...enabledEnv, DATA_KV: kv },
            { runAt: '2026-07-25T01:00:00Z' },
        );
        expect(incremental).toMatchObject({
            mode: 'incremental',
            previous_checkpoint_at: '2026-07-25T00:00:00.000Z',
            inserted_after: '2026-07-24T23:50:00.000Z',
        });
    });

    it('uses a just-promoted checkpoint while its append-only KV listing is stale', async () => {
        const kv = memoryKv();
        const incremental = await resolveFoloIncrementalPlan(
            { ...enabledEnv, DATA_KV: kv },
            {
                runAt: '2026-07-25T01:00:00Z',
                committedPlan: {
                    enabled: true,
                    mode: 'bootstrap',
                    run_at: '2026-07-25T00:00:00.000Z',
                },
            },
        );

        expect(incremental).toMatchObject({
            mode: 'incremental',
            previous_checkpoint_at: '2026-07-25T00:00:00.000Z',
            last_reconciled_at: '2026-07-25T00:00:00.000Z',
            inserted_after: '2026-07-24T23:50:00.000Z',
        });
        expect(kv.list).toHaveBeenCalled();
    });

    it('forces a periodic full reconciliation and never moves the cursor backwards', async () => {
        const kv = memoryKv({
            version: 1,
            completed_at: '2026-07-25T00:00:00.000Z',
            last_reconciled_at: '2026-07-25T00:00:00.000Z',
        });
        const env = { ...enabledEnv, DATA_KV: kv };
        const reconcile = await resolveFoloIncrementalPlan(env, {
            runAt: '2026-07-25T06:00:00Z',
        });
        expect(reconcile).toMatchObject({
            mode: 'reconcile',
            inserted_after: '2026-07-24T23:50:00.000Z',
            inserted_after_ms: Date.parse('2026-07-24T23:50:00.000Z'),
        });
        await commitFoloIncrementalPlan(env, reconcile);
        await expect(resolveFoloIncrementalPlan(env, {
            runAt: '2026-07-25T07:00:00Z',
        })).resolves.toMatchObject({
            previous_checkpoint_at: '2026-07-25T06:00:00.000Z',
            last_reconciled_at: '2026-07-25T06:00:00.000Z',
        });

        await expect(commitFoloIncrementalPlan(env, {
            ...reconcile,
            run_at: '2026-07-25T05:00:00.000Z',
        })).resolves.toBe(false);
        await expect(resolveFoloIncrementalPlan(env, {
            runAt: '2026-07-25T07:00:00Z',
        })).resolves.toMatchObject({
            previous_checkpoint_at: '2026-07-25T06:00:00.000Z',
        });
    });

    it('keeps the newest checkpoint when concurrent commits finish out of order', async () => {
        const kv = memoryKv({
            version: 1,
            completed_at: '2026-07-25T00:00:00.000Z',
            last_reconciled_at: '2026-07-25T00:00:00.000Z',
        });
        const env = { ...enabledEnv, DATA_KV: kv };
        const earlier = {
            enabled: true,
            mode: 'incremental',
            run_at: '2026-07-25T01:00:00.000Z',
        };
        const later = {
            enabled: true,
            mode: 'incremental',
            run_at: '2026-07-25T02:00:00.000Z',
        };

        await Promise.all([
            commitFoloIncrementalPlan(env, later),
            commitFoloIncrementalPlan(env, earlier),
        ]);

        await expect(resolveFoloIncrementalPlan(env, {
            runAt: '2026-07-25T03:00:00Z',
        })).resolves.toMatchObject({
            previous_checkpoint_at: '2026-07-25T02:00:00.000Z',
        });
    });

    it('filters by Folo insertion time while failing open for missing metadata', () => {
        const plan = {
            mode: 'incremental',
            inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
        };
        const result = filterFoloIncrementalItems([
            { id: 'old', folo_inserted_at: '2026-07-25T00:40:00Z' },
            { id: 'new', folo_inserted_at: '2026-07-25T00:55:00Z' },
            { id: 'unknown' },
        ], plan);
        expect(result.items.map(item => item.id)).toEqual(['new', 'unknown']);
        expect(result).toMatchObject({
            scannedCount: 3,
            missingInsertedAtCount: 1,
        });
    });

    it('keeps reconciliation deep scans inside the insertion-time window', () => {
        const plan = {
            mode: 'reconcile',
            inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
        };
        const result = filterFoloIncrementalItems([
            { id: 'historical', folo_inserted_at: '2026-07-20T00:00:00Z' },
            { id: 'missed-recent', folo_inserted_at: '2026-07-25T00:55:00Z' },
        ], plan);

        expect(result.items.map(item => item.id)).toEqual(['missed-recent']);
        expect(result).toMatchObject({
            scannedCount: 2,
            missingInsertedAtCount: 0,
        });
    });

    it('stages a pending publication checkpoint until its pull request is confirmed', async () => {
        const kv = memoryKv();
        const env = { ...enabledEnv, DATA_KV: kv };
        const plan = {
            enabled: true,
            mode: 'bootstrap',
            run_at: '2026-07-25T00:00:00.000Z',
            inserted_after: null,
            inserted_after_ms: null,
            previous_checkpoint_at: null,
        };

        await stageFoloIncrementalPlan(env, plan, {
            commitSha: 'a'.repeat(40),
            pullRequestNumber: 200,
        });
        const [pending] = await listPendingFoloIncrementalPlans(env);

        expect(pending).toMatchObject({
            plan,
            commit_sha: 'a'.repeat(40),
            pull_request_number: 200,
        });
        await expect(removePendingFoloIncrementalPlan(env, pending.key)).resolves.toBe(true);
        await expect(listPendingFoloIncrementalPlans(env)).resolves.toEqual([]);
    });

    it('uses the official check-new endpoint and fails open on probe errors', async () => {
        const plan = {
            mode: 'incremental',
            inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
        };
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { has_new: true } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { has_new: false } }),
            });
        const hasNew = await checkFoloNewEntries(
            {
                FOLO_DATA_API: 'https://api.folo.is/entries',
                AIBASE_FEED_ID: 'feed-1',
            },
            'session=cookie',
            { kind: 'feed', idEnv: 'AIBASE_FEED_ID' },
            plan,
            { fetchImpl },
        );
        expect(hasNew).toBe(false);
        const url = new URL(fetchImpl.mock.calls[1][0]);
        expect(url.pathname).toBe('/entries/check-new');
        expect(url.searchParams.get('feedId')).toBe('feed-1');
        expect(url.searchParams.get('insertedAfter')).toBe(String(plan.inserted_after_ms));

        await expect(checkFoloNewEntries(
            { FOLO_DATA_API: 'https://api.folo.is/entries' },
            'session=cookie',
            { kind: 'global' },
            plan,
            { fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) },
        )).resolves.toBeNull();
    });
});
