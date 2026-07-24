import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    chunkScheduledRuns,
    dueScheduledRuns,
    resolveScheduledRun,
    SCHEDULE_UTC_HOURS,
    scheduledRunsForReportDate,
} from '../../src/daily/scheduleContract.js';

describe('production schedule contract', () => {
    it('defines all sixteen production UTC hours once', () => {
        expect(SCHEDULE_UTC_HOURS).toEqual([
            0, 2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23,
        ]);
        expect(new Set(SCHEDULE_UTC_HOURS).size).toBe(16);
    });

    it('keeps wrangler cron hours exactly aligned with the shared contract', async () => {
        const config = await readFile(
            new URL('../../wrangler.toml', import.meta.url),
            'utf8',
        );
        const cron = config.match(/crons\s*=\s*\["0 ([0-9,]+) \* \* \*"\]/)?.[1];
        expect(cron).toBe(SCHEDULE_UTC_HOURS.join(','));
    });

    it('maps every run for one Beijing report date to its cumulative batch', () => {
        const runs = scheduledRunsForReportDate('2026-07-24');

        expect(runs).toHaveLength(16);
        expect(runs.map(run => [run.scheduled_at, run.batch_id])).toEqual([
            ['2026-07-23T16:00:00.000Z', 'night'],
            ['2026-07-23T17:00:00.000Z', 'night'],
            ['2026-07-23T21:00:00.000Z', 'morning'],
            ['2026-07-23T22:00:00.000Z', 'morning'],
            ['2026-07-23T23:00:00.000Z', 'morning'],
            ['2026-07-24T00:00:00.000Z', 'morning'],
            ['2026-07-24T02:00:00.000Z', 'morning'],
            ['2026-07-24T04:00:00.000Z', 'morning'],
            ['2026-07-24T06:00:00.000Z', 'afternoon'],
            ['2026-07-24T08:00:00.000Z', 'afternoon'],
            ['2026-07-24T10:00:00.000Z', 'afternoon'],
            ['2026-07-24T12:00:00.000Z', 'afternoon'],
            ['2026-07-24T14:00:00.000Z', 'night'],
            ['2026-07-24T18:00:00.000Z', 'lateNight'],
            ['2026-07-24T19:00:00.000Z', 'lateNight'],
            ['2026-07-24T20:00:00.000Z', 'lateNight'],
        ]);
        expect(runs[14]).toMatchObject({
            publication_batch_id: 'lateNightSupplement',
            report_date: '2026-07-24',
            run_id: `scheduled:${Date.parse('2026-07-24T19:00:00.000Z')}`,
        });
    });

    it('normalizes cron jitter but rejects an hour outside production', () => {
        expect(resolveScheduledRun('2026-07-24T10:00:42.000Z')).toMatchObject({
            batch_id: 'afternoon',
            scheduled_at: '2026-07-24T10:00:00.000Z',
        });
        expect(() => resolveScheduledRun('2026-07-24T11:00:00.000Z')).toThrow(
            /not in the production schedule/,
        );
    });

    it('covers a thirty-hour lookback in pages of at most sixteen runs', () => {
        const due = dueScheduledRuns(
            Date.parse('2026-07-24T20:15:00.000Z'),
            30,
        );
        const pages = chunkScheduledRuns(due);

        expect(due.length).toBeGreaterThan(16);
        expect(pages.flat()).toEqual(due);
        expect(pages.every(page => page.length <= 16)).toBe(true);
    });
});
