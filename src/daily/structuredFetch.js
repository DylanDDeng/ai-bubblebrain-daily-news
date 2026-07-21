import { STRUCTURED_SOURCE_ADAPTERS } from './sourceAdapters.js';
import { classifyProviderFailure } from './providerFailure.js';
import { filterBlockedSourceItems } from '../sourceFilters.js';

const CONTENT_TYPE_ORDER = ['news', 'project', 'paper', 'socialMedia'];
const DEFAULT_FETCH_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
// Folo pagination plus the chat client's own 60-second translation deadline must fit in one attempt.
export const DEFAULT_FETCH_TIMEOUT_MS = 90_000;

function cappedProviderEnvironment(env, fetchPageCap) {
    if (fetchPageCap === null || fetchPageCap === undefined) return env;
    if (!Number.isInteger(fetchPageCap) || fetchPageCap < 1 || fetchPageCap > 10) {
        throw new Error('Structured fetch page cap must be between one and ten');
    }
    return new Proxy(env, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== 'string' || !property.endsWith('_FETCH_PAGES')) {
                return value;
            }
            const configured = Number.parseInt(String(value || fetchPageCap), 10);
            return String(Math.min(
                Number.isInteger(configured) && configured > 0 ? configured : fetchPageCap,
                fetchPageCap,
            ));
        },
    });
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchWithDeadline(adapter, env, foloCookie, timeoutMs) {
    const controller = new AbortController();
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            const error = new Error('Provider attempt timed out');
            error.name = 'AbortError';
            reject(error);
        }, timeoutMs);
    });
    try {
        return await Promise.race([
            adapter.fetch(env, foloCookie, { strict: true, signal: controller.signal }),
            timeout,
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function fetchProviderPreservingData(env, foloCookie, {
    adapters = STRUCTURED_SOURCE_ADAPTERS,
    fetchPageCap = null,
    fetchAttempts = DEFAULT_FETCH_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    sleep = wait,
} = {}) {
    if (!Number.isInteger(fetchAttempts) || fetchAttempts < 1 || fetchAttempts > 3) {
        throw new Error('Structured fetch attempts must be between one and three');
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 30_000) {
        throw new Error('Structured retry delay must be between zero and thirty seconds');
    }
    if (!Number.isFinite(fetchTimeoutMs) || fetchTimeoutMs < 1 || fetchTimeoutMs > 120_000) {
        throw new Error('Structured fetch timeout must be between one millisecond and two minutes');
    }

    const taggedByType = Object.fromEntries(CONTENT_TYPE_ORDER.map(type => [type, []]));
    const errors = [];
    const providerEnv = cappedProviderEnvironment(env, fetchPageCap);

    for (const entry of adapters) {
        if (!taggedByType[entry.contentType]) {
            throw new Error(`Unknown structured content type: ${entry.contentType}`);
        }

        let raw;
        let fetchError = null;
        let attemptsUsed = 0;
        for (let attempt = 1; attempt <= fetchAttempts; attempt += 1) {
            attemptsUsed = attempt;
            try {
                raw = await fetchWithDeadline(
                    entry.adapter,
                    providerEnv,
                    foloCookie,
                    fetchTimeoutMs,
                );
                fetchError = null;
                break;
            } catch (error) {
                fetchError = error;
                const failure = classifyProviderFailure(error);
                console.warn('[StructuredFetch] provider fetch attempt failed', {
                    provider: entry.provider,
                    contentType: entry.contentType,
                    attempt,
                    maxAttempts: fetchAttempts,
                    errorCode: failure.code,
                    retryable: failure.retryable,
                });
                if (!failure.retryable || attempt >= fetchAttempts) break;
                await sleep(retryDelayMs * attempt);
            }
        }

        if (fetchError) {
            const failure = classifyProviderFailure(fetchError);
            errors.push({
                provider: entry.provider,
                content_type: entry.contentType,
                stage: 'fetch',
                error_type: failure.code,
                attempts: attemptsUsed,
            });
            continue;
        }

        try {
            const transformed = filterBlockedSourceItems(
                entry.adapter.transform(raw, entry.contentType, { strict: true }),
                entry.contentType,
                env,
            );
            if (!Array.isArray(transformed)) throw new Error('Adapter transform must return an array');
            taggedByType[entry.contentType].push(...transformed.map(item => ({
                provider: entry.provider,
                item,
            })));
        } catch (error) {
            errors.push({
                provider: entry.provider,
                content_type: entry.contentType,
                stage: 'transform',
                error_type: 'transform_error',
                attempts: 1,
            });
        }
    }

    const grouped = {};
    const structuredItems = [];
    for (const contentType of CONTENT_TYPE_ORDER) {
        const tagged = taggedByType[contentType];
        // Keep the exact legacy comparator semantics: invalid dates produce NaN,
        // which stable Array#sort treats as equality instead of moving the item.
        tagged.sort((left, right) => (
            new Date(right.item?.published_date).getTime()
            - new Date(left.item?.published_date).getTime()
        ));
        grouped[contentType] = tagged.map(entry => entry.item);
        structuredItems.push(...tagged.map(entry => ({
            ...entry.item,
            provider: entry.provider,
        })));
    }

    return {
        grouped,
        structuredItems,
        errors,
        sourceCounts: Object.fromEntries(
            CONTENT_TYPE_ORDER.map(type => [type, grouped[type].length]),
        ),
    };
}
