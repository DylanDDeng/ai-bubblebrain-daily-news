import { isAuthenticated } from '../auth.js';

const textEncoder = new TextEncoder();

async function tokenDigest(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

async function tokensMatch(received, expected) {
    const [receivedDigest, expectedDigest] = await Promise.all([
        tokenDigest(received),
        tokenDigest(expected),
    ]);

    let difference = 0;
    for (let index = 0; index < receivedDigest.length; index += 1) {
        difference |= receivedDigest[index] ^ expectedDigest[index];
    }
    return difference === 0;
}

function jsonError(status, error, headers = {}) {
    return new Response(JSON.stringify({ success: false, error }), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers,
        },
    });
}

function sameOrigin(request) {
    const origin = request.headers.get('Origin');
    return Boolean(origin) && origin === new URL(request.url).origin;
}

export async function authenticateAdminRequest(request, env, { allowSession = false } = {}) {
    const configuredToken = String(env.ADMIN_API_TOKEN || '');
    if (!configuredToken) {
        return {
            response: jsonError(503, 'Service unavailable'),
        };
    }

    const authorization = request.headers.get('Authorization');
    if (authorization !== null) {
        const match = authorization.match(/^Bearer\s+(\S+)$/i);
        if (!match || !(await tokensMatch(match[1], configuredToken))) {
            return {
                response: jsonError(401, 'Unauthorized', {
                    'WWW-Authenticate': 'Bearer',
                }),
            };
        }
        return { method: 'bearer', cookie: null };
    }

    if (!allowSession || !request.headers.get('Cookie')) {
        return {
            response: jsonError(401, 'Unauthorized', {
                'WWW-Authenticate': 'Bearer',
            }),
        };
    }

    if (!sameOrigin(request)) {
        return {
            response: jsonError(403, 'Forbidden'),
        };
    }

    const { authenticated, cookie } = await isAuthenticated(request, env);
    if (!authenticated) {
        return {
            response: jsonError(401, 'Unauthorized', {
                'WWW-Authenticate': 'Bearer',
            }),
        };
    }

    return { method: 'session', cookie };
}
