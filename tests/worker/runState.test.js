import { describe, expect, it, vi } from 'vitest';
import {
    acquireAdvisoryLease,
    releaseAdvisoryLease,
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
});
