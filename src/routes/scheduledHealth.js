import { readScheduledOutcome } from '../daily/runState.js';
import { SCHEDULE_HEALTH_PAGE_SIZE } from '../daily/scheduleContract.js';

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

function publicSourceResult(value) {
    const counts = {};
    for (const contentType of ['news', 'project', 'paper', 'socialMedia']) {
        const count = Number(value?.counts?.[contentType] || 0);
        counts[contentType] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }
    return {
        status: ['succeeded', 'failed', 'unknown'].includes(value?.status)
            ? value.status
            : 'unknown',
        completed_at: value?.completed_at || null,
        counts,
        ...(Number.isSafeInteger(value?.error_count)
            ? { error_count: value.error_count }
            : {}),
    };
}

function publicScheduledOutcome(marker, scheduledAt) {
    const status = ['started', 'succeeded', 'failed'].includes(marker?.status)
        ? marker.status
        : 'failed';
    return {
        scheduled_at: scheduledAt,
        run_id: /^scheduled:\d{13}$/.test(String(marker?.run_id || ''))
            ? marker.run_id
            : `scheduled:${Date.parse(scheduledAt)}`,
        status,
        stage: String(marker?.stage || (status === 'succeeded' ? 'workflow_completed' : status)),
        run_at: marker?.run_at || null,
        started_at: marker?.started_at || null,
        finished_at: marker?.finished_at || null,
        source_result: publicSourceResult(marker?.source_result),
        content_sha256: /^[a-f0-9]{64}$/.test(String(marker?.content_sha256 || ''))
            ? marker.content_sha256
            : null,
        no_op: marker?.no_op === true,
        database_mirror: {
            status: ['mirrored', 'disabled', 'failed', 'unknown'].includes(
                marker?.database_mirror?.status,
            )
                ? marker.database_mirror.status
                : 'unknown',
        },
        site_release_id: marker?.site_release_id || null,
        site_release_sequence: Number.isSafeInteger(marker?.site_release_sequence)
            ? marker.site_release_sequence
            : null,
        dispatch_id: marker?.dispatch_id || null,
        stable_verified_at: marker?.stable_verified_at || null,
        error_type: marker?.error_type || null,
        failure_stage: marker?.failure_stage || null,
    };
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
        scheduledAt.length > SCHEDULE_HEALTH_PAGE_SIZE ||
        new Set(scheduledAt).size !== scheduledAt.length ||
        scheduledAt.some(value => !validScheduledInstant(value))
    ) {
        return json({ success: false, error: 'Invalid scheduled slots' }, 400);
    }

    const slots = await Promise.all(scheduledAt.map(async scheduled_at => {
        const marker = await readScheduledOutcome(env.DATA_KV, scheduled_at);
        return marker
            ? publicScheduledOutcome(marker, scheduled_at)
            : {
                  scheduled_at,
                  run_id: `scheduled:${Date.parse(scheduled_at)}`,
                  status: 'missing',
                  stage: 'missing',
                  run_at: null,
                  started_at: null,
                  finished_at: null,
                  source_result: publicSourceResult(null),
                  content_sha256: null,
                  no_op: false,
                  database_mirror: { status: 'unknown' },
                  site_release_id: null,
                  site_release_sequence: null,
                  dispatch_id: null,
                  stable_verified_at: null,
                  error_type: null,
                  failure_stage: null,
              };
    }));
    return json({ success: true, slots });
}
