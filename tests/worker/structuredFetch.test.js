import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_FETCH_TIMEOUT_MS,
    DEFAULT_RETRY_BUDGET,
    fetchProviderPreservingData,
} from '../../src/daily/structuredFetch.js';
import { classifyProviderFailure, ProviderFetchError } from '../../src/daily/providerFailure.js';

function adapter(provider, contentType, items, calls) {
    return {
        provider,
        contentType,
        adapter: {
            fetch: vi.fn(async () => {
                calls.push(`fetch:${provider}`);
                return items;
            }),
            transform: vi.fn(raw => {
                calls.push(`transform:${provider}`);
                return raw;
            }),
        },
    };
}

describe('provider-preserving structured fetch', () => {
    it('fetches and transforms all providers exactly once in registry order', async () => {
        const calls = [];
        const types = ['news', 'news', 'news', 'news', 'news', 'project', 'paper', 'paper', 'socialMedia', 'socialMedia', 'socialMedia'];
        const adapters = types.map((type, index) => adapter(
            `provider_${index}`,
            type,
            [{ id: index, title: `item ${index}`, published_date: `2026-07-${String(index + 1).padStart(2, '0')}` }],
            calls,
        ));

        const result = await fetchProviderPreservingData({}, 'cookie', { adapters });

        expect(adapters.every(entry => entry.adapter.fetch.mock.calls.length === 1)).toBe(true);
        expect(adapters.every(entry => entry.adapter.fetch.mock.calls[0][2].strict === true)).toBe(true);
        expect(adapters.every(entry => (
            entry.adapter.fetch.mock.calls[0][2].signal instanceof AbortSignal
        ))).toBe(true);
        expect(adapters.every(entry => entry.adapter.transform.mock.calls.length === 1)).toBe(true);
        expect(adapters.every(entry => entry.adapter.transform.mock.calls[0][2].strict === true)).toBe(true);
        expect(calls).toEqual(adapters.flatMap(entry => [
            `fetch:${entry.provider}`,
            `transform:${entry.provider}`,
        ]));
        expect(result.structuredItems).toHaveLength(11);
        expect(result.errors).toEqual([]);
    });

    it('caps provider pagination without mutating the production environment', async () => {
        const seen = [];
        const env = { AIBASE_FETCH_PAGES: '3', TWITTER_FETCH_PAGES: '2', OTHER: 'kept' };
        const adapters = [{
            provider: 'source',
            contentType: 'news',
            adapter: {
                fetch: vi.fn(async providerEnv => {
                    seen.push(providerEnv.AIBASE_FETCH_PAGES, providerEnv.TWITTER_FETCH_PAGES, providerEnv.OTHER);
                    return [];
                }),
                transform: vi.fn(raw => raw),
            },
        }];

        await fetchProviderPreservingData(env, null, { adapters, fetchPageCap: 1 });

        expect(seen).toEqual(['1', '1', 'kept']);
        expect(env).toEqual({ AIBASE_FETCH_PAGES: '3', TWITTER_FETCH_PAGES: '2', OTHER: 'kept' });
    });

    it('rejects an invalid provider page cap before issuing requests', async () => {
        const calls = [];
        const source = adapter('source', 'news', [], calls);
        await expect(fetchProviderPreservingData({}, null, {
            adapters: [source],
            fetchPageCap: 0,
        })).rejects.toThrow(/page cap/);
        expect(source.adapter.fetch).not.toHaveBeenCalled();
    });

    it('skips unchanged Folo providers after an insertedAfter probe', async () => {
        const calls = [];
        const source = adapter('aibase', 'news', [{ id: 'should-not-load' }], calls);
        source.foloScope = { kind: 'feed', idEnv: 'AIBASE_FEED_ID' };
        const direct = adapter('github_trending', 'project', [{ id: 'direct' }], calls);
        const probe = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { has_new: true } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { has_new: false } }),
            });
        vi.stubGlobal('fetch', probe);
        try {
            const result = await fetchProviderPreservingData(
                {
                    FOLO_DATA_API: 'https://api.folo.is/entries',
                    AIBASE_FEED_ID: 'feed-1',
                },
                'session=cookie',
                {
                    adapters: [source, direct],
                    foloIncrementalPlan: {
                        enabled: true,
                        mode: 'incremental',
                        run_at: '2026-07-25T01:00:00.000Z',
                        inserted_after: '2026-07-25T00:50:00.000Z',
                        inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
                        previous_checkpoint_at: '2026-07-25T01:00:00.000Z',
                    },
                },
            );
            expect(source.adapter.fetch).not.toHaveBeenCalled();
            expect(direct.adapter.fetch).toHaveBeenCalledOnce();
            expect(result.grouped.news).toEqual([]);
            expect(result.grouped.project).toEqual([{ id: 'direct' }]);
            expect(result.foloIncremental).toMatchObject({
                mode: 'incremental',
                skipped_provider_count: 1,
                emitted_count: 0,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('emits only newly inserted Folo entries with a fail-open metadata fallback', async () => {
        const calls = [];
        const source = adapter('aibase', 'news', [
            { id: 'old', folo_inserted_at: '2026-07-25T00:40:00Z' },
            { id: 'new', folo_inserted_at: '2026-07-25T00:55:00Z' },
            { id: 'unknown' },
        ], calls);
        source.foloScope = { kind: 'feed', idEnv: 'AIBASE_FEED_ID' };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ data: { has_new: true } }),
        })));
        try {
            const result = await fetchProviderPreservingData(
                {
                    FOLO_DATA_API: 'https://api.folo.is/entries',
                    AIBASE_FEED_ID: 'feed-1',
                },
                'session=cookie',
                {
                    adapters: [source],
                    foloIncrementalPlan: {
                        enabled: true,
                        mode: 'incremental',
                        run_at: '2026-07-25T01:00:00.000Z',
                        inserted_after: '2026-07-25T00:50:00.000Z',
                        inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
                        previous_checkpoint_at: '2026-07-25T00:00:00.000Z',
                    },
                },
            );
            expect(result.grouped.news.map(item => item.id)).toEqual(['new', 'unknown']);
            expect(result.foloIncremental).toMatchObject({
                scanned_count: 3,
                emitted_count: 2,
                missing_inserted_at_count: 1,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('falls back to the full provider fetch when check-new cannot see baseline entries', async () => {
        const calls = [];
        const source = adapter('aibase', 'news', [
            { id: 'kept', folo_inserted_at: '2026-07-25T00:55:00Z' },
        ], calls);
        source.foloScope = { kind: 'feed', idEnv: 'AIBASE_FEED_ID' };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ data: { has_new: false } }),
        })));
        try {
            const result = await fetchProviderPreservingData(
                {
                    FOLO_DATA_API: 'https://api.folo.is/entries',
                    AIBASE_FEED_ID: 'feed-1',
                },
                'session=cookie',
                {
                    adapters: [source],
                    foloIncrementalPlan: {
                        enabled: true,
                        mode: 'incremental',
                        run_at: '2026-07-25T01:00:00.000Z',
                        inserted_after: '2026-07-25T00:50:00.000Z',
                        inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
                        previous_checkpoint_at: '2026-07-25T00:00:00.000Z',
                    },
                },
            );
            expect(source.adapter.fetch).toHaveBeenCalledOnce();
            expect(result.grouped.news.map(item => item.id)).toEqual(['kept']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('deepens a changed incremental provider while widening the delayed-entry horizon', async () => {
        const seen = [];
        const source = {
            provider: 'aibase',
            contentType: 'news',
            foloScope: {
                kind: 'feed',
                idEnv: 'AIBASE_FEED_ID',
                pageEnv: 'AIBASE_FETCH_PAGES',
            },
            adapter: {
                fetch: vi.fn(async providerEnv => {
                    seen.push({
                        pages: providerEnv.AIBASE_FETCH_PAGES,
                        days: providerEnv.FOLO_FILTER_DAYS,
                    });
                    return [];
                }),
                transform: vi.fn(raw => raw),
            },
        };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ data: { has_new: true } }),
        })));
        try {
            await fetchProviderPreservingData(
                {
                    FOLO_DATA_API: 'https://api.folo.is/entries',
                    AIBASE_FEED_ID: 'feed-1',
                    AIBASE_FETCH_PAGES: '1',
                    FOLO_FILTER_DAYS: '3',
                    FOLO_INCREMENTAL_LOOKBACK_DAYS: '14',
                    FOLO_INCREMENTAL_DEEP_SCAN_PAGES: '5',
                },
                'session=cookie',
                {
                    adapters: [source],
                    foloIncrementalPlan: {
                        enabled: true,
                        mode: 'incremental',
                        run_at: '2026-07-25T01:00:00.000Z',
                        inserted_after: '2026-07-25T00:50:00.000Z',
                        inserted_after_ms: Date.parse('2026-07-25T00:50:00Z'),
                        previous_checkpoint_at: '2026-07-25T00:00:00.000Z',
                    },
                },
            );
            expect(seen).toEqual([{ pages: '5', days: '14' }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses a deep periodic reconcile without overriding the late-night page cap', async () => {
        const seen = [];
        const source = {
            provider: 'aibase',
            contentType: 'news',
            foloScope: {
                kind: 'feed',
                idEnv: 'AIBASE_FEED_ID',
                pageEnv: 'AIBASE_FETCH_PAGES',
            },
            adapter: {
                fetch: vi.fn(async providerEnv => {
                    seen.push({
                        pages: providerEnv.AIBASE_FETCH_PAGES,
                        days: providerEnv.FOLO_FILTER_DAYS,
                    });
                    return [];
                }),
                transform: vi.fn(raw => raw),
            },
        };
        const plan = {
            enabled: true,
            mode: 'reconcile',
            run_at: '2026-07-25T06:00:00.000Z',
            inserted_after: null,
            inserted_after_ms: null,
            previous_checkpoint_at: '2026-07-25T05:00:00.000Z',
        };
        const providerEnv = {
            AIBASE_FEED_ID: 'feed-1',
            AIBASE_FETCH_PAGES: '1',
            FOLO_FILTER_DAYS: '3',
            FOLO_INCREMENTAL_LOOKBACK_DAYS: '14',
            FOLO_INCREMENTAL_DEEP_SCAN_PAGES: '5',
        };

        await fetchProviderPreservingData(providerEnv, 'session=cookie', {
            adapters: [source],
            foloIncrementalPlan: plan,
        });
        await fetchProviderPreservingData(providerEnv, 'session=cookie', {
            adapters: [source],
            fetchPageCap: 1,
            foloIncrementalPlan: plan,
        });

        expect(seen).toEqual([
            { pages: '5', days: '14' },
            { pages: '1', days: '14' },
        ]);
    });

    it('keeps a deep reconcile retry capped to one page', async () => {
        const seen = [];
        const source = {
            provider: 'aibase',
            contentType: 'news',
            foloScope: {
                kind: 'feed',
                idEnv: 'AIBASE_FEED_ID',
                pageEnv: 'AIBASE_FETCH_PAGES',
            },
            adapter: {
                fetch: vi.fn(async providerEnv => {
                    seen.push(providerEnv.AIBASE_FETCH_PAGES);
                    if (seen.length === 1) throw new TypeError('transient');
                    return [];
                }),
                transform: vi.fn(raw => raw),
            },
        };

        await fetchProviderPreservingData(
            {
                AIBASE_FEED_ID: 'feed-1',
                AIBASE_FETCH_PAGES: '1',
                FOLO_INCREMENTAL_DEEP_SCAN_PAGES: '5',
            },
            'session=cookie',
            {
                adapters: [source],
                retryDelayMs: 0,
                sleep: vi.fn(async () => undefined),
                foloIncrementalPlan: {
                    enabled: true,
                    mode: 'reconcile',
                    run_at: '2026-07-25T06:00:00.000Z',
                    inserted_after: null,
                    inserted_after_ms: null,
                    previous_checkpoint_at: '2026-07-25T05:00:00.000Z',
                },
            },
        );

        expect(seen).toEqual(['5', '1']);
    });

    it('preserves legacy items while projecting provider only onto structured clones', async () => {
        const calls = [];
        const old = { id: 1, title: 'old', published_date: '2026-07-13T00:00:00Z' };
        const fresh = { id: 2, title: 'fresh', published_date: '2026-07-14T00:00:00Z' };
        const adapters = [
            adapter('first', 'news', [old], calls),
            adapter('second', 'news', [fresh], calls),
        ];

        const result = await fetchProviderPreservingData({}, null, { adapters });

        expect(result.grouped).toEqual({
            news: [fresh, old],
            project: [],
            paper: [],
            socialMedia: [],
        });
        expect(result.grouped.news[0]).toBe(fresh);
        expect(old).not.toHaveProperty('provider');
        expect(fresh).not.toHaveProperty('provider');
        expect(result.structuredItems).toEqual([
            { ...fresh, provider: 'second' },
            { ...old, provider: 'first' },
        ]);
        expect(result.sourceCounts).toEqual({ news: 2, project: 0, paper: 0, socialMedia: 0 });
    });

    it('excludes configured X handles before they enter the structured report', async () => {
        const calls = [];
        const blocked = {
            id: 'blocked',
            url: 'https://x.com/GemstoneNicole/status/2079115504036552777',
            published_date: '2026-07-20T08:05:00Z',
        };
        const allowed = {
            id: 'allowed',
            url: 'https://x.com/another_account/status/2079115504036552778',
            published_date: '2026-07-20T08:04:00Z',
        };

        const result = await fetchProviderPreservingData(
            { X_BLOCKED_HANDLES: ' @EZSHINE, GemstoneNicole ' },
            null,
            { adapters: [adapter('twitter', 'socialMedia', [blocked, allowed], calls)] },
        );

        expect(result.grouped.socialMedia).toEqual([allowed]);
        expect(result.structuredItems).toEqual([{ ...allowed, provider: 'twitter' }]);
        expect(result.sourceCounts.socialMedia).toBe(1);
    });

    it('does not apply X handle exclusions to non-social content', async () => {
        const calls = [];
        const linkedNews = {
            id: 'news',
            url: 'https://x.com/ezshine/status/2079115504036552777',
            published_date: '2026-07-20T08:05:00Z',
        };

        const result = await fetchProviderPreservingData(
            { X_BLOCKED_HANDLES: 'ezshine' },
            null,
            { adapters: [adapter('newsroom', 'news', [linkedNews], calls)] },
        );

        expect(result.grouped.news).toEqual([linkedNews]);
    });

    it('isolates one provider failure and continues with later providers', async () => {
        const calls = [];
        const broken = adapter('broken', 'news', [], calls);
        broken.adapter.fetch.mockRejectedValue(new TypeError('offline'));
        const healthy = adapter('healthy', 'project', [{ id: 2, published_date: '2026-07-14' }], calls);
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [broken, healthy],
            retryDelayMs: 0,
            sleep,
        });

        expect(broken.adapter.fetch).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledOnce();
        expect(healthy.adapter.fetch).toHaveBeenCalledOnce();
        expect(result.grouped.project).toHaveLength(1);
        expect(result.errors).toEqual([{
            provider: 'broken',
            content_type: 'news',
            stage: 'fetch',
            error_type: 'network',
            attempts: 2,
        }]);
    });

    it('recovers one transient provider fetch without duplicating transformed items', async () => {
        const calls = [];
        const flaky = adapter('flaky', 'news', [{ id: 1, published_date: '2026-07-14' }], calls);
        flaky.adapter.fetch
            .mockRejectedValueOnce(new TypeError('temporary'))
            .mockResolvedValueOnce([{ id: 1, published_date: '2026-07-14' }]);
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [flaky],
            retryDelayMs: 0,
            sleep,
        });

        expect(flaky.adapter.fetch).toHaveBeenCalledTimes(2);
        expect(flaky.adapter.transform).toHaveBeenCalledOnce();
        expect(sleep).toHaveBeenCalledOnce();
        expect(result.structuredItems).toHaveLength(1);
        expect(result.errors).toEqual([]);
    });

    it('shares one bounded retry budget across all providers', async () => {
        const calls = [];
        const adapters = ['first', 'second', 'third'].map(provider => {
            const source = adapter(provider, 'news', [], calls);
            source.adapter.fetch.mockRejectedValue(new TypeError('temporary'));
            return source;
        });
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters,
            retryDelayMs: 0,
            sleep,
        });

        expect(DEFAULT_RETRY_BUDGET).toBe(2);
        expect(adapters.map(source => source.adapter.fetch.mock.calls.length)).toEqual([2, 2, 1]);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(result.errors.map(error => error.attempts)).toEqual([2, 2, 1]);
    });

    it('does not retry after an explicitly disabled retry budget', async () => {
        const calls = [];
        const broken = adapter('broken', 'news', [], calls);
        broken.adapter.fetch.mockRejectedValue(new TypeError('temporary'));
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [broken],
            retryBudget: 0,
            retryDelayMs: 0,
            sleep,
        });

        expect(broken.adapter.fetch).toHaveBeenCalledOnce();
        expect(sleep).not.toHaveBeenCalled();
        expect(result.errors[0].attempts).toBe(1);
    });

    it('limits retry pagination to one page without changing the first attempt', async () => {
        const seen = [];
        const source = {
            provider: 'flaky',
            contentType: 'news',
            adapter: {
                fetch: vi.fn(async providerEnv => {
                    seen.push([
                        providerEnv.AIBASE_FETCH_PAGES,
                        providerEnv.TWITTER_FETCH_PAGES,
                    ]);
                    if (seen.length === 1) throw new TypeError('temporary');
                    return [];
                }),
                transform: vi.fn(raw => raw),
            },
        };

        const result = await fetchProviderPreservingData(
            { AIBASE_FETCH_PAGES: '2', TWITTER_FETCH_PAGES: '3' },
            null,
            { adapters: [source], retryDelayMs: 0, sleep: vi.fn(async () => undefined) },
        );

        expect(seen).toEqual([['2', '3'], ['1', '1']]);
        expect(result.errors).toEqual([]);
    });

    it('does not retry deterministic transform failures', async () => {
        const calls = [];
        const broken = adapter('broken', 'news', [{ id: 1 }], calls);
        broken.adapter.transform.mockImplementationOnce(() => {
            throw new RangeError('invalid transform');
        });
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [broken],
            retryDelayMs: 0,
            sleep,
        });

        expect(broken.adapter.fetch).toHaveBeenCalledOnce();
        expect(broken.adapter.transform).toHaveBeenCalledOnce();
        expect(sleep).not.toHaveBeenCalled();
        expect(result.errors).toEqual([{
            provider: 'broken',
            content_type: 'news',
            stage: 'transform',
            error_type: 'transform_error',
            attempts: 1,
        }]);
    });

    it('does not retry deterministic provider failures', async () => {
        const calls = [];
        const denied = adapter('denied', 'news', [], calls);
        denied.adapter.fetch.mockRejectedValue(new ProviderFetchError('http_4xx', {
            retryable: false,
            status: 401,
        }));
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [denied],
            retryDelayMs: 0,
            sleep,
        });

        expect(denied.adapter.fetch).toHaveBeenCalledOnce();
        expect(sleep).not.toHaveBeenCalled();
        expect(result.errors).toEqual([{
            provider: 'denied',
            content_type: 'news',
            stage: 'fetch',
            error_type: 'http_4xx',
            attempts: 1,
        }]);
    });

    it('reports a non-blocking provider failure as a warning without discarding other sources', async () => {
        const calls = [];
        const folo = adapter('twitter', 'socialMedia', [{
            id: 'folo-post',
            published_date: '2026-07-28T09:00:00Z',
        }], calls);
        const grok = adapter('grok_x', 'socialMedia', [], calls);
        grok.nonBlocking = true;
        grok.adapter.fetch.mockRejectedValue(new ProviderFetchError('http_5xx', {
            status: 503,
        }));

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [folo, grok],
            fetchAttempts: 1,
        });

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([{
            provider: 'grok_x',
            content_type: 'socialMedia',
            stage: 'fetch',
            error_type: 'http_5xx',
            attempts: 1,
        }]);
        expect(result.grouped.socialMedia).toEqual([{
            id: 'folo-post',
            published_date: '2026-07-28T09:00:00Z',
        }]);
    });

    it('aborts and retries a provider that exceeds the per-attempt deadline', async () => {
        const calls = [];
        const hanging = adapter('hanging', 'news', [], calls);
        hanging.adapter.fetch.mockImplementation((_env, _cookie, options) => {
            calls.push(options.signal);
            return new Promise(() => undefined);
        });
        const sleep = vi.fn(async () => undefined);

        const result = await fetchProviderPreservingData({}, null, {
            adapters: [hanging],
            fetchTimeoutMs: 5,
            retryDelayMs: 0,
            sleep,
        });

        expect(hanging.adapter.fetch).toHaveBeenCalledTimes(2);
        expect(calls).toHaveLength(2);
        expect(calls.every(signal => signal.aborted)).toBe(true);
        expect(sleep).toHaveBeenCalledOnce();
        expect(result.errors).toEqual([{
            provider: 'hanging',
            content_type: 'news',
            stage: 'fetch',
            error_type: 'timeout',
            attempts: 2,
        }]);
    });

    it('reserves the full ninety-second budget for pagination and translation', async () => {
        vi.useFakeTimers();
        try {
            expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(90_000);
            const calls = [];
            const delayed = adapter('delayed', 'news', [], calls);
            delayed.adapter.fetch.mockImplementation(async () => (
                await new Promise(resolve => setTimeout(() => resolve([{
                    id: 1,
                    published_date: '2026-07-16',
                }]), 75_000))
            ));

            const request = fetchProviderPreservingData({}, null, { adapters: [delayed] });
            await vi.advanceTimersByTimeAsync(75_000);

            await expect(request).resolves.toMatchObject({ errors: [] });
            expect(delayed.adapter.fetch).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('normalizes arbitrary provider codes and never trusts retryable metadata', () => {
        const error = new ProviderFetchError('secret-code', { retryable: true });
        error.retryable = true;

        expect(classifyProviderFailure(error)).toEqual({
            code: 'provider_failure',
            retryable: false,
            status: null,
        });
    });

    it('matches legacy stable-sort behavior for invalid, missing, and equal dates', async () => {
        const calls = [];
        const items = [
            { id: 'invalid-first', published_date: 'not-a-date' },
            { id: 'valid-second', published_date: '2026-07-14T00:00:00Z' },
            { id: 'missing-third' },
            { id: 'equal-fourth', published_date: '2026-07-14T00:00:00Z' },
        ];
        const expected = [...items].sort((a, b) => (
            new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
        ));
        const result = await fetchProviderPreservingData({}, null, {
            adapters: [adapter('source', 'news', items, calls)],
        });
        expect(result.grouped.news).toEqual(expected);
    });
});
