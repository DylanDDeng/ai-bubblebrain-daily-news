const RETRYABLE_HTTP_STATUSES = new Set([408, 429]);
const FAILURE_POLICIES = Object.freeze({
    missing_config: false,
    invalid_config: false,
    network: true,
    timeout: true,
    http_408: true,
    http_429: true,
    http_5xx: true,
    http_4xx: false,
    invalid_json: false,
    invalid_shape: false,
    provider_failure: false,
    transform_error: false,
});

function normalizeFailureCode(code) {
    return Object.hasOwn(FAILURE_POLICIES, code) ? code : 'provider_failure';
}

export class ProviderFetchError extends Error {
    constructor(code, { status = null } = {}) {
        const normalizedCode = normalizeFailureCode(code);
        super(normalizedCode);
        this.name = 'ProviderFetchError';
        this.code = normalizedCode;
        this.retryable = FAILURE_POLICIES[normalizedCode];
        this.status = Number.isInteger(status) ? status : null;
    }
}

export function providerConfigurationError() {
    return new ProviderFetchError('missing_config');
}

export function providerHttpError(status) {
    const normalizedStatus = Number.isInteger(status) ? status : null;
    if (normalizedStatus !== null && RETRYABLE_HTTP_STATUSES.has(normalizedStatus)) {
        return new ProviderFetchError(`http_${normalizedStatus}`, {
            retryable: true,
            status: normalizedStatus,
        });
    }
    if (normalizedStatus !== null && normalizedStatus >= 500) {
        return new ProviderFetchError('http_5xx', {
            retryable: true,
            status: normalizedStatus,
        });
    }
    return new ProviderFetchError('http_4xx', { status: normalizedStatus });
}

export function providerInvalidShapeError() {
    return new ProviderFetchError('invalid_shape');
}

export function assertProviderPositiveInteger(value) {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new ProviderFetchError('invalid_config');
    }
    return value;
}

export function assertProviderPositiveIntegerSetting(value, fallback) {
    const candidate = String(value === undefined || value === null || value === '' ? fallback : value).trim();
    if (!/^[1-9]\d*$/.test(candidate)) throw new ProviderFetchError('invalid_config');
    return assertProviderPositiveInteger(Number(candidate));
}

export function assertProviderUrl(value) {
    try {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol)) throw new Error('unsupported protocol');
        return url.toString();
    } catch {
        throw new ProviderFetchError('invalid_config');
    }
}

export function classifyProviderFailure(error) {
    if (error instanceof ProviderFetchError) {
        const code = normalizeFailureCode(error.code);
        return {
            code,
            retryable: FAILURE_POLICIES[code],
            status: error.status,
        };
    }
    if (error?.name === 'AbortError') {
        return { code: 'timeout', retryable: true, status: null };
    }
    if (error instanceof TypeError) {
        return { code: 'network', retryable: true, status: null };
    }
    if (error instanceof SyntaxError) {
        return { code: 'invalid_json', retryable: false, status: null };
    }
    return { code: 'provider_failure', retryable: false, status: null };
}

export function normalizeProviderFailure(error) {
    if (error instanceof ProviderFetchError) return error;
    const failure = classifyProviderFailure(error);
    return new ProviderFetchError(failure.code, failure);
}

export function assertFoloPayload(data, { requireFeeds = false } = {}) {
    if (!data || !Array.isArray(data.data)) throw providerInvalidShapeError();
    for (const entry of data.data) {
        if (!entry || typeof entry !== 'object'
            || !entry.entries || typeof entry.entries !== 'object'
            || !['string', 'number'].includes(typeof entry.entries.id)
            || typeof entry.entries.publishedAt !== 'string'
            || !entry.entries.publishedAt.trim()
            || !Number.isFinite(Date.parse(entry.entries.publishedAt))) {
            throw providerInvalidShapeError();
        }
        if (requireFeeds && (!entry.feeds || typeof entry.feeds.title !== 'string')) {
            throw providerInvalidShapeError();
        }
    }
    return data.data;
}
