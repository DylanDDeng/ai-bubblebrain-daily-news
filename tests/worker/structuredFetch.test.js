import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_FETCH_TIMEOUT_MS,
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
        expect(calls).toEqual(adapters.flatMap(entry => [
            `fetch:${entry.provider}`,
            `transform:${entry.provider}`,
        ]));
        expect(result.structuredItems).toHaveLength(11);
        expect(result.errors).toEqual([]);
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
