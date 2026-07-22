import { describe, expect, it, vi } from 'vitest';

import { buildDailyArtifacts } from '../../src/daily/buildArtifacts.js';
import {
    applyEditorialEnrichment,
    compactEditorialSummary,
    compactEditorialTitle,
    editorialNeedsEnrichment,
    normalizeEditorialHeadline,
    normalizeEditorialSummary,
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
    it('keeps Chinese social posts whole instead of truncating them', () => {
        const title = compactEditorialTitle(socialItem().title, socialItem().description);
        expect(title).toBe(socialItem().description);
        expect(title).not.toMatch(/[…,.，]$/u);
    });

    it('bounds extreme long-form sources within the schema title budget', () => {
        const sentence = '这一句话用来填充长文内容，验证截断行为是否合规。';
        const longText = `${sentence.repeat(20)}${'尾巴'.repeat(200)}`;
        const title = compactEditorialTitle('', longText);
        expect(Array.from(title).length).toBeLessThanOrEqual(480);
        expect(title).toContain('验证截断行为是否合规');
        expect(normalizeEditorialHeadline(`${'长'.repeat(481)}`)).toBeNull();
        expect(normalizeEditorialHeadline(`${'长'.repeat(480)}`)).toBe('长'.repeat(480));
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

    it('accepts complete Chinese output and rejects untranslated or teaser-shaped output', () => {
        expect(normalizeEditorialHeadline('FDE 的阳谋：借企业落地沉淀模型能力'))
            .toBe('FDE 的阳谋：借企业落地沉淀模型能力');
        // Long Chinese headlines are accepted — no upper length cap.
        expect(normalizeEditorialHeadline(
            'OpenAI具备网络能力的模型通过发现并利用多个零日漏洞成功入侵了Hugging Face生产环境',
        )).toBe('OpenAI具备网络能力的模型通过发现并利用多个零日漏洞成功入侵了Hugging Face生产环境');
        expect(normalizeEditorialHeadline(`${'过'.repeat(73)}`)).toBe('过'.repeat(73));
        expect(normalizeEditorialHeadline('RT 作者：这是一条仍带转发前缀的标题')).toBeNull();
        expect(normalizeEditorialHeadline('ChatGPT Work runs in the cloud from mobile')).toBeNull();
        expect(normalizeEditorialHeadline('ChatGPT Work 可在云端运行…')).toBeNull();
        expect(normalizeEditorialHeadline('ChatGPT Work 的主要优势是：')).toBeNull();
        expect(normalizeEditorialSummary('ChatGPT Work runs in the cloud from mobile.')).toBeNull();
        expect(normalizeEditorialSummary('ChatGPT Work 可在云端持续运行，用户合上电脑后仍能从手机继续任务。'))
            .not.toBeNull();
    });

    it('flags legacy same-day social headlines for editorial backfill', () => {
        const base = {
            content_type: 'socialMedia',
            identity_strategy: 'source_id',
        };
        expect(editorialNeedsEnrichment({
            ...base,
            title: 'one of the best features of ChatGPT Work is that it runs in the cloud...',
        })).toBe(true);
        expect(editorialNeedsEnrichment({
            ...base,
            title: 'ChatGPT Work 可在云端持续运行，合上电脑后仍能从手机继续任务',
        })).toBe(false);
        expect(editorialNeedsEnrichment({
            ...base,
            identity_strategy: 'fallback',
            title: 'untranslated fallback',
        })).toBe(false);
        expect(editorialNeedsEnrichment({
            ...base,
            content_type: 'news',
            title: 'English news headline',
        })).toBe(false);
        expect(editorialNeedsEnrichment({
            ...base,
            title: 'https://x.com/i/article/1234567890',
            summary: 'https://x.com/i/article/1234567890',
        })).toBe(false);
    });

    it('rejects URL-only social entries before they can reach editorial generation', async () => {
        const result = await build([socialItem({
            id: 'article-url-only',
            title: 'https://x.com/i/article/1234567890',
            description: 'https://x.com/i/article/1234567890',
            url: 'https://x.com/i/article/1234567890',
        })]);

        expect(result.report.items).toEqual([]);
        expect(result.rejected).toEqual(['missing_social_content']);
        expect(result.metrics).toMatchObject({ accepted_count: 0, rejected_count: 1 });
    });

    it('skips legacy URL-only entries instead of asking the model to invent content', async () => {
        const original = await build();
        const url = 'https://x.com/i/article/1234567890';
        original.report.items[0].title = url;
        original.report.items[0].summary = url;
        const generate = vi.fn();

        const result = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' },
            original,
            { generate },
        );

        expect(result.report.items[0].title).toBe(url);
        expect(generate).not.toHaveBeenCalled();
        expect(result.metrics).toMatchObject({
            editorial_count: 0,
            editorial_skipped_no_content_count: 1,
        });
    });

    it('never overwrites a valid source title with an empty cached fallback', async () => {
        const original = await build();
        const item = original.report.items[0];
        const cache = new Map([[item.id, { title: '', summary: null, ai: false }]]);

        const result = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'false' },
            original,
            { cache },
        );

        expect(result.report.items[0].title).toBe(item.title);
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

    it('retries once when the model returns an English headline', async () => {
        const original = await build();
        const id = original.report.items[0].id;
        const generate = vi.fn()
            .mockResolvedValueOnce(JSON.stringify({
                items: [{
                    id,
                    title: 'ChatGPT Work runs in the cloud from mobile',
                    summary: 'ChatGPT Work runs in the cloud from mobile.',
                }],
            }))
            .mockResolvedValueOnce(JSON.stringify({
                items: [{
                    id,
                    title: 'ChatGPT Work 可在云端运行并支持手机续接任务',
                    summary: '任务在云端持续运行，用户合上电脑后仍能从手机继续处理。',
                }],
            }));

        const result = await applyEditorialEnrichment(
            { DAILY_EDITORIAL_ENRICHMENT_ENABLED: 'true' },
            original,
            { itemIds: [id], generate },
        );

        expect(result.report.items[0].title)
            .toBe('ChatGPT Work 可在云端运行并支持手机续接任务');
        expect(generate).toHaveBeenCalledTimes(2);
        expect(result.metrics).toMatchObject({ editorial_ai_count: 1, editorial_fallback_count: 0 });
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

        expect(bySource.twitter.title).toBe(socialItem().description);
        expect(bySource.aibase.title).toBe('A concise news headline');
        expect(result.metrics).toMatchObject({ editorial_ai_count: 0, editorial_fallback_count: 1 });
    });
});
