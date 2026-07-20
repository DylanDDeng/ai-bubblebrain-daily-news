import { describe, expect, it, vi } from 'vitest';

import { buildDailyArtifacts } from '../../src/daily/buildArtifacts.js';
import {
    applyEditorialEnrichment,
    compactEditorialSummary,
    compactEditorialTitle,
    normalizeEditorialHeadline,
} from '../../src/daily/editorial.js';

const RUN_AT = '2026-07-19T19:00:00.000Z';

function socialItem(overrides = {}) {
    return {
        provider: 'twitter',
        id: 'tweet-1',
        title: 'FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token，把企业知识沉淀成 Skills，然后把这些 Skills 内化到模型。接下来企业就不需要那么多人了。',
        description: 'FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token，把企业知识沉淀成 Skills，然后把这些 Skills 内化到模型。接下来企业就不需要那么多人了。',
        url: 'https://x.com/example/status/1',
        source: 'twitter-宝宝',
        published_date: '2026-07-19T15:47:00+08:00',
        ...overrides,
    };
}

async function build(rawItems = [socialItem()]) {
    return buildDailyArtifacts({
        rawItems,
        reportDate: '2026-07-19',
        structuredStartDate: '2026-07-19',
        batch: 'night',
        runAt: RUN_AT,
        producer: { version: 'editorial-test', commitSha: 'a'.repeat(40) },
    });
}

describe('structured daily editorial enrichment', () => {
    it('turns a long social post into a complete one-line fallback', () => {
        const title = compactEditorialTitle(socialItem().title, socialItem().description);
        expect(title).toBe('FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token');
        expect(Array.from(title).length).toBeLessThanOrEqual(48);
        expect(title).not.toMatch(/[…,.，]$/u);
    });

    it('cleans RT prefixes, links, boilerplate, and long summaries', () => {
        expect(compactEditorialTitle(
            'RT 张小珺 Xiaojun Zhang: As Kimi K3 launches, check out our earlier podcast interview with Yang Zhilin',
            '',
        )).toBe('As Kimi K3 launches, check out our earlier podcast interview with Yang');
        const translatedRetweet = compactEditorialTitle(
            'RT 黄赟: 想看阿拉伯语区的 AI/BI/独立开发者在讨论什么热点，想知道他们为何常有千万阅读的内容...',
            'RT 黄赟 想看阿拉伯语区的 AI/BI/独立开发者在讨论什么热点，想知道他们为何常有千万阅读的内容。',
        );
        expect(translatedRetweet).not.toMatch(/^RT\s/u);
        expect(translatedRetweet).toContain('阿拉伯语区');
        expect(compactEditorialSummary(
            `A useful first sentence. ${'detail '.repeat(80)} submitted by /u/example [link] [comments]`,
        )).toBe('A useful first sentence.');
    });

    it('accepts concise model headlines and rejects teaser-shaped output', () => {
        expect(normalizeEditorialHeadline('FDE 的阳谋：借企业落地沉淀模型能力'))
            .toBe('FDE 的阳谋：借企业落地沉淀模型能力');
        expect(normalizeEditorialHeadline('RT 作者：这是一条仍带转发前缀的标题')).toBeNull();
        expect(normalizeEditorialHeadline(`${'过'.repeat(73)}`)).toBeNull();
    });

    it('stores AI title and summary without changing stable identity', async () => {
        const original = await build();
        const id = original.report.items[0].id;
        const generate = vi.fn(async () => JSON.stringify({
            items: [{
                id,
                title: 'FDE 的阳谋：借企业落地沉淀模型能力',
                summary: '模型公司先帮助企业部署 Agent，再将企业经验沉淀为 Skills，最终降低企业对人力的依赖。',
            }],
        }));

        const result = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' },
            original,
            { itemIds: [id], generate },
        );

        expect(result.report.items[0]).toMatchObject({
            id,
            event_id: original.report.items[0].event_id,
            title: 'FDE 的阳谋：借企业落地沉淀模型能力',
            summary: '模型公司先帮助企业部署 Agent，再将企业经验沉淀为 Skills，最终降低企业对人力的依赖。',
        });
        expect(result.metrics).toMatchObject({
            editorial_count: 1,
            editorial_ai_count: 1,
            editorial_fallback_count: 0,
        });
        expect(generate).toHaveBeenCalledOnce();
    });

    it('reuses the same editorial decision across publication retries', async () => {
        const original = await build();
        const id = original.report.items[0].id;
        const cache = new Map();
        const generate = vi.fn(async () => JSON.stringify({
            items: [{
                id,
                title: 'FDE 的阳谋：借企业落地沉淀模型能力',
                summary: '模型公司先帮助企业部署 Agent，再将企业经验沉淀为 Skills。',
            }],
        }));
        const options = { generate, cache };

        const first = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' }, original, options,
        );
        const retry = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' }, original, options,
        );

        expect(retry.json).toBe(first.json);
        expect(generate).toHaveBeenCalledOnce();
    });

    it('falls back safely when the model fails and leaves non-social items unchanged', async () => {
        const news = socialItem({
            provider: 'aibase',
            id: 'news-1',
            title: 'A concise news headline',
            description: 'A concise news summary.',
            url: 'https://example.com/news',
        });
        const original = await build([socialItem(), news]);
        const generate = vi.fn(async () => { throw new Error('model unavailable'); });
        const result = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' },
            original,
            { generate },
        );
        const bySource = Object.fromEntries(result.report.items.map(item => [item.source_type, item]));

        expect(bySource.twitter.title).toBe('FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token');
        expect(bySource.aibase.title).toBe('A concise news headline');
        expect(result.metrics).toMatchObject({ editorial_ai_count: 0, editorial_fallback_count: 1 });
    });
});
