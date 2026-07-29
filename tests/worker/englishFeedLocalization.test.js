import { afterEach, describe, expect, it, vi } from 'vitest';

const { callChatAPIMock } = vi.hoisted(() => ({
    callChatAPIMock: vi.fn(),
}));

vi.mock('../../src/chatapi.js', () => ({
    callChatAPI: callChatAPIMock,
}));

import AnthropicResearchDataSource from '../../src/dataSources/anthropic-research.js';
import HuggingfacePapersDataSource from '../../src/dataSources/huggingface-papers.js';
import OpenAInewsroomDataSource from '../../src/dataSources/openai-newsroom.js';
import SimonWillisonDataSource from '../../src/dataSources/simonwillison.js';
import TheDecoderDataSource from '../../src/dataSources/the-decoder.js';
import { localizeEnglishFeedItems } from '../../src/dataSources/localize-english-feed.js';

function jsonResponse(body) {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => body),
        text: vi.fn(async () => JSON.stringify(body)),
    };
}

function validFoloEntry() {
    const timestamp = new Date().toISOString();
    return {
        entries: {
            id: 'entry-1',
            url: 'https://example.test/entry-1',
            title: 'An English AI headline',
            content: '<p>An English summary with <strong>source detail</strong>.</p>',
            publishedAt: timestamp,
            insertedAt: timestamp,
            author: 'Author',
        },
        feeds: { title: 'Example feed' },
    };
}

const LOCALIZED_TITLE = '一条英文人工智能资讯标题';
const LOCALIZED_SUMMARY = '这是一条忠实的中文摘要，并保留来源中的关键信息。';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callChatAPIMock.mockReset();
});

describe('English feed localization', () => {
    it('translates titles and summaries together and preserves the original HTML', async () => {
        const items = [{
            id: 'item-1',
            title: 'An English AI headline',
            content_html: '<p>An English summary with <strong>source detail</strong>.</p>',
        }];
        const generate = vi.fn(async (_env, prompt) => {
            expect(prompt).toContain('"original_title":"An English AI headline"');
            expect(prompt).toContain('"original_summary":"An English summary with source detail."');
            return JSON.stringify([{
                id: 0,
                title_zh: LOCALIZED_TITLE,
                summary_zh: LOCALIZED_SUMMARY,
            }]);
        });

        const [localized] = await localizeEnglishFeedItems(
            { OPEN_TRANSLATE: 'true' },
            items,
            { strict: true, generate, sourceName: 'Test feed' },
        );

        expect(generate).toHaveBeenCalledOnce();
        expect(localized).toEqual({
            ...items[0],
            title_zh: LOCALIZED_TITLE,
            summary_zh: LOCALIZED_SUMMARY,
        });
        expect(localized.content_html).toBe(items[0].content_html);
    });

    it.each([
        ['invalid JSON', 'not JSON'],
        ['a missing item', '[]'],
        ['an English-only title', JSON.stringify([{
            id: 0,
            title_zh: 'Still English',
            summary_zh: LOCALIZED_SUMMARY,
        }])],
        ['an English-only summary', JSON.stringify([{
            id: 0,
            title_zh: LOCALIZED_TITLE,
            summary_zh: 'Still English',
        }])],
        ['a summary longer than 160 characters', JSON.stringify([{
            id: 0,
            title_zh: LOCALIZED_TITLE,
            summary_zh: '中'.repeat(161),
        }])],
    ])('fails closed in strict mode for %s', async (_label, response) => {
        await expect(localizeEnglishFeedItems(
            { OPEN_TRANSLATE: 'true' },
            [{
                title: 'English title',
                content_html: '<p>English summary</p>',
            }],
            {
                strict: true,
                generate: vi.fn(async () => response),
            },
        )).rejects.toBeInstanceOf(Error);
    });

    it('rejects invented text for an empty source field', async () => {
        await expect(localizeEnglishFeedItems(
            { OPEN_TRANSLATE: 'true' },
            [{
                title: 'English title',
                content_html: '',
            }],
            {
                strict: true,
                generate: vi.fn(async () => JSON.stringify([{
                    id: 0,
                    title_zh: LOCALIZED_TITLE,
                    summary_zh: '模型虚构的摘要',
                }])),
            },
        )).rejects.toBeInstanceOf(Error);
    });

    it('keeps an explicit translation-off fallback for non-production callers', async () => {
        const generate = vi.fn();
        const [localized] = await localizeEnglishFeedItems(
            { OPEN_TRANSLATE: 'false' },
            [{
                title: 'English title',
                content_html: '<p>English summary</p>',
            }],
            { generate },
        );

        expect(generate).not.toHaveBeenCalled();
        expect(localized).toMatchObject({
            title_zh: 'English title',
            summary_zh: 'English summary',
            content_html: '<p>English summary</p>',
        });
    });
});

describe.each([
    [
        'Simon Willison',
        SimonWillisonDataSource,
        'SIMONWILLISON_FEED_ID',
        'SIMONWILLISON_FETCH_PAGES',
        {},
    ],
    [
        'OpenAI Newsroom',
        OpenAInewsroomDataSource,
        'OPENAI_NEWSROOM_FEED_ID',
        'OPENAI_NEWSROOM_FETCH_PAGES',
        {},
    ],
    [
        'Anthropic Research',
        AnthropicResearchDataSource,
        'ANTHROPIC_RESEARCH_FEED_ID',
        'ANTHROPIC_RESEARCH_FETCH_PAGES',
        { ANTHROPIC_RESEARCH_FILTER_DAYS: '14' },
    ],
    [
        'The Decoder',
        TheDecoderDataSource,
        'THE_DECODER_FEED_ID',
        'THE_DECODER_FETCH_PAGES',
        {},
    ],
    [
        'Hugging Face Papers',
        HuggingfacePapersDataSource,
        'HGPAPERS_FEED_ID',
        'HGPAPERS_FETCH_PAGES',
        {},
    ],
])('%s translation wiring', (
    _sourceName,
    adapter,
    feedIdEnv,
    fetchPagesEnv,
    overrides,
) => {
    it('publishes the localized title and summary while retaining source HTML', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            data: [validFoloEntry()],
        })));
        callChatAPIMock.mockResolvedValue(JSON.stringify([{
            id: 0,
            title_zh: LOCALIZED_TITLE,
            summary_zh: LOCALIZED_SUMMARY,
        }]));

        const raw = await adapter.fetch({
            FOLO_DATA_API: 'https://api.folo.example/entries',
            FOLO_FILTER_DAYS: '3',
            OPEN_TRANSLATE: 'true',
            [feedIdEnv]: 'source-id',
            [fetchPagesEnv]: '1',
            ...overrides,
        }, 'cookie', { strict: true });
        const [item] = adapter.transform(raw, 'news');

        expect(callChatAPIMock).toHaveBeenCalledOnce();
        expect(raw.items[0]).toMatchObject({
            title: 'An English AI headline',
            title_zh: LOCALIZED_TITLE,
            summary_zh: LOCALIZED_SUMMARY,
            content_html: '<p>An English summary with <strong>source detail</strong>.</p>',
        });
        expect(item).toMatchObject({
            title: LOCALIZED_TITLE,
            description: LOCALIZED_SUMMARY,
            details: {
                content_html: '<p>An English summary with <strong>source detail</strong>.</p>',
            },
        });
    });
});
