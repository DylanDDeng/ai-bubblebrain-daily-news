import { describe, expect, it, vi } from 'vitest';
import { runIncrementalDailyWorkflow } from '../../src/handlers/incrementalDailyWorkflow.js';

const baseEnv = {
    EXTERNAL_WRITES_ENABLED: 'true',
    DAILY_PUBLISH_MODE: 'legacy',
    DAILY_STRUCTURED_WRITES_ENABLED: 'false',
    DAILY_STRUCTURED_START_DATE: '2026-07-01',
    DAILY_PRODUCER_VERSION: 'test',
};

const options = {
    date: '2026-07-14',
    batch: 'morning',
    runAt: '2026-07-14T02:00:00Z',
};

describe('daily publication mode resolver', () => {
    it('fails closed when external writes or mode are not explicit', async () => {
        const runLegacy = vi.fn();
        await expect(runIncrementalDailyWorkflow({ ...baseEnv, EXTERNAL_WRITES_ENABLED: 'false' }, options, { runLegacy }))
            .rejects.toThrow('External writes are disabled');
        for (const mode of [undefined, '', 'unknown']) {
            await expect(runIncrementalDailyWorkflow({ ...baseEnv, DAILY_PUBLISH_MODE: mode }, options, { runLegacy }))
                .rejects.toThrow('DAILY_PUBLISH_MODE');
        }
        expect(runLegacy).not.toHaveBeenCalled();
    });

    it('keeps legacy mode on the legacy workflow only', async () => {
        const runLegacy = vi.fn(async () => ({ success: true, marker: 'legacy' }));
        const runStructured = vi.fn();

        const result = await runIncrementalDailyWorkflow(baseEnv, options, { runLegacy, runStructured });

        expect(result).toEqual({ success: true, marker: 'legacy' });
        expect(runLegacy).toHaveBeenCalledWith(baseEnv, options);
        expect(runStructured).not.toHaveBeenCalled();
    });

    it('requires both structured mode and the structured write switch', async () => {
        const runStructured = vi.fn(async () => ({ success: true, mode: 'structured' }));
        await expect(runIncrementalDailyWorkflow({
            ...baseEnv,
            DAILY_PUBLISH_MODE: 'structured',
        }, options, { runStructured })).rejects.toThrow('Structured writes are disabled');

        const env = {
            ...baseEnv,
            DAILY_PUBLISH_MODE: 'structured',
            DAILY_STRUCTURED_WRITES_ENABLED: 'true',
        };
        const result = await runIncrementalDailyWorkflow(env, options, { runStructured });
        expect(result.mode).toBe('structured');
        expect(runStructured).toHaveBeenCalledWith(env, {
            reportDate: '2026-07-14',
            batch: 'morning',
            triggerId: null,
            runAt: options.runAt,
        });
    });

    it('derives a scheduled target from runAt rather than delayed wall-clock execution', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T07:30:00Z'));
        try {
            const runStructured = vi.fn(async (_env, target) => ({ success: true, target }));
            const structuredEnv = {
                ...baseEnv,
                DAILY_PUBLISH_MODE: 'structured',
                DAILY_STRUCTURED_WRITES_ENABLED: 'true',
            };
            const result = await runIncrementalDailyWorkflow(structuredEnv, {
                triggerId: 'scheduled:1784016000000',
                runAt: '2026-07-14T02:00:00.000Z',
            }, { runStructured });
            expect(result.target).toEqual({
                reportDate: '2026-07-14',
                batch: 'morning',
                triggerId: 'scheduled:1784016000000',
                runAt: '2026-07-14T02:00:00.000Z',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('fetches once in shadow mode, runs legacy fully, then runs isolated shadow', async () => {
        const events = [];
        const grouped = { news: [{ id: 1 }], project: [], paper: [], socialMedia: [] };
        const structuredItems = [{ id: 1, provider: 'aibase' }];
        const fetchStructured = vi.fn(async () => {
            events.push('fetch');
            return { grouped, structuredItems, errors: [] };
        });
        const runLegacy = vi.fn(async (_env, received) => {
            events.push('legacy');
            expect(received.fetchedOverride).toBe(grouped);
            return { success: true };
        });
        const runShadow = vi.fn(async (_env, received) => {
            events.push('shadow');
            expect(received.rawItems).toBe(structuredItems);
            return { status: 'passed' };
        });
        const env = { ...baseEnv, DAILY_PUBLISH_MODE: 'shadow' };

        const result = await runIncrementalDailyWorkflow(env, options, {
            getFoloCookie: vi.fn(async () => 'cookie'),
            fetchStructured,
            runLegacy,
            runShadow,
        });

        expect(events).toEqual(['fetch', 'legacy', 'shadow']);
        expect(fetchStructured).toHaveBeenCalledOnce();
        expect(result).toEqual({ success: true, mode: 'shadow', shadow: { status: 'passed' } });
    });

    it('never starts shadow after legacy failure and never turns shadow failure into legacy failure', async () => {
        const env = { ...baseEnv, DAILY_PUBLISH_MODE: 'shadow' };
        const fetched = { grouped: {}, structuredItems: [], errors: [] };
        const common = {
            getFoloCookie: vi.fn(async () => 'cookie'),
            fetchStructured: vi.fn(async () => fetched),
        };
        const runShadow = vi.fn();
        await expect(runIncrementalDailyWorkflow(env, options, {
            ...common,
            runLegacy: vi.fn(async () => { throw new Error('legacy failed'); }),
            runShadow,
        })).rejects.toThrow('legacy failed');
        expect(runShadow).not.toHaveBeenCalled();

        const result = await runIncrementalDailyWorkflow(env, options, {
            ...common,
            runLegacy: vi.fn(async () => ({ success: true })),
            runShadow: vi.fn(async () => { throw new RangeError('shadow failed'); }),
        });
        expect(result.success).toBe(true);
        expect(result.shadow).toEqual({ status: 'failed', error_type: 'RangeError' });
    });

    it('keeps legacy successful when shadow configuration or a provider is invalid', async () => {
        const runLegacy = vi.fn(async () => ({ success: true }));
        const runShadow = vi.fn();
        const common = {
            getFoloCookie: vi.fn(async () => 'cookie'),
            runLegacy,
            runShadow,
        };
        const missingDate = await runIncrementalDailyWorkflow({
            ...baseEnv,
            DAILY_PUBLISH_MODE: 'shadow',
            DAILY_STRUCTURED_START_DATE: undefined,
        }, options, {
            ...common,
            fetchStructured: vi.fn(async () => ({ grouped: {}, structuredItems: [], errors: [] })),
        });
        expect(missingDate.success).toBe(true);
        expect(missingDate.shadow.status).toBe('failed');

        const providerError = { provider: 'broken', content_type: 'news', error_type: 'TypeError' };
        const partial = await runIncrementalDailyWorkflow({
            ...baseEnv,
            DAILY_PUBLISH_MODE: 'shadow',
        }, options, {
            ...common,
            fetchStructured: vi.fn(async () => ({
                grouped: { news: [] },
                structuredItems: [],
                errors: [providerError],
            })),
        });
        expect(partial.success).toBe(true);
        expect(partial.shadow).toEqual({
            status: 'failed',
            error_type: 'StructuredShadowSourceError',
            source_errors: [providerError],
        });
        expect(runLegacy).toHaveBeenCalledTimes(2);
        expect(runShadow).not.toHaveBeenCalled();
    });
});
