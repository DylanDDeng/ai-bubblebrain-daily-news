import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, createIdentity } from '../../src/daily/identity.js';
import { deduplicateSameDay } from '../../src/daily/dedupe.js';
import { normalizeSourceItem } from '../../src/daily/normalize.js';
import { SOURCE_REGISTRY } from '../../src/daily/sourceRegistry.js';
import { STRUCTURED_SOURCE_ADAPTERS } from '../../src/daily/sourceAdapters.js';
import { dataSources } from '../../src/dataFetchers.js';
import GithubTrendingDataSource from '../../src/dataSources/github-trending.js';

describe('source registry and stable identity v1', () => {
    it('freezes unique policies for all 11 registered source adapters', () => {
        expect(Object.keys(SOURCE_REGISTRY)).toEqual([
            'aibase', 'xiaohu', 'qbit', 'xinzhiyuan', 'openai_newsroom',
            'github_trending', 'huggingface_papers', 'jiqizhixin',
            'twitter', 'twitter_extra', 'reddit',
        ]);
        for (const policy of Object.values(SOURCE_REGISTRY)) {
            expect(['source_id', 'canonical_url']).toContain(policy.primaryIdentity);
        }
    });

    it('maps every active legacy adapter to exactly one structured provider without changing its output', () => {
        expect(STRUCTURED_SOURCE_ADAPTERS).toHaveLength(11);
        expect(STRUCTURED_SOURCE_ADAPTERS.map(entry => entry.provider))
            .toEqual(Object.keys(SOURCE_REGISTRY));
        for (const entry of STRUCTURED_SOURCE_ADAPTERS) {
            expect(dataSources[entry.contentType].sources).toContain(entry.adapter);
            expect(SOURCE_REGISTRY[entry.provider].contentType).toBe(entry.contentType);
        }
        expect(new Set(STRUCTURED_SOURCE_ADAPTERS.map(entry => entry.adapter)).size).toBe(11);
    });

    it('canonicalizes conservatively and preserves business-significant URL parts', () => {
        expect(canonicalizeUrl('HTTPS://Example.COM/Story/?UTM_Source=rss&b=2&a=1#top'))
            .toBe('https://example.com/Story/?a=1&b=2');
        expect(canonicalizeUrl('https://example.com/download?signature=abc&expires=123'))
            .toBe('https://example.com/download?expires=123&signature=abc');
        expect(canonicalizeUrl('https://www.example.com/story'))
            .toBe('https://www.example.com/story');
    });

    it('rejects relative, credentialed, and non-HTTP URLs', () => {
        expect(canonicalizeUrl('/relative')).toBeNull();
        expect(canonicalizeUrl('https://user:pass@example.com/story')).toBeNull();
        expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
        expect(canonicalizeUrl('data:text/plain,hello')).toBeNull();
    });

    it('uses source IDs for stable-entry providers while retaining the URL claim', async () => {
        const identity = await createIdentity({
            provider: 'aibase',
            sourceId: 'entry-123',
            canonicalUrl: 'https://example.com/story',
            title: 'Story',
            publishedDate: '2026-07-14',
        });

        expect(identity.strategy).toBe('source_id');
        expect(identity.id).toMatch(/^n_[a-f0-9]{64}$/);
        expect(identity.eventId).toBe(`e_${identity.id.slice(2)}`);
        expect(identity.claims).toHaveLength(2);
        expect(identity.claims).toContain(`c_${identity.id.slice(2)}`);
        expect(JSON.stringify(identity)).not.toContain('https://example.com/story');
    });

    it('uses canonical URLs for providers with unstable synthetic source IDs', async () => {
        const first = await createIdentity({
            provider: 'github_trending',
            sourceId: 'array-index-1',
            canonicalUrl: 'https://github.com/example/repo',
            title: 'Repo',
            publishedDate: '2026-07-14',
        });
        const second = await createIdentity({
            provider: 'github_trending',
            sourceId: 'array-index-99',
            canonicalUrl: 'https://github.com/example/repo',
            title: 'Repo renamed',
            publishedDate: '2026-07-14',
        });
        expect(first.strategy).toBe('canonical_url');
        expect(second.id).toBe(first.id);
    });

    it('does not bridge existing GitHub projects when trending order changes', async () => {
        const alpha = {
            owner: 'example', name: 'alpha', url: 'https://github.com/example/alpha',
            description: 'Alpha',
        };
        const beta = {
            owner: 'example', name: 'beta', url: 'https://github.com/example/beta',
            description: 'Beta',
        };
        const legacy = GithubTrendingDataSource.transform([alpha, beta], 'project');
        const structured = GithubTrendingDataSource.transform([beta, alpha], 'project', { strict: true });
        const spoofedLegacy = GithubTrendingDataSource.transform([
            { ...alpha, structured_source_id: 'upstream-controlled-value' },
        ], 'project');
        const normalize = async raw => (await normalizeSourceItem(raw, {
            provider: 'github_trending',
            batch: 'morning',
            runAt: '2026-07-16T10:13:03.000Z',
        })).item;
        const existing = await Promise.all(legacy.map(normalize));
        const incoming = await Promise.all(structured.map(normalize));

        expect(() => deduplicateSameDay(existing, incoming)).not.toThrow();
        expect(deduplicateSameDay(existing, incoming).items).toHaveLength(2);
        expect(legacy.map(item => item.id)).toEqual([1, 2]);
        expect(structured.map(item => item.id)).toEqual([beta.url, alpha.url]);
        expect(spoofedLegacy[0].id).toBe(1);
    });

    it('keeps the same source ID distinct across providers', async () => {
        const first = await createIdentity({ provider: 'aibase', sourceId: '42', canonicalUrl: null });
        const second = await createIdentity({ provider: 'xiaohu', sourceId: '42', canonicalUrl: null });
        expect(first.id).not.toBe(second.id);
    });

    it('uses a dated title fallback only when exact claims are unavailable', async () => {
        const fallback = await createIdentity({
            provider: 'aibase',
            sourceId: null,
            canonicalUrl: 'https://example.com/',
            title: 'Fallback title',
            publishedDate: '2026-07-14',
        });
        const rejected = await createIdentity({
            provider: 'aibase',
            sourceId: null,
            canonicalUrl: null,
            title: 'Fallback title',
            publishedDate: null,
        });
        const emptyFingerprint = await createIdentity({
            provider: 'aibase',
            sourceId: null,
            canonicalUrl: 'https://example.com/',
            title: '!!! ???',
            publishedDate: '2026-07-14',
        });
        expect(fallback.strategy).toBe('fallback');
        expect(rejected).toBeNull();
        expect(emptyFingerprint).toBeNull();
    });

    it('rejects unsafe numeric IDs and accepts URL-less stable source items', async () => {
        const unsafe = await normalizeSourceItem({
            id: Number.MAX_SAFE_INTEGER + 1,
            title: 'Unsafe',
        }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });
        const safe = await normalizeSourceItem({
            id: 'entry-1',
            title: 'URL-less item',
            published_date: '2026-07-14',
            source: 'Display name can change',
        }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });
        expect(unsafe).toMatchObject({ accepted: false, reason: 'invalid_source_id' });
        expect(safe.accepted).toBe(true);
        expect(safe.item.url).toBeNull();
        expect(safe.item.source_type).toBe('aibase');
    });

    it('keeps independent claims so URL and source ID changes have explicit behavior', async () => {
        const original = await createIdentity({
            provider: 'aibase',
            sourceId: 'entry-old',
            canonicalUrl: 'https://example.com/stable-story',
            title: 'Stable story',
            publishedDate: '2026-07-14',
        });
        const changedId = await createIdentity({
            provider: 'aibase',
            sourceId: 'entry-new',
            canonicalUrl: 'https://example.com/stable-story',
            title: 'Stable story renamed',
            publishedDate: '2026-07-14',
        });
        const missingUrl = await createIdentity({
            provider: 'aibase',
            sourceId: 'entry-old',
            canonicalUrl: null,
            title: 'Stable story',
            publishedDate: '2026-07-14',
        });

        expect(changedId.id).not.toBe(original.id);
        expect(changedId.claims.filter(claim => original.claims.includes(claim))).toHaveLength(1);
        expect(missingUrl.id).toBe(original.id);
        expect(missingUrl.claims).toHaveLength(1);
    });

    it('preserves business query parameters and never treats a homepage as an exact URL claim', async () => {
        const firstUrl = canonicalizeUrl('https://example.com/story?article=1&utm_source=feed');
        const secondUrl = canonicalizeUrl('https://example.com/story?article=2&utm_source=feed');
        expect(firstUrl).toBe('https://example.com/story?article=1');
        expect(secondUrl).toBe('https://example.com/story?article=2');

        const first = await createIdentity({
            provider: 'aibase', sourceId: null, canonicalUrl: firstUrl,
            title: 'Story', publishedDate: '2026-07-14',
        });
        const second = await createIdentity({
            provider: 'aibase', sourceId: null, canonicalUrl: secondUrl,
            title: 'Story', publishedDate: '2026-07-14',
        });
        const homepageA = await createIdentity({
            provider: 'aibase', sourceId: null, canonicalUrl: 'https://example.com/',
            title: 'First homepage item', publishedDate: '2026-07-14',
        });
        const homepageB = await createIdentity({
            provider: 'aibase', sourceId: null, canonicalUrl: 'https://example.com/',
            title: 'Second homepage item', publishedDate: '2026-07-14',
        });

        expect(first.id).not.toBe(second.id);
        expect(first.claims.some(claim => second.claims.includes(claim))).toBe(false);
        expect(homepageA.strategy).toBe('fallback');
        expect(homepageB.strategy).toBe('fallback');
        expect(homepageA.id).not.toBe(homepageB.id);
    });

    it('normalizes Unicode text, strips controls, and rejects controlled source IDs', async () => {
        const normalized = await normalizeSourceItem({
            id: 'unicode-1',
            title: 'Cafe\u0301\u0000 AI\nNews',
            description: '<p>Line one</p>\u0007Line two',
            source: { name: 'Unicode Source', homepage: 'https://example.com/' },
        }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });
        const rejected = await normalizeSourceItem({
            id: 'bad\u0000id', title: 'Bad source id',
        }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });

        expect(normalized.accepted).toBe(true);
        expect(normalized.item.title).toBe('Café AI News');
        expect(normalized.item.summary).toBe('Line one Line two');
        expect(normalized.item.source.name).toBe('Unicode Source');
        expect(rejected).toEqual({ accepted: false, reason: 'invalid_source_id' });
    });

    it('rejects malformed items and overlong URLs at the normalization boundary', async () => {
        const options = { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' };
        await expect(normalizeSourceItem(null, options)).resolves.toEqual({
            accepted: false,
            reason: 'invalid_item',
        });
        const overlong = await normalizeSourceItem({
            id: 'long-url',
            title: 'Long URL',
            url: `https://example.com/?value=${'x'.repeat(8200)}`,
        }, options);
        expect(overlong).toEqual({ accepted: false, reason: 'url_too_long' });
        await expect(normalizeSourceItem({
            title: '!!!',
            url: 'https://example.com/',
            published_date: '2026-07-14',
        }, options)).resolves.toEqual({ accepted: false, reason: 'missing_identity' });
    });

    it('produces identical publication times across host timezones and rejects timezone-less instants', async () => {
        const originalTimezone = process.env.TZ;
        const normalizeInTimezone = async timezone => {
            process.env.TZ = timezone;
            const exact = await normalizeSourceItem({
                id: 'exact-time', title: 'Exact time', published_date: '2026-07-14T14:20:00+08:00',
            }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });
            const ambiguous = await normalizeSourceItem({
                id: 'ambiguous-time', title: 'Ambiguous time', published_date: '2026-07-14T14:20:00',
            }, { provider: 'aibase', batch: 'morning', runAt: '2026-07-14T07:00:00Z' });
            return { exact: exact.item, ambiguous: ambiguous.item };
        };

        try {
            const utc = await normalizeInTimezone('UTC');
            const newYork = await normalizeInTimezone('America/New_York');
            expect(newYork).toEqual(utc);
            expect(utc.exact).toMatchObject({
                published_at: '2026-07-14T06:20:00.000Z',
                published_date: '2026-07-14',
                time_precision: 'exact',
            });
            expect(utc.ambiguous).toMatchObject({
                published_at: null,
                published_date: null,
                time_precision: 'inferred',
            });
        } finally {
            if (originalTimezone === undefined) delete process.env.TZ;
            else process.env.TZ = originalTimezone;
        }
    });
});
