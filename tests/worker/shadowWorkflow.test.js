import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { runStructuredShadow } from '../../src/daily/shadowWorkflow.js';

function memoryKv(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        values,
        readKv: vi.fn(async (_kv, key) => values.get(key) ?? null),
        writeKv: vi.fn(async (_kv, key, value) => { values.set(key, value); }),
    };
}

const input = {
    reportDate: '2026-07-14',
    batch: 'morning',
    runAt: '2026-07-14T02:00:00Z',
    rawItems: [{ id: 1, provider: 'aibase' }],
    structuredStartDate: '2026-07-12',
    producer: { version: 'test', commitSha: null },
};

describe('structured shadow state', () => {
    it('loads current and seven-day history state and persists the complete report', async () => {
        const current = { date: '2026-07-14' };
        const day13 = { date: '2026-07-13' };
        const day12 = { date: '2026-07-12' };
        const kv = memoryKv({
            'structured:shadow:report:2026-07-14': current,
            'structured:shadow:report:2026-07-13': day13,
            'structured:shadow:report:2026-07-12': day12,
        });
        const report = { date: '2026-07-14', batches: [], items: [] };
        const build = vi.fn(async args => {
            expect(args.existingReport).toBe(current);
            expect(args.recentReports).toEqual([day13, day12]);
            return { report, noOp: false, metrics: { raw_count: 1 } };
        });

        const result = await runStructuredShadow({ DATA_KV: {} }, input, {
            build,
            readKv: kv.readKv,
            writeKv: kv.writeKv,
        });

        expect(result).toEqual({ status: 'passed', noOp: false, metrics: { raw_count: 1 } });
        expect(kv.values.get('structured:shadow:report:2026-07-14')).toBe(report);
        expect(kv.writeKv.mock.calls[0][3]).toBe(14 * 24 * 60 * 60);
    });

    it('treats report persistence as required but metrics persistence as best effort', async () => {
        const build = vi.fn(async () => ({ report: { date: '2026-07-14' }, noOp: true, metrics: {} }));
        const readKv = vi.fn(async () => null);
        const metricsFail = vi.fn(async (_kv, key) => {
            if (key.includes(':metrics:')) throw new Error('metrics unavailable');
        });
        await expect(runStructuredShadow({ DATA_KV: {} }, input, {
            build,
            readKv,
            writeKv: metricsFail,
        })).resolves.toMatchObject({ status: 'passed', noOp: true });

        const reportFail = vi.fn(async (_kv, key) => {
            if (key.includes(':report:')) throw new Error('report unavailable');
        });
        await expect(runStructuredShadow({ DATA_KV: {} }, input, {
            build,
            readKv,
            writeKv: reportFail,
        })).rejects.toThrow('report unavailable');
    });

    it('has no Git publisher dependency', async () => {
        const source = await readFile(new URL('../../src/daily/shadowWorkflow.js', import.meta.url), 'utf8');
        expect(source).not.toMatch(/gitAtomic|github\.js|commitFilesAtomically/);
    });
});
