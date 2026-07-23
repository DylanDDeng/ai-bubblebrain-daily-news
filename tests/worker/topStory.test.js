import { describe, expect, it, vi } from 'vitest';

import { buildDailyArtifacts } from '../../src/daily/buildArtifacts.js';
import {
    applyTopStorySelection,
    normalizeTopStoryReason,
    normalizeTopStoryScore,
} from '../../src/daily/topStory.js';

const RUN_AT = '2026-07-19T19:00:00.000Z';
const ENABLED = { DAILY_TOP_STORY_SCORING_ENABLED: 'true' };

function newsItem(overrides = {}) {
    return {
        provider: 'aibase',
        id: `news-${Math.random().toString(36).slice(2, 10)}`,
        title: 'OpenAI 发布新一代旗舰模型，多项基准测试全面超越前代。',
        description: 'OpenAI 发布新一代旗舰模型，多项基准测试全面超越前代，API 价格维持不变。',
        url: `https://aibase.com/news/${Math.random().toString(36).slice(2, 10)}`,
        source: 'AIbase',
        published_date: '2026-07-19T10:00:00+08:00',
        ...overrides,
    };
}

function socialItem(overrides = {}) {
    return {
        provider: 'twitter',
        id: 'tweet-1',
        title: 'FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token，把企业知识沉淀成 Skills。',
        description: 'FDE 就是模型公司的阳谋：先让人去帮企业落地 Agent 卖 Token，把企业知识沉淀成 Skills。',
        url: 'https://x.com/example/status/1',
        source: 'twitter-宝宝',
        published_date: '2026-07-19T15:47:00+08:00',
        ...overrides,
    };
}

function build(rawItems, { existingReport = null, batch = 'night', runAt = RUN_AT } = {}) {
    return buildDailyArtifacts({
        existingReport,
        rawItems,
        reportDate: '2026-07-19',
        structuredStartDate: '2026-07-19',
        batch,
        runAt,
        producer: { version: 'top-story-test', commitSha: 'a'.repeat(40) },
    });
}

const scoresResponse = (entries) => JSON.stringify({ items: entries });

describe('top story scoring normalization', () => {
    it('accepts scores inside the schema 0-10 range and rejects everything else', () => {
        expect(normalizeTopStoryScore(8.7)).toBe(8.7);
        expect(normalizeTopStoryScore(0)).toBe(0);
        expect(normalizeTopStoryScore(10)).toBe(10);
        expect(normalizeTopStoryScore('8.8')).toBe(8.8);
        expect(normalizeTopStoryScore(8.74)).toBe(8.7);
        expect(normalizeTopStoryScore(10.1)).toBeNull();
        expect(normalizeTopStoryScore(87)).toBeNull();
        expect(normalizeTopStoryScore(-1)).toBeNull();
        expect(normalizeTopStoryScore('high')).toBeNull();
        expect(normalizeTopStoryScore(null)).toBeNull();
        expect(normalizeTopStoryScore(undefined)).toBeNull();
    });

    it('accepts short Chinese reasons and rejects foreign or oversized ones', () => {
        expect(normalizeTopStoryReason('行业格局级事件，影响面极大。')).toBe('行业格局级事件，影响面极大。');
        expect(normalizeTopStoryReason('english only reason')).toBeNull();
        expect(normalizeTopStoryReason('短')).toBeNull();
        expect(normalizeTopStoryReason('长'.repeat(121))).toBeNull();
        expect(normalizeTopStoryReason('理由：常规产品更新。')).toBe('常规产品更新。');
    });
});

