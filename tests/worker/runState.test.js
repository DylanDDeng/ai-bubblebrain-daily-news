import { describe, expect, it, vi } from 'vitest';
import {
    acquireAdvisoryLease,
    failureMarkerKey,
    listMirrorBacklogEntries,
    readMirrorBacklogEntry,
    readScheduledOutcome,
    removeMirrorBacklogEntry,
    releaseAdvisoryLease,
    scheduledOutcomeKey,
    scheduledSlotInstant,
    storeFailureMarker,
    storeMirrorBacklogEntry,
    storeScheduledOutcome,
    storeTriggerMarker,
    triggerMarkerKey,
} from '../../src/daily/runState.js';

function fakeKv() {
    const values = new Map();
    return {
        values,
        get: vi.fn(async key => values.get(key) ?? null),
        put: vi.fn(async (key, value) => { values.set(key, value); }),
        delete: vi.fn(async key => { values.delete(key); }),
    };
}

describe('structured advisory run state', () => {
    it('releases a lease only when the observed owner still matches', async () => {
        const kv = fakeKv();
        const lease = await acquireAdvisoryLease(kv, {
            reportDate: '2026-07-14',
            batch: 'morning',
            now: '2026-07-14T02:00:00Z',
        });
        expect(lease.acquired).toBe(true);
        kv.values.set(lease.key, JSON.stringify({ owner: 'replacement' }));
        expect(await releaseAdvisoryLease(kv, lease)).toBe(false);
        expect(kv.delete).not.toHaveBeenCalled();
    });

    it('hashes trigger identities and stores markers with a fourteen-day TTL', async () => {
        const kv = fakeKv();
        const key = await triggerMarkerKey('scheduled:123');
        expect(key).toMatch(/^structured:trigger:[a-f0-9]{64}$/);
        expect(key).not.toContain('scheduled:123');
        await storeTriggerMarker(kv, 'scheduled:123', { commit_sha: 'abc' });
        expect(kv.put.mock.calls[0][2]).toEqual({ expirationTtl: 14 * 24 * 60 * 60 });
    });

    it('keeps failure records in a namespace separate from success markers', async () => {
        const kv = fakeKv();
        const triggerId = 'scheduled:123';
        const successKey = await triggerMarkerKey(triggerId);
        const failureKey = await failureMarkerKey(triggerId);

        expect(failureKey).toMatch(/^structured:attempt-failure:[a-f0-9]{64}$/);
        expect(failureKey).not.toBe(successKey);

        await storeTriggerMarker(kv, triggerId, { success: true, commit_sha: 'abc' });
        const successBytes = kv.values.get(successKey);
        await storeFailureMarker(kv, triggerId, { success: false });

        expect(kv.values.get(successKey)).toBe(successBytes);
        expect(kv.values.get(failureKey)).toBe(JSON.stringify({ success: false }));
    });

    it('normalizes cron jitter to a stable minute slot and stores terminal outcomes', async () => {
        const kv = fakeKv();
        const runAt = '2026-07-20T19:00:45.000Z';

        expect(scheduledSlotInstant(runAt)).toBe('2026-07-20T19:00:00.000Z');
        expect(scheduledOutcomeKey(runAt)).toBe(
            'scheduled:outcome:2026-07-20T19:00:00.000Z',
        );
        await storeScheduledOutcome(kv, runAt, {
            status: 'failed',
            run_at: runAt,
            error_type: 'scheduled_workflow_failed',
        });

        await expect(readScheduledOutcome(kv, '2026-07-20T19:00:00.000Z')).resolves.toEqual({
            scheduled_at: '2026-07-20T19:00:00.000Z',
            status: 'failed',
            run_at: runAt,
            error_type: 'scheduled_workflow_failed',
        });
        expect(kv.put.mock.calls[0][2]).toEqual({ expirationTtl: 14 * 24 * 60 * 60 });
    });

    it('indexes failed scheduled mirrors for the full marker lifetime', async () => {
        const kv = fakeKv();
        kv.list = vi.fn(async () => ({
            keys: [...kv.values.keys()].map(name => ({ name })),
            list_complete: true,
        }));
        const first = 'scheduled:1783994400000';
        const second = 'scheduled:1784001600000';

        await expect(storeMirrorBacklogEntry(
            kv,
            second,
            { database_mirror: { status: 'failed' } },
        )).resolves.toBe(true);
        await expect(storeMirrorBacklogEntry(kv, first)).resolves.toBe(true);
        expect(kv.put.mock.calls[0][2]).toEqual({
            expirationTtl: 14 * 24 * 60 * 60,
        });
        await expect(listMirrorBacklogEntries(kv)).resolves.toEqual([first, second]);
        await expect(readMirrorBacklogEntry(kv, second)).resolves.toEqual({
            run_id: second,
            marker: { database_mirror: { status: 'failed' } },
        });
        await expect(removeMirrorBacklogEntry(kv, first)).resolves.toBe(true);
        await expect(listMirrorBacklogEntries(kv)).resolves.toEqual([second]);
        await expect(storeMirrorBacklogEntry(kv, 'manual:invalid')).resolves.toBe(false);
    });
});
