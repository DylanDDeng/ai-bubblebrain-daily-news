import { readScheduledOutcome } from '../daily/runState.js';

const MAX_SLOTS = 16;

async function tokenDigest(value) {
    return new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(value || '')),
    ));
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

function json(value, status = 200, headers = {}) {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            ...headers,
        },
    });
}

function validScheduledInstant(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value)) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export async function handleScheduledHealth(request, env) {
    if (request.method !== 'GET') {
        return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET' });
    }
    if (!env.DATA_KV || !env.SCHEDULE_HEALTH_TOKEN) {
        return json({ success: false, error: 'Service unavailable' }, 503);
    }
    const received = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
    if (!(await tokensMatch(received, env.SCHEDULE_HEALTH_TOKEN))) {
        return json({ success: false, error: 'Unauthorized' }, 401, {
            'WWW-Authenticate': 'Bearer',
        });
    }

    const scheduledAt = new URL(request.url).searchParams.getAll('scheduled_at');
    if (
        scheduledAt.length < 1 ||
        scheduledAt.length > MAX_SLOTS ||
        new Set(scheduledAt).size !== scheduledAt.length ||
        scheduledAt.some(value => !validScheduledInstant(value))
    ) {
        return json({ success: false, error: 'Invalid scheduled slots' }, 400);
    }

    const slots = await Promise.all(scheduledAt.map(async scheduled_at => {
        const marker = await readScheduledOutcome(env.DATA_KV, scheduled_at);
        return marker
            ? {
                  scheduled_at,
                  status: marker.status === 'succeeded' ? 'succeeded' : 'failed',
                  run_at: marker.run_at || null,
                  error_type: marker.error_type || null,
                  failure_stage: marker.failure_stage || null,
              }
            : { scheduled_at, status: 'missing', run_at: null, error_type: null, failure_stage: null };
    }));
    return json({ success: true, slots });
}
