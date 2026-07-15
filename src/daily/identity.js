import { getSourcePolicy } from './sourceRegistry.js';

const TRACKING_PARAMETERS = new Set([
    'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref_src',
]);

function isTrackingParameter(name) {
    const normalized = name.toLowerCase();
    return normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized);
}

function compareCodePoints(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

export function canonicalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let url;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';

    const parameters = Array.from(url.searchParams.entries())
        .filter(([name]) => !isTrackingParameter(name))
        .sort(([leftName, leftValue], [rightName, rightValue]) => {
            return compareCodePoints(leftName, rightName) || compareCodePoints(leftValue, rightValue);
        });
    url.search = '';
    for (const [name, parameterValue] of parameters) url.searchParams.append(name, parameterValue);
    return url.toString();
}

export function normalizeIdentityText(value) {
    return Array.from(String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ''))
        .slice(0, 500)
        .join('');
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

function isRootUrl(value) {
    if (!value) return false;
    const url = new URL(value);
    return url.pathname === '/' && !url.search;
}

export async function createIdentity({ provider, sourceId, canonicalUrl, title, publishedDate }) {
    const policy = getSourcePolicy(provider);
    if (!policy) throw new Error(`Unknown source provider: ${provider}`);

    const rawClaims = [];
    if (sourceId) rawClaims.push({ strategy: 'source_id', value: `source:${provider}:${sourceId}` });
    if (canonicalUrl && !isRootUrl(canonicalUrl)) {
        rawClaims.push({ strategy: 'canonical_url', value: `url:${canonicalUrl}` });
    }
    if (rawClaims.length === 0 && title && publishedDate) {
        const normalizedTitle = normalizeIdentityText(title);
        if (normalizedTitle) {
            rawClaims.push({
                strategy: 'fallback',
                value: `fallback:${provider}:${normalizedTitle}:${publishedDate}`,
            });
        }
    }
    if (rawClaims.length === 0) return null;

    const preferred = rawClaims.find(claim => claim.strategy === policy.primaryIdentity)
        || rawClaims.find(claim => claim.strategy === 'canonical_url')
        || rawClaims[0];
    const claims = await Promise.all(rawClaims.map(async claim => ({
        ...claim,
        digest: await sha256(claim.value),
    })));
    const primary = claims.find(claim => claim.value === preferred.value);

    return {
        id: `n_${primary.digest}`,
        eventId: `e_${primary.digest}`,
        strategy: primary.strategy,
        claims: claims.map(claim => `c_${claim.digest}`).sort(),
    };
}
