import { afterEach, describe, expect, it, vi } from 'vitest';
import AibaseDataSource from '../../src/dataSources/aibase.js';
import GithubTrendingDataSource from '../../src/dataSources/github-trending.js';
import HuggingfacePapersDataSource from '../../src/dataSources/huggingface-papers.js';
import JiqizhixinDataSource from '../../src/dataSources/jiqizhixin.js';
import OpenAInewsroomDataSource from '../../src/dataSources/openai-newsroom.js';
import QBitDataSource from '../../src/dataSources/qbit.js';
import SimonWillisonDataSource from '../../src/dataSources/simonwillison.js';
import TwitterDataSource from '../../src/dataSources/twitter.js';
import TwitterExtraDataSource from '../../src/dataSources/twitter-extra.js';
import XiaohuDataSource from '../../src/dataSources/xiaohu.js';
import XinZhiYuanDataSource from '../../src/dataSources/xinzhiyuan.js';
import KazikeDataSource from '../../src/dataSources/kazike.js';
import KazikeXDataSource from '../../src/dataSources/kazike-x.js';
import { ProviderFetchError } from '../../src/daily/providerFailure.js';
import { STRUCTURED_SOURCE_ADAPTERS } from '../../src/daily/sourceAdapters.js';

const FOLO_ADAPTERS = [
    ['aibase', AibaseDataSource, 'AIBASE_FEED_ID', 'AIBASE_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['xiaohu', XiaohuDataSource, 'XIAOHU_FEED_ID', 'XIAOHU_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['qbit', QBitDataSource, 'QBIT_FEED_ID', 'QBIT_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['kazike', KazikeDataSource, 'KAZIKE_FEED_ID', 'KAZIKE_FETCH_PAGES', 'KAZIKE_FILTER_DAYS'],
    ['simonwillison', SimonWillisonDataSource, 'SIMONWILLISON_FEED_ID', 'SIMONWILLISON_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['xinzhiyuan', XinZhiYuanDataSource, 'XINZHIYUAN_FEED_ID', 'XINZHIYUAN_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['openai_newsroom', OpenAInewsroomDataSource, 'OPENAI_NEWSROOM_FEED_ID', 'OPENAI_NEWSROOM_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['huggingface_papers', HuggingfacePapersDataSource, 'HGPAPERS_FEED_ID', 'HGPAPERS_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['jiqizhixin', JiqizhixinDataSource, 'JIQIZHIXIN_FEED_ID', 'JIQIZHIXIN_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['twitter', TwitterDataSource, 'TWITTER_LIST_ID', 'TWITTER_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['twitter_extra', TwitterExtraDataSource, 'TWITTER_EXTRA_LIST_ID', 'TWITTER_EXTRA_FETCH_PAGES', 'FOLO_FILTER_DAYS'],
    ['kazike_x', KazikeXDataSource, 'KAZIKE_X_FEED_ID', 'KAZIKE_X_FETCH_PAGES', 'KAZIKE_FILTER_DAYS'],
];

function envFor(idName, pagesName, overrides = {}) {
    return {
        FOLO_DATA_API: 'https://api.folo.example/entries',
        FOLO_FILTER_DAYS: '3',
        OPEN_TRANSLATE: 'false',
        [idName]: 'source-id',
        [pagesName]: '1',
        ...overrides,
    };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Failed',
        json: vi.fn(async () => body),
        text: vi.fn(async () => JSON.stringify(body)),
    };
}

function validFoloEntry() {
    return {
        entries: {
            id: 'entry-1',
            url: 'https://example.test/entry-1',
            title: 'Example',
            content: '<p>Example</p>',
            publishedAt: new Date().toISOString(),
            author: 'Author',
        },
        feeds: { title: 'Example feed' },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe.each(FOLO_ADAPTERS)('%s structured strict contract', (
    _provider,
    adapter,
    idName,
    pagesName,
    filterDaysName,
) => {
    it('rejects missing and invalid configuration without fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const missing = envFor(idName, pagesName);
        delete missing[idName];

        await expect(adapter.fetch(missing, 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'missing_config', retryable: false });
        await expect(adapter.fetch(envFor(idName, pagesName, { [pagesName]: '0' }), 'cookie', {
            strict: true,
        })).rejects.toMatchObject({ code: 'invalid_config', retryable: false });
        await expect(adapter.fetch(envFor(idName, pagesName, { [pagesName]: '2pages' }), 'cookie', {
            strict: true,
        })).rejects.toMatchObject({ code: 'invalid_config', retryable: false });
        await expect(adapter.fetch(envFor(idName, pagesName, { [filterDaysName]: 'NaN' }), 'cookie', {
            strict: true,
        })).rejects.toMatchObject({ code: 'invalid_config', retryable: false });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('classifies retryable and deterministic HTTP failures', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, {})));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'http_5xx', retryable: true, status: 503 });

        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {})));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'http_4xx', retryable: false, status: 401 });
    });

    it('rejects network, invalid JSON, and invalid response shape', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('secret network detail'); }));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'network', retryable: true });

        vi.stubGlobal('fetch', vi.fn(async () => ({
            ...jsonResponse(200, null),
            json: vi.fn(async () => { throw new SyntaxError('secret JSON detail'); }),
        })));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'invalid_json', retryable: false });

        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'invalid_shape', retryable: false });

        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: [{}] })));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'invalid_shape', retryable: false });

        const invalidTimestamp = validFoloEntry();
        invalidTimestamp.entries.publishedAt = 'not-a-date';
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: [invalidTimestamp] })));
        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true }))
            .rejects.toMatchObject({ code: 'invalid_shape', retryable: false });
    });

    it('accepts a validated empty page as a legitimate empty result', async () => {
        const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }));
        vi.stubGlobal('fetch', fetchMock);
        const signal = new AbortController().signal;

        await expect(adapter.fetch(envFor(idName, pagesName), 'cookie', { strict: true, signal }))
            .resolves.toMatchObject({ items: [] });
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal });
    });

    it('fails closed instead of returning partial data when a later page fails', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { data: [validFoloEntry()] }))
            .mockResolvedValueOnce(jsonResponse(503, {}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(adapter.fetch(envFor(idName, pagesName, { [pagesName]: '2' }), 'cookie', {
            strict: true,
        })).rejects.toMatchObject({ code: 'http_5xx', retryable: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

it('maps both Kazike feeds to the right content types and keeps the full body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [validFoloEntry()] }));
    vi.stubGlobal('fetch', fetchMock);

    const rawNews = await KazikeDataSource.fetch(
        envFor('KAZIKE_FEED_ID', 'KAZIKE_FETCH_PAGES', {
            KAZIKE_FEED_ID: '187702008971600955',
            KAZIKE_FILTER_DAYS: '7',
        }),
        'cookie',
        { strict: true },
    );
    const rawX = await KazikeXDataSource.fetch(
        envFor('KAZIKE_X_FEED_ID', 'KAZIKE_X_FETCH_PAGES', {
            KAZIKE_X_FEED_ID: '66090931808241664',
            KAZIKE_FILTER_DAYS: '7',
        }),
        'cookie',
        { strict: true },
    );
    const [newsItem] = KazikeDataSource.transform(rawNews, 'news');
    const [xItem] = KazikeXDataSource.transform(rawX, 'socialMedia');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        feedId: '187702008971600955',
        withContent: true,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
        feedId: '66090931808241664',
        withContent: true,
    });
    expect(newsItem).toMatchObject({
        id: 'entry-1',
        type: 'news',
        source: '数字生命卡兹克',
        description: 'Example',
        details: { content_html: '<p>Example</p>' },
    });
    expect(xItem).toMatchObject({
        id: 'entry-1',
        type: 'socialMedia',
        source: '数字生命卡兹克',
        description: 'Example',
        details: { content_html: '<p>Example</p>' },
    });
});

describe('github_trending structured strict contract', () => {
    const validHtml = `
        <article class="Box-row">
            <h2><a href="/openai/example">openai / example</a></h2>
            <p class="col-9">Example project</p>
        </article>
    `;

    it('uses the validated GitHub fallback when the primary endpoint fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(503, {}))
            .mockResolvedValueOnce({ ...jsonResponse(200, null), text: vi.fn(async () => validHtml) });
        vi.stubGlobal('fetch', fetchMock);

        const result = await GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
            OPEN_TRANSLATE: 'false',
        }, null, { strict: true });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ owner: 'openai', name: 'example' });
    });

    it('fails when both primary and fallback fail or fallback markup drifts', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(503, {}))
            .mockResolvedValueOnce(jsonResponse(503, {})));
        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
        }, null, { strict: true })).rejects.toMatchObject({ code: 'http_5xx' });

        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, []))
            .mockResolvedValueOnce({
                ...jsonResponse(200, null),
                text: vi.fn(async () => '<html>changed markup</html>'),
            }));
        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
        }, null, { strict: true })).rejects.toMatchObject({ code: 'invalid_shape' });
    });

    it('does not accept malformed primary project data without a valid fallback', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, [{ owner: 'openai' }]))
            .mockResolvedValueOnce(jsonResponse(503, {})));

        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
        }, null, { strict: true })).rejects.toBeInstanceOf(ProviderFetchError);
    });

    it('accepts an explicit upstream empty state', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, []))
            .mockResolvedValueOnce({
                ...jsonResponse(200, null),
                text: vi.fn(async () => "There aren't any trending repositories."),
            }));

        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
        }, null, { strict: true })).resolves.toEqual([]);
    });

    it('does not log primary URL, response body, or payload secrets in strict mode', async () => {
        const secret = 'secret-query-and-response-token';
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({
                ...jsonResponse(503, null),
                text: vi.fn(async () => secret),
            })
            .mockResolvedValueOnce(jsonResponse(503, {})));

        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: `https://primary.example/projects?token=${secret}`,
        }, null, { strict: true })).rejects.toBeInstanceOf(ProviderFetchError);

        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { secret }))
            .mockResolvedValueOnce(jsonResponse(503, {})));
        await expect(GithubTrendingDataSource.fetch({
            PROJECTS_API_URL: 'https://primary.example/projects',
        }, null, { strict: true })).rejects.toBeInstanceOf(ProviderFetchError);

        expect(JSON.stringify(logSpy.mock.calls)).not.toContain(secret);
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
    });
});

it('uses only closed provider failure fields', () => {
    const error = new ProviderFetchError('network', { retryable: true, status: 503 });
    expect(error).toMatchObject({
        name: 'ProviderFetchError',
        code: 'network',
        retryable: true,
        status: 503,
    });
});

it('covers every adapter in the structured source registry', () => {
    expect(STRUCTURED_SOURCE_ADAPTERS.map(entry => entry.provider).sort()).toEqual([
        ...FOLO_ADAPTERS.map(([provider]) => provider),
        'github_trending',
    ].sort());
});
