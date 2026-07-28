import { STRUCTURED_SOURCE_ADAPTERS } from './sourceAdapters.js';
import { classifyProviderFailure } from './providerFailure.js';
import { filterBlockedSourceItems } from '../sourceFilters.js';
import {
    checkFoloNewEntries,
    filterFoloIncrementalItems,
    publicFoloIncrementalEvidence,
} from './foloIncremental.js';

const CONTENT_TYPE_ORDER = ['news', 'project', 'paper', 'socialMedia'];
const DEFAULT_FETCH_ATTEMPTS = 2;
export const DEFAULT_RETRY_BUDGET = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_INCREMENTAL_LOOKBACK_DAYS = 14;
const DEFAULT_INCREMENTAL_DEEP_SCAN_PAGES = 5;
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

function boundedInteger(value, fallback, minimum, maximum, label) {
    const raw = String(value ?? fallback).trim();
    if (!/^\d+$/.test(raw)) {
        throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }
    const candidate = Number(raw);
    if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
        throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }
    return candidate;
}

function incrementalProviderEnvironment(
    env,
    entry,
    plan,
    {
        allowPageExpansion,
        probeHasNew,
    },
) {
    if (!entry.foloScope || !['incremental', 'reconcile'].includes(plan?.mode)) return env;
    const lookbackDays = boundedInteger(
        env.FOLO_INCREMENTAL_LOOKBACK_DAYS,
        DEFAULT_INCREMENTAL_LOOKBACK_DAYS,
        3,
        90,
        'FOLO_INCREMENTAL_LOOKBACK_DAYS',
    );
    const deepScanPages = boundedInteger(
        env.FOLO_INCREMENTAL_DEEP_SCAN_PAGES,
        DEFAULT_INCREMENTAL_DEEP_SCAN_PAGES,
        1,
        10,
        'FOLO_INCREMENTAL_DEEP_SCAN_PAGES',
    );
    const expandPages = allowPageExpansion
        && (plan.mode === 'reconcile' || probeHasNew === true);
    return new Proxy(env, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== 'string') return value;
            if (property.endsWith('_FILTER_DAYS')) {
                const configured = Number.parseInt(String(value || lookbackDays), 10);
                return String(Math.max(
                    Number.isInteger(configured) && configured > 0 ? configured : lookbackDays,
                    lookbackDays,
                ));
            }
            if (expandPages && property === entry.foloScope.pageEnv) {
                const configured = Number.parseInt(String(value || deepScanPages), 10);
                return String(Math.max(
                    Number.isInteger(configured) && configured > 0 ? configured : deepScanPages,
                    deepScanPages,
                ));
            }
            return value;
        },
    });
}

