import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAdminRoute } from '../../src/routes/adminRoutes.js';

const ORIGIN = 'https://admin.example.test';
const ADMIN_TOKEN = 'canary-admin-token-do-not-log';
const SESSION_ID = 'canary-session-id-do-not-log';
const COOKIE_SECRET = 'canary-folo-cookie-do-not-log';

const ROUTES = [
    ['/auto', 'auto', {}],
    ['/incrementalDaily', 'incrementalDaily', {}],
    ['/reconcileDaily', 'reconcileDaily', { scheduled_at: '2026-07-14T02:00:00.000Z' }],
    ['/writeRssData', 'writeRssData', { date: '2026-07-14' }],
    ['/updateFoloCookie', 'updateFoloCookie', { cookie: COOKIE_SECRET }],
    ['/debugFoloCookie', 'debugFoloCookie', {}],
];
const SESSION_ROUTES = ROUTES.filter(([path]) => (
    path === '/updateFoloCookie' || path === '/debugFoloCookie'
));

function makeKv() {
    return {
        async get(key) {
            return key === `session:${SESSION_ID}` ? JSON.stringify('valid') : null;
        },
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
    };
}

function makeEnv(overrides = {}) {
    return {
        ADMIN_API_TOKEN: ADMIN_TOKEN,
        EXTERNAL_WRITES_ENABLED: 'true',
        DATA_KV: makeKv(),
        ADMIN_RATE_LIMITER: {
            limit: vi.fn(async () => ({ success: true })),
        },
        ...overrides,
    };
}

function makeHandlers() {
    return Object.fromEntries(ROUTES.map(([, handlerName]) => [
        handlerName,
        vi.fn(async input => new Response(JSON.stringify({ success: true, input }), {
            headers: { 'Content-Type': 'application/json' },
        })),
    ]));
}

