import {
    ProviderFetchError,
    assertProviderPositiveIntegerSetting,
    assertProviderUrl,
    normalizeProviderFailure,
    providerConfigurationError,
    providerHttpError,
    providerInvalidShapeError,
} from '../daily/providerFailure.js';

const DEFAULT_API_URL = 'https://api.x.ai/v1/responses';
const DEFAULT_MODEL = 'grok-4.5';
const DEFAULT_LOOKBACK_HOURS = '3';
const DEFAULT_RECONCILE_HOURS = '48';
const DEFAULT_RECONCILE_UTC_HOUR = '16';
const MAX_HANDLES_PER_REQUEST = 20;
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_PATH_PATTERN = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/;
const EXPLICIT_TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

export const GROK_X_RESPONSE_SCHEMA = Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['posts'],
    properties: {
        posts: {
            type: 'array',
            maxItems: 100,
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'post_id',
                    'handle',
                    'url',
                    'published_at',
                    'text',
                    'media_types',
                    'media_analysis',
                ],
                properties: {
                    post_id: { type: 'string', pattern: '^\\d+$' },
                    handle: { type: 'string', pattern: '^[A-Za-z0-9_]{1,15}$' },
                    url: { type: 'string' },
                    published_at: { type: 'string', format: 'date-time' },
                    text: { type: 'string', maxLength: 10000 },
                    media_types: {
                        type: 'array',
                        uniqueItems: true,
                        items: { type: 'string', enum: ['image', 'video'] },
                    },
                    media_analysis: { type: 'string', maxLength: 10000 },
                },
            },
        },
    },
});

function enabled(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function assertMediaUnderstandingEnabled(env) {
    if (
        !enabled(env.GROK_X_IMAGE_UNDERSTANDING)
        || !enabled(env.GROK_X_VIDEO_UNDERSTANDING)
    ) {
        throw new ProviderFetchError('invalid_config');
    }
}

function parseHandles(value) {
    const handles = [];
    const seen = new Set();
    for (const raw of String(value || '').split(',')) {
        const handle = raw.trim().replace(/^@/, '');
        if (!handle) continue;
        if (!HANDLE_PATTERN.test(handle)) throw new ProviderFetchError('invalid_config');
        const key = handle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        handles.push(handle);
    }
    return handles;
}

function blockedHandles(value) {
    return new Set(parseHandles(value).map(handle => handle.toLowerCase()));
}

export function chunkGrokXHandles(handles, size = MAX_HANDLES_PER_REQUEST) {
    if (!Array.isArray(handles) || !Number.isInteger(size) || size < 1 || size > MAX_HANDLES_PER_REQUEST) {
        throw new ProviderFetchError('invalid_config');
    }
    const chunks = [];
    for (let index = 0; index < handles.length; index += size) {
        chunks.push(handles.slice(index, index + size));
    }
    return chunks;
}

function parseUtcHour(value) {
    const raw = String(value ?? DEFAULT_RECONCILE_UTC_HOUR).trim();
    if (!/^\d{1,2}$/.test(raw)) throw new ProviderFetchError('invalid_config');
    const hour = Number(raw);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new ProviderFetchError('invalid_config');
    }
    return hour;
}

export function resolveGrokXWindow(env, runAt = new Date().toISOString()) {
    const end = new Date(runAt);
    if (Number.isNaN(end.getTime()) || !EXPLICIT_TIMEZONE_PATTERN.test(String(runAt))) {
        throw new ProviderFetchError('invalid_config');
    }
    const lookbackHours = assertProviderPositiveIntegerSetting(
        env.GROK_X_LOOKBACK_HOURS,
        DEFAULT_LOOKBACK_HOURS,
    );
    const reconcileHours = assertProviderPositiveIntegerSetting(
        env.GROK_X_RECONCILE_HOURS,
        DEFAULT_RECONCILE_HOURS,
    );
    const reconcileUtcHour = parseUtcHour(env.GROK_X_RECONCILE_UTC_HOUR);
    const hours = end.getUTCMinutes() === 0 && end.getUTCHours() === reconcileUtcHour
        ? reconcileHours
        : lookbackHours;
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    return {
        start,
        end,
        fromDate: start.toISOString().slice(0, 10),
        toDate: end.toISOString().slice(0, 10),
        hours,
    };
}

function requestPrompt(handles, window) {
    return [
        'Find every X post authored by the allowed handles in the exact UTC interval below.',
        `Interval: ${window.start.toISOString()} inclusive to ${window.end.toISOString()} exclusive.`,
        `Allowed handles: ${handles.map(handle => `@${handle}`).join(', ')}.`,
        'Do not include a post outside that exact interval or from another handle.',
        'Use the canonical post URL and its actual X publication timestamp.',
        'Return an empty posts array when there are no matching posts.',
        'For posts with images or video, summarize material visual information in media_analysis.',
        'Do not guess missing URLs, IDs, timestamps, text, or media details.',
    ].join('\n');
}