describe('applyTopStorySelection', () => {
    it('scores news items and promotes the highest score to featured', async () => {
        const built = await build([newsItem(), newsItem()]);
        const [first, second] = built.report.items;
        const generate = vi.fn(async () => scoresResponse([
            { id: first.id, score: 6.2, reason: '常规产品更新，影响面有限。' },
            { id: second.id, score: 9.1, reason: '行业格局级事件。' },
        ]));

        const result = await applyTopStorySelection(ENABLED, built, { generate });
        const items = result.report.items;
        expect(generate).toHaveBeenCalledTimes(1);
        expect(items.find(item => item.id === first.id).score).toBe(6.2);
        expect(items.find(item => item.id === second.id).score).toBe(9.1);
        expect(items.find(item => item.id === second.id).reason).toBe('行业格局级事件。');
        expect(items.find(item => item.id === first.id).featured).toBe(false);
        expect(items.find(item => item.id === second.id).featured).toBe(true);
        expect(items.filter(item => item.featured)).toHaveLength(1);
        expect(result.metrics).toMatchObject({
            top_story_candidate_count: 2,
            top_story_ai_count: 2,
            top_story_winner_id: second.id,
            top_story_winner_score: 9.1,
        });
    });

    it('only considers news items for scoring and featuring', async () => {
        const built = await build([socialItem(), newsItem()]);
        const newsEntry = built.report.items.find(item => item.content_type === 'news');
        const socialEntry = built.report.items.find(item => item.content_type === 'socialMedia');
        const generate = vi.fn(async (_env, userPrompt) => {
            // The model must only ever see news candidates.
            expect(userPrompt).toContain(newsEntry.id);
            expect(userPrompt).not.toContain(socialEntry.id);
            return scoresResponse([{ id: newsEntry.id, score: 5.5, reason: '常规更新。' }]);
        });

        const result = await applyTopStorySelection(ENABLED, built, { generate });
        const social = result.report.items.find(item => item.content_type === 'socialMedia');
        expect(social.score).toBeNull();
        expect(social.featured).toBe(false);
        expect(result.report.items.find(item => item.id === newsEntry.id).featured).toBe(true);
    });

    it('keeps the incumbent until a strictly higher score arrives', async () => {
        const firstBuild = await build([newsItem()]);
        const incumbent = firstBuild.report.items[0];
        const firstResult = await applyTopStorySelection(ENABLED, firstBuild, {
            generate: vi.fn(async () => scoresResponse([
                { id: incumbent.id, score: 9.0, reason: '重大行业事件。' },
            ])),
        });
        expect(firstResult.report.items[0].featured).toBe(true);

        // Next batch: a weaker item must not take the lead.
        const secondBuild = await build([newsItem()], {
            existingReport: firstResult.report,
            batch: 'lateNight',
            runAt: '2026-07-19T21:00:00.000Z',
        });
        const challenger = secondBuild.report.items.find(item => item.id !== incumbent.id);
        const secondResult = await applyTopStorySelection(ENABLED, secondBuild, {
            generate: vi.fn(async () => scoresResponse([
                { id: challenger.id, score: 8.5, reason: '不错的进展但仍属常规。' },
            ])),
        });
        const afterWeaker = secondResult.report.items;
        expect(afterWeaker.find(item => item.id === incumbent.id).featured).toBe(true);
        expect(afterWeaker.find(item => item.id === challenger.id).featured).toBe(false);

        // A later batch: a stronger item takes over.
        const thirdBuild = await build([newsItem()], {
            existingReport: secondResult.report,
            batch: 'lateNight',
            runAt: '2026-07-19T23:00:00.000Z',
        });
        const champion = thirdBuild.report.items.find(
            item => item.id !== incumbent.id && item.id !== challenger.id,
        );
        const thirdResult = await applyTopStorySelection(ENABLED, thirdBuild, {
            generate: vi.fn(async () => scoresResponse([
                { id: champion.id, score: 9.5, reason: '改变行业格局的事件。' },
            ])),
        });
        const final = thirdResult.report.items;
        expect(final.find(item => item.id === champion.id).featured).toBe(true);
        expect(final.filter(item => item.featured)).toHaveLength(1);
    });

    it('leaves items unscored on model failure and retries on the next run', async () => {
        const built = await build([newsItem()]);
        const failing = vi.fn(async () => 'this is not json');
        const degraded = await applyTopStorySelection(ENABLED, built, { generate: failing });

        expect(degraded.report.items[0].score).toBeNull();
        expect(degraded.report.items.every(item => !item.featured)).toBe(true);
        // One initial attempt plus one retry attempt inside the same run.
        expect(failing).toHaveBeenCalledTimes(2);

        const itemId = degraded.report.items[0].id;
        const recovered = await applyTopStorySelection(ENABLED, degraded, {
            generate: vi.fn(async () => scoresResponse([
                { id: itemId, score: 8.8, reason: '高影响面事件。' },
            ])),
        });
        expect(recovered.report.items[0].score).toBe(8.8);
        expect(recovered.report.items[0].featured).toBe(true);
    });

    it('retries invalid scores once within the same run', async () => {
        const built = await build([newsItem(), newsItem()]);
        const [first, second] = built.report.items;
        const generate = vi.fn()
            .mockImplementationOnce(async () => scoresResponse([
                { id: first.id, score: 7.0, reason: '常规更新。' },
                { id: second.id, score: 'not-a-number', reason: '无效分数。' },
            ]))
            .mockImplementationOnce(async () => scoresResponse([
                { id: second.id, score: 6.6, reason: '重试后通过。' },
            ]));

        const result = await applyTopStorySelection(ENABLED, built, { generate });
        expect(generate).toHaveBeenCalledTimes(2);
        expect(result.report.items.find(item => item.id === second.id).score).toBe(6.6);
        expect(result.metrics.top_story_ai_count).toBe(2);
    });

    it('does nothing when the scoring switch is off', async () => {
        const built = await build([newsItem()]);
        const generate = vi.fn();
        const result = await applyTopStorySelection(
            { DAILY_TOP_STORY_SCORING_ENABLED: 'false' },
            built,
            { generate },
        );
        expect(generate).not.toHaveBeenCalled();
        expect(result.report.items[0].score).toBeNull();
        expect(result.report.items.every(item => !item.featured)).toBe(true);
    });

    it('skips already-scored items so repeated batch runs cost nothing', async () => {
        const built = await build([newsItem()]);
        const item = built.report.items[0];
        const first = await applyTopStorySelection(ENABLED, built, {
            generate: vi.fn(async () => scoresResponse([
                { id: item.id, score: 7.7, reason: '值得关注。' },
            ])),
        });
        const generate = vi.fn();
        const second = await applyTopStorySelection(ENABLED, first, { generate });
        expect(generate).not.toHaveBeenCalled();
        expect(second.report.items[0].score).toBe(7.7);
        expect(second.report.items[0].featured).toBe(true);
        expect(second.metrics.top_story_candidate_count).toBe(0);
    });
});