function request(path, {
    method = 'POST',
    body = '{}',
    token = ADMIN_TOKEN,
    headers = {},
} = {}) {
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }
    if (token !== null) requestHeaders.set('Authorization', `Bearer ${token}`);
    return new Request(`${ORIGIN}${path}`, {
        method,
        headers: requestHeaders,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
}

async function responseTextAndLogs(response, consoleSpy) {
    const responseText = await response.text();
    const logText = consoleSpy.mock.calls.flat().map(value => {
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value); } catch { return String(value); }
    }).join('\n');
    return `${responseText}\n${logText}`;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('admin route security boundary', () => {
    it.each(ROUTES)('rejects non-POST requests for %s before the handler', async (path, handlerName) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, { method: 'GET' }), makeEnv(), handlers);

        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('rejects missing authorization for %s before the handler', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, {
            body: JSON.stringify(body),
            token: null,
        }), makeEnv(), handlers);

        expect(response.status).toBe(401);
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('rejects incorrect authorization for %s before the handler', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, {
            body: JSON.stringify(body),
            token: 'incorrect-token',
        }), makeEnv(), handlers);

        expect(response.status).toBe(401);
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('fails closed when ADMIN_API_TOKEN is missing for %s', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, { body: JSON.stringify(body) }), makeEnv({
            ADMIN_API_TOKEN: '',
        }), handlers);

        expect(response.status).toBe(503);
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('passes validated input unchanged to %s', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, { body: JSON.stringify(body) }), makeEnv(), handlers);

        expect(response.status).toBe(200);
        expect(handlers[handlerName]).toHaveBeenCalledOnce();
        expect(handlers[handlerName]).toHaveBeenCalledWith(body, expect.any(Object));
    });

    it('accepts every supported incremental batch', async () => {
        for (const batch of ['morning', 'afternoon', 'night', 'lateNight']) {
            const handlers = makeHandlers();
            const body = { date: '2026-07-14', batch };
            const response = await handleAdminRoute(request('/incrementalDaily', {
                body: JSON.stringify(body),
            }), makeEnv(), handlers);
            expect(response.status).toBe(200);
            expect(handlers.incrementalDaily).toHaveBeenCalledWith(body, expect.any(Object));
        }
    });

    it.each([
        ['wrong content type', '/auto', '{"date":"2026-07-14"}', { 'Content-Type': 'text/plain' }, 415],
        ['malformed JSON', '/auto', '{', {}, 400],
        ['extra field', '/auto', '{"unexpected":true}', {}, 400],
        ['invalid date format', '/auto', '{"date":"14-07-2026"}', {}, 400],
        ['invalid calendar date', '/auto', '{"date":"2026-02-30"}', {}, 400],
        ['invalid batch', '/incrementalDaily', '{"batch":"midday"}', {}, 400],
        ['missing scheduled slot', '/reconcileDaily', '{}', {}, 400],
        ['non-hour scheduled slot', '/reconcileDaily', '{"scheduled_at":"2026-07-14T02:01:00.000Z"}', {}, 400],
        ['non-production scheduled slot', '/reconcileDaily', '{"scheduled_at":"2026-07-14T03:00:00.000Z"}', {}, 400],
        ['invalid scheduled date', '/reconcileDaily', '{"scheduled_at":"2026-02-30T02:00:00.000Z"}', {}, 400],
        ['extra reconcile field', '/reconcileDaily', '{"scheduled_at":"2026-07-14T02:00:00.000Z","commit":"latest"}', {}, 400],
        ['missing RSS date', '/writeRssData', '{}', {}, 400],
        ['blank cookie', '/updateFoloCookie', '{"cookie":"   "}', {}, 400],
        ['cookie with a newline', '/updateFoloCookie', '{"cookie":"one\\ntwo"}', {}, 400],
        ['unexpected debug field', '/debugFoloCookie', '{"verbose":true}', {}, 400],
    ])('rejects %s before invoking a handler', async (_label, path, body, headers, status) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, { body, headers }), makeEnv(), handlers);

        expect(response.status).toBe(status);
        for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
    });

    it('rejects a declared oversized body', async () => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request('/auto', {
            body: '{}',
            headers: { 'Content-Length': '5000' },
        }), makeEnv(), handlers);

        expect(response.status).toBe(413);
        expect(handlers.auto).not.toHaveBeenCalled();
    });

    it('rejects an oversized streamed body without Content-Length', async () => {
        const handlers = makeHandlers();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(`{"date":"${'x'.repeat(5000)}"}`));
                controller.close();
            },
        });
        const streamedRequest = new Request(`${ORIGIN}/auto`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: stream,
            duplex: 'half',
        });
        const response = await handleAdminRoute(streamedRequest, makeEnv(), handlers);

        expect(response.status).toBe(413);
        expect(handlers.auto).not.toHaveBeenCalled();
    });

    it('rejects cookies longer than 16 KiB', async () => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request('/updateFoloCookie', {
            body: JSON.stringify({ cookie: 'x'.repeat(16385) }),
        }), makeEnv(), handlers);

        expect(response.status).toBe(400);
        expect(handlers.updateFoloCookie).not.toHaveBeenCalled();
    });

    it('allows same-origin authenticated sessions for Folo routes', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        for (const [path, handlerName, body] of SESSION_ROUTES) {
            const handlers = makeHandlers();
            const response = await handleAdminRoute(request(path, {
                body: JSON.stringify(body),
                token: null,
                headers: {
                    Origin: ORIGIN,
                    Cookie: `session_id_89757=${SESSION_ID}`,
                },
            }), makeEnv(), handlers);

            expect(response.status).toBe(200);
            expect(response.headers.get('Set-Cookie')).toContain('session_id_89757=');
            expect(handlers[handlerName]).toHaveBeenCalledOnce();
        }
        const output = consoleSpy.mock.calls.flat().join('\n');
        expect(output).not.toContain(SESSION_ID);
        expect(output).not.toContain(COOKIE_SECRET);
    });

    it.each(SESSION_ROUTES)('rejects cross-origin session requests for %s', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, {
            body: JSON.stringify(body),
            token: null,
            headers: {
                Origin: 'https://attacker.example',
                Cookie: `session_id_89757=${SESSION_ID}`,
            },
        }), makeEnv(), handlers);

        expect(response.status).toBe(403);
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it.each(SESSION_ROUTES)('does not require Origin for Bearer requests to %s', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, {
            body: JSON.stringify(body),
        }), makeEnv(), handlers);

        expect(response.status).toBe(200);
        expect(handlers[handlerName]).toHaveBeenCalledOnce();
    });

    it('returns 429 after the configured rate limit', async () => {
        const handlers = makeHandlers();
        let attempts = 0;
        const env = makeEnv({
            ADMIN_RATE_LIMITER: {
                limit: vi.fn(async () => ({ success: ++attempts === 1 })),
            },
        });
        const first = await handleAdminRoute(request('/auto'), env, handlers);
        const second = await handleAdminRoute(request('/auto'), env, handlers);

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(second.headers.get('Retry-After')).toBeTruthy();
        expect(handlers.auto).toHaveBeenCalledOnce();
    });

    it('fails closed when the distributed rate-limit binding is unavailable', async () => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request('/auto'), makeEnv({
            ADMIN_RATE_LIMITER: undefined,
        }), handlers);

        expect(response.status).toBe(503);
        expect(handlers.auto).not.toHaveBeenCalled();
    });

    it('returns 503 when the distributed rate-limit binding throws', async () => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request('/auto'), makeEnv({
            ADMIN_RATE_LIMITER: {
                limit: vi.fn(async () => { throw new Error('binding unavailable'); }),
            },
        }), handlers);

        expect(response.status).toBe(503);
        expect(handlers.auto).not.toHaveBeenCalled();
    });

    it('fails closed when the external-write switch is missing', async () => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request('/auto'), makeEnv({
            EXTERNAL_WRITES_ENABLED: undefined,
        }), handlers);

        expect(response.status).toBe(409);
        expect(handlers.auto).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('fails closed before %s when external actions are disabled', async (path, handlerName, body) => {
        const handlers = makeHandlers();
        const response = await handleAdminRoute(request(path, { body: JSON.stringify(body) }), makeEnv({
            EXTERNAL_WRITES_ENABLED: 'false',
        }), handlers);

        expect(response.status).toBe(409);
        expect(handlers[handlerName]).not.toHaveBeenCalled();
    });

    it('returns a generic 500 with a request ID and never logs credentials', async () => {
        const handlers = makeHandlers();
        handlers.auto.mockRejectedValueOnce(new Error(`failure ${ADMIN_TOKEN} ${COOKIE_SECRET}`));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const response = await handleAdminRoute(request('/auto'), makeEnv(), handlers);

        expect(response.status).toBe(500);
        expect(response.headers.get('X-Request-Id')).toBeTruthy();
        const output = await responseTextAndLogs(response, consoleSpy);
        expect(output).not.toContain(ADMIN_TOKEN);
        expect(output).not.toContain(COOKIE_SECRET);
        expect(output).not.toContain(SESSION_ID);
        expect(output).not.toContain('failure');
    });
});
