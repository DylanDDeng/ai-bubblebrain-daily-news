import { describe, expect, it, vi } from 'vitest';
import { fetchProviderPreservingData } from '../../src/daily/structuredFetch.js';

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
        broken.adapter.fetch.mockRejectedValueOnce(new TypeError('offline'));
        const healthy = adapter('healthy', 'project', [{ id: 2, published_date: '2026-07-14' }], calls);

        const result = await fetchProviderPreservingData({}, null, { adapters: [broken, healthy] });

        expect(healthy.adapter.fetch).toHaveBeenCalledOnce();
        expect(result.grouped.project).toHaveLength(1);
        expect(result.errors).toEqual([{
            provider: 'broken',
            content_type: 'news',
            error_type: 'TypeError',
        }]);
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
