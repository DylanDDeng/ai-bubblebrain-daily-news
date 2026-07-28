import { afterEach, describe, expect, it, vi } from 'vitest';
import GrokXDataSource, {
    buildGrokXRequest,
    chunkGrokXHandles,
    resolveGrokXWindow,
} from '../../src/dataSources/grok-x.js';

const RUN_AT = '2026-07-28T10:00:00.000Z';
const HANDLES = [
    'account01', 'account02', 'account03', 'account04', 'account05',
    'account06', 'account07', 'account08', 'account09', 'account10',
    'account11', 'account12', 'account13', 'account14', 'account15',
    'account16', 'account17', 'account18', 'account19', 'account20',
    'account21',
];

function env(overrides = {}) {
    return {
        GROK_X_ENABLED: 'true',
        GROK_X_API_URL: 'https://api.x.ai/v1/responses',
        GROK_X_MODEL: 'grok-4.5',
        GROK_X_LOOKBACK_HOURS: '3',
        GROK_X_RECONCILE_HOURS: '48',
        GROK_X_RECONCILE_UTC_HOUR: '16',
        GROK_X_IMAGE_UNDERSTANDING: 'true',
        GROK_X_VIDEO_UNDERSTANDING: 'true',
        GROK_X_HANDLES: HANDLES.join(','),
        XAI_API_KEY: 'test-xai-key',
        ...overrides,
    };
}

function responsePayload(posts) {
    return {
        output: [{
            type: 'message',
            content: [{
                type: 'output_text',
                text: JSON.stringify({ posts }),
            }],
        }],
    };
}

function response(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => payload),
    };
}

function post(handle, id, overrides = {}) {
    return {
        post_id: id,
        handle,
        url: `https://x.com/${handle}/status/${id}`,
        published_at: '2026-07-28T09:30:00Z',
        text: `Post from ${handle}`,
        media_types: ['image', 'video'],
        media_analysis: 'A product screenshot and a short demonstration video.',
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Grok X source', () => {
    it('does not call xAI while the provider is disabled', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(GrokXDataSource.fetch(env({ GROK_X_ENABLED: 'false' }), null, {
            strict: true,
            runAt: RUN_AT,
        })).resolves.toEqual({ items: [], disabled: true });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('splits 21 handles into 20 plus 1 and keeps image and video understanding on', async () => {
        expect(chunkGrokXHandles(HANDLES).map(group => group.length)).toEqual([20, 1]);
        const fetchMock = vi.fn(async (_url, options) => {
            const body = JSON.parse(options.body);
            const handle = body.tools[0].allowed_x_handles[0];
            return response(200, responsePayload([post(handle, handle === 'account01' ? '101' : '201')]));
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await GrokXDataSource.fetch(env(), null, {
            strict: true,
            runAt: RUN_AT,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
        expect(bodies.map(body => body.tools[0].allowed_x_handles.length)).toEqual([20, 1]);
        for (const body of bodies) {
            expect(body).toMatchObject({
                model: 'grok-4.5',
                tools: [{
                    type: 'x_search',
                    from_date: '2026-07-28',
                    to_date: '2026-07-28',
                    enable_image_understanding: true,
                    enable_video_understanding: true,
                }],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'grok_x_posts',
                        strict: true,
                    },
                },
            });
            expect(body.input[0].content).toContain(
                '2026-07-28T07:00:00.000Z inclusive to 2026-07-28T10:00:00.000Z exclusive',
            );
        }
        expect(result.items).toHaveLength(2);
    });

    it('uses the daily 48-hour overlap at Beijing midnight', () => {
        expect(resolveGrokXWindow(env(), '2026-07-28T15:00:00Z')).toMatchObject({
            hours: 3,
            fromDate: '2026-07-28',
            toDate: '2026-07-28',
        });
        expect(resolveGrokXWindow(env(), '2026-07-28T16:00:00Z')).toMatchObject({
            hours: 48,
            fromDate: '2026-07-26',
            toDate: '2026-07-28',
        });
    });

    it('filters blocked handles before making requests', async () => {
        const fetchMock = vi.fn(async (_url, options) => {
            const body = JSON.parse(options.body);
            expect(body.tools[0].allowed_x_handles).not.toContain('account01');
            return response(200, responsePayload([]));
        });
        vi.stubGlobal('fetch', fetchMock);

        await GrokXDataSource.fetch(env({ X_BLOCKED_HANDLES: '@account01' }), null, {
            strict: true,
            runAt: RUN_AT,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['another account', { handle: 'intruder', url: 'https://x.com/intruder/status/101' }],
        ['mismatched status ID', { post_id: '999' }],
        ['non-X URL', { url: 'https://example.com/account01/status/101' }],
        ['old timestamp', { published_at: '2026-07-28T06:59:59Z' }],
        ['end-boundary timestamp', { published_at: '2026-07-28T10:00:00Z' }],
        ['timestamp without timezone', { published_at: '2026-07-28T09:30:00' }],
    ])('fails closed for %s', async (_label, override) => {
        vi.stubGlobal('fetch', vi.fn(async () => (
            response(200, responsePayload([post('account01', '101', override)]))
        )));

        await expect(GrokXDataSource.fetch(env(), null, {
            strict: true,
            runAt: RUN_AT,
        })).rejects.toMatchObject({ code: 'invalid_shape', retryable: false });
    });

    it.each([
        [401, 'http_4xx', false],
        [429, 'http_429', true],
        [503, 'http_5xx', true],
    ])('classifies HTTP %s without exposing response details', async (status, code, retryable) => {
        vi.stubGlobal('fetch', vi.fn(async () => response(status, { secret: 'do-not-log' })));

        await expect(GrokXDataSource.fetch(env(), null, {
            strict: true,
            runAt: RUN_AT,
        })).rejects.toMatchObject({ code, retryable });
    });

    it('fails the whole provider when one handle group fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(200, responsePayload([post('account01', '101')])))
            .mockResolvedValueOnce(response(503, {}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(GrokXDataSource.fetch(env(), null, {
            strict: true,
            runAt: RUN_AT,
        })).rejects.toMatchObject({ code: 'http_5xx' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('turns visual analysis into escaped downstream content', async () => {
        const raw = {
            items: [{
                id: '101',
                handle: 'account01',
                url: 'https://x.com/account01/status/101',
                text: '<script>alert(1)</script>',
                publishedAt: '2026-07-28T09:30:00.000Z',
                mediaTypes: ['video'],
                mediaAnalysis: '<b>demo</b>',
            }],
        };
        const [item] = GrokXDataSource.transform(raw, 'socialMedia');
        expect(item).toMatchObject({
            id: '101',
            type: 'socialMedia',
            authors: 'account01',
            source: 'X @account01',
            details: {
                media_types: ['video'],
                media_analysis: '<b>demo</b>',
            },
        });
        expect(item.details.content_html).not.toContain('<script>');
        expect(item.details.content_html).toContain('&lt;script&gt;');
    });

    it('fails configuration closed instead of allowing media understanding to be turned off', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(GrokXDataSource.fetch(env({
            GROK_X_IMAGE_UNDERSTANDING: 'false',
        }), null, {
            strict: true,
            runAt: RUN_AT,
        })).rejects.toMatchObject({ code: 'invalid_config', retryable: false });
        expect(fetchMock).not.toHaveBeenCalled();

        const body = buildGrokXRequest(env(), ['account01'], resolveGrokXWindow(env(), RUN_AT));
        expect(body.tools[0]).toMatchObject({
            enable_image_understanding: true,
            enable_video_understanding: true,
        });
    });
});