export function buildGrokXRequest(env, handles, window) {
    return {
        model: String(env.GROK_X_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
        input: [{
            role: 'user',
            content: requestPrompt(handles, window),
        }],
        tools: [{
            type: 'x_search',
            allowed_x_handles: handles,
            from_date: window.fromDate,
            to_date: window.toDate,
            enable_image_understanding: true,
            enable_video_understanding: true,
        }],
        text: {
            format: {
                type: 'json_schema',
                name: 'grok_x_posts',
                strict: true,
                schema: GROK_X_RESPONSE_SCHEMA,
            },
        },
    };
}

function responseOutputText(payload) {
    if (typeof payload?.output_text === 'string') return payload.output_text;
    for (const output of payload?.output || []) {
        if (output?.type !== 'message') continue;
        for (const content of output.content || []) {
            if (content?.type === 'output_text' && typeof content.text === 'string') {
                return content.text;
            }
        }
    }
    throw providerInvalidShapeError();
}

function normalizePost(post, allowedHandles, window) {
    if (!post || typeof post !== 'object' || Array.isArray(post)) {
        throw providerInvalidShapeError();
    }
    const allowedByLower = new Map(
        allowedHandles.map(handle => [handle.toLowerCase(), handle]),
    );
    let parsed;
    try {
        parsed = new URL(post.url);
    } catch {
        throw providerInvalidShapeError();
    }
    if (
        parsed.protocol !== 'https:'
        || !['x.com', 'www.x.com'].includes(parsed.hostname.toLowerCase())
        || parsed.username
        || parsed.password
    ) {
        throw providerInvalidShapeError();
    }
    const match = parsed.pathname.match(STATUS_PATH_PATTERN);
    if (!match) throw providerInvalidShapeError();
    const [, urlHandle, statusId] = match;
    const canonicalHandle = allowedByLower.get(urlHandle.toLowerCase());
    if (
        !canonicalHandle
        || String(post.handle || '').toLowerCase() !== urlHandle.toLowerCase()
        || String(post.post_id || '') !== statusId
    ) {
        throw providerInvalidShapeError();
    }
    if (
        typeof post.published_at !== 'string'
        || !EXPLICIT_TIMEZONE_PATTERN.test(post.published_at)
    ) {
        throw providerInvalidShapeError();
    }
    const publishedAt = new Date(post.published_at);
    if (
        Number.isNaN(publishedAt.getTime())
        || publishedAt < window.start
        || publishedAt >= window.end
    ) {
        throw providerInvalidShapeError();
    }
    if (
        typeof post.text !== 'string'
        || !Array.isArray(post.media_types)
        || post.media_types.some(type => !['image', 'video'].includes(type))
        || typeof post.media_analysis !== 'string'
        || (!post.text.trim() && !post.media_analysis.trim())
    ) {
        throw providerInvalidShapeError();
    }
    return {
        id: statusId,
        handle: canonicalHandle,
        url: `https://x.com/${canonicalHandle}/status/${statusId}`,
        text: post.text.trim(),
        publishedAt: publishedAt.toISOString(),
        mediaTypes: [...new Set(post.media_types)],
        mediaAnalysis: post.media_analysis.trim(),
    };
}

function parseGroupPayload(payload, handles, window) {
    let result;
    try {
        result = JSON.parse(responseOutputText(payload));
    } catch (error) {
        if (error instanceof ProviderFetchError) throw error;
        throw new ProviderFetchError('invalid_json');
    }
    if (
        !result
        || typeof result !== 'object'
        || Array.isArray(result)
        || Object.keys(result).some(key => key !== 'posts')
        || !Array.isArray(result.posts)
    ) {
        throw providerInvalidShapeError();
    }
    return result.posts.map(post => normalizePost(post, handles, window));
}

async function fetchGroup(env, handles, window, signal) {
    const apiUrl = assertProviderUrl(env.GROK_X_API_URL || DEFAULT_API_URL);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildGrokXRequest(env, handles, window)),
        signal,
    });
    if (!response.ok) throw providerHttpError(response.status);
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new ProviderFetchError('invalid_json');
    }
    return parseGroupPayload(payload, handles, window);
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    })[character]);
}

const GrokXDataSource = {
    async fetch(env, _foloCookie, { strict = false, signal, runAt } = {}) {
        if (!enabled(env.GROK_X_ENABLED)) {
            return { items: [], disabled: true };
        }
        try {
            if (!env.XAI_API_KEY) throw providerConfigurationError();
            assertMediaUnderstandingEnabled(env);
            const excluded = blockedHandles(env.X_BLOCKED_HANDLES);
            const handles = parseHandles(env.GROK_X_HANDLES)
                .filter(handle => !excluded.has(handle.toLowerCase()));
            if (handles.length === 0) throw providerConfigurationError();
            const window = resolveGrokXWindow(env, runAt || new Date().toISOString());
            const groups = chunkGrokXHandles(handles);
            const results = await Promise.all(
                groups.map(group => fetchGroup(env, group, window, signal)),
            );
            return {
                items: results.flat(),
                window: {
                    start: window.start.toISOString(),
                    end: window.end.toISOString(),
                    hours: window.hours,
                },
            };
        } catch (error) {
            if (strict) throw normalizeProviderFailure(error);
            console.error('Grok X fetch failed.');
            return { items: [] };
        }
    },

    transform(rawData, sourceType) {
        if (!Array.isArray(rawData?.items)) return [];
        return rawData.items.map(item => {
            const visualContext = item.mediaAnalysis
                ? `媒体内容：${item.mediaAnalysis}`
                : '';
            const description = [item.text, visualContext].filter(Boolean).join('\n\n');
            return {
                id: item.id,
                type: sourceType,
                url: item.url,
                title: item.text || item.mediaAnalysis,
                description,
                published_date: item.publishedAt,
                authors: item.handle,
                source: `X @${item.handle}`,
                details: {
                    content_html: escapeHtml(description).replace(/\n/g, '<br>'),
                    media_types: item.mediaTypes,
                    media_analysis: item.mediaAnalysis,
                },
            };
        });
    },
};

export default GrokXDataSource;