async function fetchWithDeadline(
    entry,
    env,
    foloCookie,
    timeoutMs,
    {
        foloIncrementalPlan,
        probeCache,
        allowPageExpansion,
        runAt,
    },
) {
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
        const providerFetch = async () => {
            let probeHasNew = null;
            if (entry.foloScope && foloIncrementalPlan?.mode === 'incremental') {
                const scopeKey = entry.foloScope.kind === 'feed'
                    ? `feed:${entry.foloScope.idEnv}`
                    : 'global';
                if (!probeCache.has(scopeKey)) {
                    probeCache.set(scopeKey, checkFoloNewEntries(
                        env,
                        foloCookie,
                        entry.foloScope,
                        foloIncrementalPlan,
                        {
                            signal: controller.signal,
                            capabilityCache: probeCache,
                        },
                    ));
                }
                probeHasNew = await probeCache.get(scopeKey);
                if (probeHasNew === false) return { skipped: true, raw: null };
            }
            const adapterEnv = incrementalProviderEnvironment(
                env,
                entry,
                foloIncrementalPlan,
                { allowPageExpansion, probeHasNew },
            );
            return {
                skipped: false,
                raw: await entry.adapter.fetch(
                    adapterEnv,
                    foloCookie,
                    { strict: true, signal: controller.signal, runAt },
                ),
            };
        };
        return await Promise.race([
            providerFetch(),
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
    retryBudget = Number.parseInt(
        String(env.DAILY_SOURCE_RETRY_BUDGET ?? DEFAULT_RETRY_BUDGET),
        10,
    ),
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    sleep = wait,
    foloIncrementalPlan = {
        enabled: false,
        mode: 'disabled',
        run_at: null,
        inserted_after: null,
        inserted_after_ms: null,
        previous_checkpoint_at: null,
    },
    runAt = foloIncrementalPlan?.run_at || new Date().toISOString(),
} = {}) {
    if (!Number.isInteger(fetchAttempts) || fetchAttempts < 1 || fetchAttempts > 3) {
        throw new Error('Structured fetch attempts must be between one and three');
    }
    if (!Number.isInteger(retryBudget) || retryBudget < 0 || retryBudget > DEFAULT_RETRY_BUDGET) {
        throw new Error(`Structured retry budget must be between zero and ${DEFAULT_RETRY_BUDGET}`);
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 30_000) {
        throw new Error('Structured retry delay must be between zero and thirty seconds');
    }
    if (!Number.isFinite(fetchTimeoutMs) || fetchTimeoutMs < 1 || fetchTimeoutMs > 120_000) {
        throw new Error('Structured fetch timeout must be between one millisecond and two minutes');
    }

    const taggedByType = Object.fromEntries(CONTENT_TYPE_ORDER.map(type => [type, []]));
    const errors = [];
    const warnings = [];
    const providerEnv = cappedProviderEnvironment(env, fetchPageCap);
    const retryProviderEnv = cappedProviderEnvironment(providerEnv, 1);
    let retriesRemaining = retryBudget;
    const probeCache = new Map();
    let skippedProviderCount = 0;
    let scannedCount = 0;
    let emittedCount = 0;
    let missingInsertedAtCount = 0;

    for (const entry of adapters) {
        if (!taggedByType[entry.contentType]) {
            throw new Error(`Unknown structured content type: ${entry.contentType}`);
        }

        let raw;
        let fetchError = null;
        let attemptsUsed = 0;
        let skipped = false;
        for (let attempt = 1; attempt <= fetchAttempts; attempt += 1) {
            attemptsUsed = attempt;
            try {
                const fetched = await fetchWithDeadline(
                    entry,
                    attempt === 1 ? providerEnv : retryProviderEnv,
                    foloCookie,
                    fetchTimeoutMs,
                    {
                        foloIncrementalPlan,
                        probeCache,
                        allowPageExpansion: (
                            attempt === 1
                            && (fetchPageCap === null || fetchPageCap === undefined)
                        ),
                        runAt,
                    },
                );
                raw = fetched.raw;
                skipped = fetched.skipped;
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
                if (
                    !failure.retryable ||
                    attempt >= fetchAttempts ||
                    retriesRemaining < 1
                ) break;
                retriesRemaining -= 1;
                await sleep(retryDelayMs * attempt);
            }
        }

        if (fetchError) {
            const failure = classifyProviderFailure(fetchError);
            const failureRecord = {
                provider: entry.provider,
                content_type: entry.contentType,
                stage: 'fetch',
                error_type: failure.code,
                attempts: attemptsUsed,
            };
            (entry.nonBlocking ? warnings : errors).push(failureRecord);
            continue;
        }
        if (skipped) {
            skippedProviderCount += 1;
            continue;
        }

        try {
            const transformedAll = filterBlockedSourceItems(
                entry.adapter.transform(raw, entry.contentType, { strict: true }),
                entry.contentType,
                env,
            );
            const incremental = entry.foloScope
                ? filterFoloIncrementalItems(transformedAll, foloIncrementalPlan)
                : {
                      items: transformedAll,
                      scannedCount: transformedAll.length,
                      missingInsertedAtCount: 0,
                  };
            const transformed = incremental.items;
            if (entry.foloScope) {
                scannedCount += incremental.scannedCount;
                emittedCount += transformed.length;
                missingInsertedAtCount += incremental.missingInsertedAtCount;
            }
            if (!Array.isArray(transformed)) throw new Error('Adapter transform must return an array');
            taggedByType[entry.contentType].push(...transformed.map(item => ({
                provider: entry.provider,
                item,
            })));
        } catch (error) {
            const failureRecord = {
                provider: entry.provider,
                content_type: entry.contentType,
                stage: 'transform',
                error_type: 'transform_error',
                attempts: 1,
            };
            (entry.nonBlocking ? warnings : errors).push(failureRecord);
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
        warnings,
        foloIncrementalPlan,
        foloIncremental: publicFoloIncrementalEvidence(foloIncrementalPlan, {
            skippedProviderCount,
            scannedCount,
            emittedCount,
            missingInsertedAtCount,
        }),
        sourceCounts: Object.fromEntries(
            CONTENT_TYPE_ORDER.map(type => [type, grouped[type].length]),
        ),
    };
}
