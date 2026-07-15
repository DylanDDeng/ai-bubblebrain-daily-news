import { parseAdminJsonRequest, AdminRequestError } from '../http/adminRequest.js';
import { createRequestId, logAdminError } from '../logging.js';
import { authenticateAdminRequest } from '../security/adminAuth.js';
import { checkAdminRateLimit } from '../security/adminRateLimit.js';

const ADMIN_ROUTES = {
    '/auto': { handler: 'auto', allowSession: false, requiresExternalWrites: true },
    '/incrementalDaily': { handler: 'incrementalDaily', allowSession: false, requiresExternalWrites: true },
    '/writeRssData': { handler: 'writeRssData', allowSession: false, requiresExternalWrites: true },
    '/updateFoloCookie': { handler: 'updateFoloCookie', allowSession: true, requiresExternalWrites: true },
    '/debugFoloCookie': { handler: 'debugFoloCookie', allowSession: true, requiresExternalWrites: true },
};

function jsonError(status, error, requestId, headers = {}) {
    return new Response(JSON.stringify({ success: false, error, requestId }), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Request-Id': requestId,
            ...headers,
        },
    });
}

function withResponseHeaders(response, requestId, sessionCookie) {
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    if (sessionCookie) headers.append('Set-Cookie', sessionCookie);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export function isAdminRoute(path) {
    return Object.hasOwn(ADMIN_ROUTES, path);
}

export async function handleAdminRoute(request, env, handlers) {
    const route = new URL(request.url).pathname;
    const definition = ADMIN_ROUTES[route];
    if (!definition) return null;

    const requestId = createRequestId(request);
    if (request.method !== 'POST') {
        return jsonError(405, 'Method not allowed', requestId, { Allow: 'POST' });
    }

    try {
        const auth = await authenticateAdminRequest(request, env, {
            allowSession: definition.allowSession,
        });
        if (auth.response) return withResponseHeaders(auth.response, requestId);

        const rateLimit = await checkAdminRateLimit(request, env, route);
        if (rateLimit.unavailable) {
            return jsonError(503, 'Service unavailable', requestId);
        }
        if (!rateLimit.allowed) {
            return jsonError(429, 'Too many requests', requestId, {
                'Retry-After': String(rateLimit.retryAfter),
            });
        }

        const input = await parseAdminJsonRequest(request, route);

        if (definition.requiresExternalWrites && String(env.EXTERNAL_WRITES_ENABLED).toLowerCase() !== 'true') {
            return jsonError(409, 'External writes are disabled', requestId);
        }

        const handler = handlers[definition.handler];
        if (typeof handler !== 'function') throw new Error('Admin handler unavailable');
        const response = await handler(input, env);
        return withResponseHeaders(response, requestId, auth.cookie);
    } catch (error) {
        if (error instanceof AdminRequestError) {
            return jsonError(error.status, error.message, requestId);
        }
        logAdminError({ requestId, route, error });
        return jsonError(500, 'Internal server error', requestId);
    }
}
