import { describe, expect, it, vi } from 'vitest';
import {
    runIncrementalDailyWorkflow,
    runLegacyIncrementalDailyWorkflow,
} from '../../src/handlers/incrementalDailyWorkflow.js';

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

    it('uses the explicit recovery epoch for shadow canary history', async () => {
        const runShadow = vi.fn(async () => ({ status: 'passed' }));
        const env = {
            ...baseEnv,
            DAILY_PUBLISH_MODE: 'shadow',
            DAILY_STRUCTURED_RESUME_DATE: '2026-07-14',
        };

        const result = await runIncrementalDailyWorkflow(env, options, {
            getFoloCookie: vi.fn(async () => 'cookie'),
            fetchStructured: vi.fn(async () => ({
                grouped: {},
                structuredItems: [],
                errors: [],
            })),
            runLegacy: vi.fn(async () => ({ success: true })),
            runShadow,
        });

        expect(result.shadow).toEqual({ status: 'passed' });
        expect(runShadow).toHaveBeenCalledWith(env, expect.objectContaining({
            reportDate: '2026-07-14',
            structuredStartDate: '2026-07-14',
        }));
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

    it('suppresses a repeated legacy trigger while its publication pull request is open', async () => {
        const marker = {
            success: true,
            mode: 'legacy',
            reportDate: '2026-07-14',
            batch: 'morning',
            commit_sha: 'e'.repeat(40),
            pending: true,
            publication_status: 'pending',
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
        };
        const dependencies = {
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'open', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
            resolveSnapshot: vi.fn(),
        };

        const result = await runLegacyIncrementalDailyWorkflow({ DATA_KV: {} }, {
            ...options,
            triggerId: 'scheduled:1',
        }, dependencies);

        expect(result).toEqual({ ...marker, idempotent: true });
        expect(dependencies.resolveSnapshot).not.toHaveBeenCalled();
    });

    it('confirms a merged legacy candidate through main ancestry before suppressing replay', async () => {
        const marker = {
            success: true,
            mode: 'legacy',
            reportDate: '2026-07-14',
            batch: 'morning',
            commit_sha: 'e'.repeat(40),
            pending: true,
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
        };
        const dependencies = {
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') {
                    return { state: 'closed', merged_at: '2026-07-14T02:01:00Z' };
                }
                throw new Error(`unexpected ${path}`);
            }),
            resolveBaseSnapshot: vi.fn(async () => ({
                branch: 'main',
                headSha: 'f'.repeat(40),
                treeSha: 'a'.repeat(40),
            })),
            commitIncluded: vi.fn(async () => true),
        };

        const result = await runLegacyIncrementalDailyWorkflow({ DATA_KV: {} }, {
            ...options,
            triggerId: 'scheduled:1',
        }, dependencies);

        expect(result).toMatchObject({
            pending: false,
            publication_status: 'published',
            idempotent: true,
        });
        expect(dependencies.commitIncluded).toHaveBeenCalledOnce();
    });

    it('confirms a superseded closed legacy candidate through main ancestry', async () => {
        const marker = {
            success: true,
            mode: 'legacy',
            reportDate: '2026-07-14',
            batch: 'morning',
            commit_sha: 'e'.repeat(40),
            pending: true,
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
        };
        const dependencies = {
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async () => ({ state: 'closed', merged_at: null })),
            resolveAlias: vi.fn(async () => null),
            resolveBaseSnapshot: vi.fn(async () => ({
                branch: 'main',
                headSha: 'f'.repeat(40),
                treeSha: 'a'.repeat(40),
            })),
            commitIncluded: vi.fn(async () => true),
        };

        const result = await runLegacyIncrementalDailyWorkflow({ DATA_KV: {} }, {
            ...options,
            triggerId: 'scheduled:1',
        }, dependencies);

        expect(result).toMatchObject({ pending: false, idempotent: true });
        expect(dependencies.resolveBaseSnapshot).toHaveBeenCalledOnce();
    });

    it('follows a replay alias instead of regenerating an old legacy trigger', async () => {
        const marker = {
            success: true,
            mode: 'legacy',
            reportDate: '2026-07-14',
            batch: 'morning',
            commit_sha: 'e'.repeat(40),
            pending: true,
            pull_request: { number: 42, url: 'old' },
        };
        const dependencies = {
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'closed', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
            resolveAlias: vi.fn(async () => ({
                commitSha: 'f'.repeat(40),
                pull: { number: 43, url: 'new', state: 'open', mergedAt: null },
            })),
            resolveSnapshot: vi.fn(),
        };

        const result = await runLegacyIncrementalDailyWorkflow({ DATA_KV: {} }, {
            ...options,
            triggerId: 'scheduled:1',
        }, dependencies);

        expect(result).toMatchObject({
            commit_sha: 'f'.repeat(40),
            pending: true,
            idempotent: true,
            pull_request: { number: 43, url: 'new' },
        });
        expect(dependencies.resolveSnapshot).not.toHaveBeenCalled();
    });
});
