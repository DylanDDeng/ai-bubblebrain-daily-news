const LEASE_TTL_SECONDS = 10 * 60;
const MARKER_TTL_SECONDS = 14 * 24 * 60 * 60;
const SCHEDULED_SLOT_PREFIX = 'scheduled:outcome:';

async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(kv, key) {
    const value = await kv.get(key);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function scheduledSlotInstant(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setUTCSeconds(0, 0);
    return parsed.toISOString();
}

export function scheduledOutcomeKey(value) {
    const instant = scheduledSlotInstant(value);
    return instant ? `${SCHEDULED_SLOT_PREFIX}${instant}` : null;
}

export async function readScheduledOutcome(kv, scheduledAt) {
    const key = scheduledOutcomeKey(scheduledAt);
    return key ? readJson(kv, key) : null;
}

export async function storeScheduledOutcome(kv, scheduledAt, marker) {
    const key = scheduledOutcomeKey(scheduledAt);
    if (!key) return false;
    await kv.put(key, JSON.stringify({
        scheduled_at: scheduledSlotInstant(scheduledAt),
        ...marker,
    }), { expirationTtl: MARKER_TTL_SECONDS });
    return true;
}

export async function acquireAdvisoryLease(kv, { reportDate, batch, now }) {
    const key = `structured:lease:${reportDate}:${batch}`;
    const owner = crypto.randomUUID();
    const nowMs = new Date(now).getTime();
    const existing = await readJson(kv, key);
    if (existing?.expires_at && new Date(existing.expires_at).getTime() > nowMs) {
        return { acquired: false, key, owner: null };
    }
    const lease = {
        owner,
        acquired_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + LEASE_TTL_SECONDS * 1000).toISOString(),
    };
    await kv.put(key, JSON.stringify(lease), { expirationTtl: LEASE_TTL_SECONDS });
    const observed = await readJson(kv, key);
    return { acquired: observed?.owner === owner, key, owner };
}

export async function releaseAdvisoryLease(kv, lease) {
    if (!lease?.owner) return false;
    const observed = await readJson(kv, lease.key);
    if (observed?.owner !== lease.owner) return false;
    await kv.delete(lease.key);
    return true;
}

export async function triggerMarkerKey(triggerId) {
    if (!triggerId) return null;
    return `structured:trigger:${await digest(String(triggerId))}`;
}

export async function failureMarkerKey(triggerId) {
    if (!triggerId) return null;
    return `structured:attempt-failure:${await digest(String(triggerId))}`;
}

export async function readTriggerMarker(kv, triggerId) {
    const key = await triggerMarkerKey(triggerId);
    return key ? readJson(kv, key) : null;
}

export async function storeTriggerMarker(kv, triggerId, marker) {
    const key = await triggerMarkerKey(triggerId);
    if (!key) return false;
    await kv.put(key, JSON.stringify(marker), { expirationTtl: MARKER_TTL_SECONDS });
    return true;
}

export async function storeFailureMarker(kv, triggerId, marker) {
    const key = await failureMarkerKey(triggerId);
    if (!key) return false;
    await kv.put(key, JSON.stringify(marker), { expirationTtl: MARKER_TTL_SECONDS });
    return true;
}
