import { canonicalizeUrl, createIdentity } from './identity.js';
import { getSourcePolicy } from './sourceRegistry.js';
import { isExplicitInstant, isRealDate } from './time.js';

const BATCHES = new Set(['morning', 'afternoon', 'night', 'lateNight']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function cleanText(value, maxLength) {
    const cleaned = String(value || '')
        .normalize('NFC')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(cleaned).slice(0, maxLength).join('');
}

function normalizeSourceId(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) return null;
        return String(value);
    }
    const normalized = String(value).normalize('NFC').trim();
    if (!normalized || normalized.length > 512 || CONTROL_CHARACTERS.test(normalized)) return null;
    return normalized;
}

function beijingDate(instant) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function normalizePublishedTime(value) {
    if (value === null || value === undefined || value === '') {
        return { publishedAt: null, publishedDate: null, precision: 'inferred' };
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        if (isRealDate(text)) {
            return { publishedAt: null, publishedDate: text, precision: 'date_only' };
        }
    }
    if (!isExplicitInstant(value)) {
        return { publishedAt: null, publishedDate: null, precision: 'inferred' };
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return {
            publishedAt: parsed.toISOString(),
            publishedDate: beijingDate(parsed),
            precision: 'exact',
        };
    }
    return { publishedAt: null, publishedDate: null, precision: 'inferred' };
}

export async function normalizeSourceItem(raw, { provider, batch, runAt } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { accepted: false, reason: 'invalid_item' };
    }
    const policy = getSourcePolicy(provider);
    if (!policy) return { accepted: false, reason: 'unknown_provider' };
    if (!BATCHES.has(batch)) return { accepted: false, reason: 'invalid_batch' };

    const title = cleanText(raw.title, 500);
    if (!title) return { accepted: false, reason: 'missing_title' };

    const sourceIdInput = raw.source_id ?? raw.id ?? null;
    const sourceId = normalizeSourceId(sourceIdInput);
    if (sourceIdInput !== null && sourceIdInput !== undefined && sourceIdInput !== '' && sourceId === null) {
        return { accepted: false, reason: 'invalid_source_id' };
    }

    const originalUrl = canonicalizeUrl(raw.url || raw.link || raw.external_url);
    if (originalUrl && originalUrl.length > 8192) return { accepted: false, reason: 'url_too_long' };
    const { publishedAt, publishedDate, precision } = normalizePublishedTime(
        raw.published_at || raw.published_date || raw.date,
    );
    const identity = await createIdentity({
        provider,
        sourceId,
        canonicalUrl: originalUrl,
        title,
        publishedDate,
    });
    if (!identity) return { accepted: false, reason: 'missing_identity' };

    const ingested = new Date(runAt);
    if (Number.isNaN(ingested.getTime())) return { accepted: false, reason: 'invalid_run_at' };
    const sourceNameInput = typeof raw.source === 'string' ? raw.source : raw.source?.name;
    const sourceName = cleanText(sourceNameInput || provider, 200) || provider;
    const normalizedHomepage = canonicalizeUrl(raw.source?.homepage || raw.source_homepage);
    const homepage = normalizedHomepage?.length <= 8192 ? normalizedHomepage : null;

    return {
        accepted: true,
        item: {
            id: identity.id,
            event_id: identity.eventId,
            identity_version: 1,
            identity_strategy: identity.strategy,
            identity_claims: identity.claims,
            source_type: provider,
            content_type: policy.contentType,
            source_id: sourceId,
            title,
            url: originalUrl,
            canonical_url: originalUrl,
            source: {
                name: sourceName,
                id: sourceId,
                homepage,
            },
            published_at: publishedAt,
            published_date: publishedDate,
            ingested_at: ingested.toISOString(),
            time_precision: precision,
            batch,
            summary: cleanText(
                raw.summary || raw.description || raw.content_text || raw.content_html || raw.details?.content_html,
                5000,
            ),
            category: 'other',
            topics: [],
            featured: false,
            score: null,
            reason: null,
            related_source_ids: [],
        },
    };
}
