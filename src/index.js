import { handleWriteData } from './handlers/writeData.js';
import { handleGetContent } from './handlers/getContent.js';
import { handleGetContentHtml } from './handlers/getContentHtml.js';
import { handleGenAIContent, handleGenAIPodcastScript, handleGenAIDailyAnalysis } from './handlers/genAIContent.js';
import { handleCommitToGitHub } from './handlers/commitToGitHub.js';
import { handleRss } from './handlers/getRss.js';
import { handleWriteRssData } from './handlers/writeRssData.js';
import { dataSources } from './dataFetchers.js';
import { handleLogin, isAuthenticated, handleLogout } from './auth.js';
import { handleAutoWorkflow } from './handlers/autoWorkflow.js';
import {
    handleIncrementalDailyWorkflow,
    handleReconcileDailyWorkflow,
    runIncrementalDailyWorkflow,
} from './handlers/incrementalDailyWorkflow.js';
import { debugFoloCookie, storeFoloCookieToKV } from './folo.js';
import { handleAdminRoute, isAdminRoute } from './routes/adminRoutes.js';
import { logMissingConfig } from './logging.js';
import { storeFailureMarker, storeScheduledOutcome } from './daily/runState.js';
import { resolveScheduledRun } from './daily/scheduleContract.js';
import { SOURCE_REGISTRY } from './daily/sourceRegistry.js';
import { handleScheduledHealth } from './routes/scheduledHealth.js';
import { recordScheduledRunTrace } from '../workers/content/ingestion/mirror.ts';
import { replayOldestStructuredBacklog } from './daily/structuredWorkflow.js';
import { tokensMatch } from './security/adminAuth.js';

const SAFE_PROVIDER_NAMES = new Set(Object.keys(SOURCE_REGISTRY));
const SAFE_CONTENT_TYPES = new Set(['news', 'project', 'paper', 'socialMedia']);
const SAFE_FAILURE_STAGES = new Set(['fetch', 'transform']);
const SAFE_WORKFLOW_FAILURE_STAGES = new Set([
    'fetch',
    'build',
    'git_publish',
    'lock_release',
    'database_mirror',
    'unknown',
]);
const SAFE_PROVIDER_ERROR_CODES = new Set([
    'missing_config',
    'invalid_config',
    'network',
    'timeout',
    'http_408',
    'http_429',
    'http_5xx',
    'http_4xx',
    'invalid_json',
    'invalid_shape',
    'provider_failure',
    'transform_error',
]);

function jsonResponse(value, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(value), { ...init, headers });
}

const defaultAdminHandlers = {
    auto: (input, env) => handleAutoWorkflow(input, env),
    incrementalDaily: (input, env) => handleIncrementalDailyWorkflow(input, env),
    reconcileDaily: (input, env) => handleReconcileDailyWorkflow(input, env),
    writeRssData: (input, env) => handleWriteRssData(input, env),
    async updateFoloCookie({ cookie }, env) {
        const success = await storeFoloCookieToKV(env, cookie);
        return jsonResponse({
            success,
            message: success ? 'Cookie 已更新' : 'Cookie 为空',
        }, { status: success ? 200 : 400 });
    },
    async debugFoloCookie(_input, env) {
        const result = await debugFoloCookie(env);
        return jsonResponse({
            ...result,
            error: result.error ? 'Probe failed' : null,
        });
    },
};

function missingRuntimeConfig(env) {
    const platform = env.USE_MODEL_PLATFORM || 'GEMINI';
    const requiredEnvVars = [
        'DATA_KV', 'OPEN_TRANSLATE', 'USE_MODEL_PLATFORM',
        'GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME', 'GITHUB_BRANCH',
        'PODCAST_TITLE', 'PODCAST_BEGIN', 'PODCAST_END',
        'FOLO_COOKIE_KV_KEY', 'FOLO_DATA_API', 'FOLO_FILTER_DAYS',
        'AIBASE_FEED_ID', 'XIAOHU_FEED_ID', 'HGPAPERS_FEED_ID', 'TWITTER_LIST_ID',
        'AIBASE_FETCH_PAGES', 'XIAOHU_FETCH_PAGES', 'HGPAPERS_FETCH_PAGES', 'TWITTER_FETCH_PAGES',
    ];

    if (platform === 'GEMINI') {
        requiredEnvVars.push('GEMINI_API_KEY', 'GEMINI_API_URL', 'DEFAULT_GEMINI_MODEL');
    } else if (platform === 'OPEN') {
        requiredEnvVars.push('OPENAI_API_KEY', 'OPENAI_API_URL', 'DEFAULT_OPEN_MODEL');
    }

    if (!(env.LOGIN_USERNAME_SECRET || env.LOGIN_USERNAME)) requiredEnvVars.push('LOGIN_USERNAME_SECRET');
    if (!(env.LOGIN_PASSWORD_SECRET || env.LOGIN_PASSWORD)) requiredEnvVars.push('LOGIN_PASSWORD_SECRET');
    if (!env.LOGIN_RATE_LIMITER) requiredEnvVars.push('LOGIN_RATE_LIMITER');

    return requiredEnvVars.filter(variable => !env[variable]);
}

function configurationErrorResponse() {
    return new Response(`
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Service Unavailable</title></head>
        <body style="font-family: sans-serif; padding: 20px;"><h1>Service Unavailable</h1>
        <p>The service is temporarily unavailable. Please contact the administrator.</p></body></html>`, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}

function appendSessionCookie(response, cookie) {
    if (!cookie) return response;
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', cookie);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function safeSourceCounts(value) {
    const counts = {};
    for (const contentType of SAFE_CONTENT_TYPES) {
        const count = Number(value?.[contentType] || 0);
        counts[contentType] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }
    return counts;
}

function scheduledSuccessMarker(result, scheduled, startedAt, finishedAt) {
    const sourceResult = result?.source_result;
    const mirror = result?.database_mirror;
    return {
        success: true,
        status: 'succeeded',
        stage: String(result?.stage || 'workflow_completed'),
        trigger_type: 'scheduled',
        run_id: scheduled.run_id,
        run_at: scheduled.scheduled_at,
        started_at: startedAt,
        finished_at: finishedAt,
        source_result: {
            status: sourceResult?.status === 'succeeded' ? 'succeeded' : 'unknown',
            completed_at: sourceResult?.completed_at || null,
            counts: safeSourceCounts(sourceResult?.counts),
        },
        content_sha256: /^[a-f0-9]{64}$/.test(String(result?.content_sha256 || ''))
            ? result.content_sha256
            : null,
        no_op: result?.no_op === true || result?.noOp === true,
        database_mirror: {
            status: ['mirrored', 'disabled', 'failed'].includes(mirror?.status)
                ? mirror.status
                : 'unknown',
        },
        site_release_id: /^[0-9a-f-]{36}$/i.test(String(result?.site_release_id || ''))
            ? result.site_release_id
            : null,
        site_release_sequence: Number.isSafeInteger(result?.site_release_sequence)
            ? result.site_release_sequence
            : null,
        dispatch_id: /^[0-9a-f-]{36}$/i.test(String(result?.dispatch_id || ''))
            ? result.dispatch_id
            : null,
        stable_verified_at: result?.stable_verified_at || null,
    };
}

function scheduledFailureMarker(error, scheduled, startedAt) {
    const runAt = scheduled.scheduled_at;
    const subrequestBudgetExceeded = /too many subrequests|subrequest(?:s)? limit/i.test(
        String(error?.message || ''),
    );
    const sourceErrors = Array.isArray(error?.sourceErrors)
        ? error.sourceErrors.slice(0, 16).map(sourceError => ({
            provider: SAFE_PROVIDER_NAMES.has(sourceError?.provider)
                ? sourceError.provider
                : 'unknown',
            content_type: SAFE_CONTENT_TYPES.has(sourceError?.content_type)
                ? sourceError.content_type
                : 'unknown',
            stage: SAFE_FAILURE_STAGES.has(sourceError?.stage)
                ? sourceError.stage
                : 'unknown',
            error_type: SAFE_PROVIDER_ERROR_CODES.has(sourceError?.error_type)
                ? sourceError.error_type
                : 'provider_failure',
            attempts: Number.isInteger(sourceError?.attempts)
                && sourceError.attempts >= 1
                && sourceError.attempts <= 3
                ? sourceError.attempts
                : 1,
        }))
        : [];
    const evidence = error?.runEvidence || {};
    const sourceCounts = safeSourceCounts(
        error?.sourceCounts || evidence?.source_result?.counts,
    );
    return {
        success: false,
        status: 'failed',
        stage: error?.name === 'ScheduledDatabaseMirrorError'
            ? 'database_mirror_failed'
            : 'failed',
        trigger_type: 'scheduled',
        run_id: scheduled.run_id,
        run_at: runAt,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        error_type: subrequestBudgetExceeded
            ? 'subrequest_budget_exceeded'
            : error?.name === 'StructuredSourceFetchError'
                ? 'structured_source_fetch_failed'
                : error?.name === 'ScheduledDatabaseMirrorError'
                    ? 'database_mirror_failed'
                : 'scheduled_workflow_failed',
        failure_stage: SAFE_WORKFLOW_FAILURE_STAGES.has(error?.failureStage)
            ? error.failureStage
            : error?.name === 'StructuredSourceFetchError'
                ? 'fetch'
                : error?.name === 'AtomicGitConflictError' || error?.name === 'AtomicGitUncertainError'
                    ? 'git_publish'
                    : 'unknown',
        source_result: {
            status: 'failed',
            completed_at: evidence?.source_result?.completed_at || null,
            counts: sourceCounts,
            error_count: sourceErrors.length,
        },
        content_sha256: /^[a-f0-9]{64}$/.test(String(evidence?.content_sha256 || ''))
            ? evidence.content_sha256
            : null,
        no_op: evidence?.no_op === true,
        site_release_id: evidence?.site_release_id || null,
        site_release_sequence: evidence?.site_release_sequence || null,
        dispatch_id: evidence?.dispatch_id || null,
        stable_verified_at: null,
        ...(sourceErrors.length > 0 ? { source_errors: sourceErrors } : {}),
    };
}

async function recordScheduledFailure(env, triggerId, marker) {
    if (!env.DATA_KV || typeof env.DATA_KV.put !== 'function') return;
    try {
        await storeFailureMarker(env.DATA_KV, triggerId, marker);
    } catch (markerError) {
        console.warn('[Scheduled] failure marker write failed', {
            errorType: markerError?.name || 'Error',
        });
    }
}

async function recordScheduledOutcome(env, scheduledAt, marker) {
    if (!env.DATA_KV || typeof env.DATA_KV.put !== 'function') return;
    try {
        await storeScheduledOutcome(env.DATA_KV, scheduledAt, marker);
    } catch (markerError) {
        console.warn('[Scheduled] outcome marker write failed', {
            errorType: markerError?.name || 'Error',
        });
    }
}

async function recordScheduledDatabaseTrace(
    env,
    scheduledAt,
    eventType,
    marker,
    recorder,
) {
    try {
        await recorder(env, {
            runId: marker.run_id,
            scheduledAt,
            eventType,
            evidence: marker,
        });
    } catch (traceError) {
        console.warn('[Scheduled] database trace write failed', {
            errorType: traceError?.name || 'Error',
            eventType,
        });
    }
}

export function createWorker({
    adminHandlers = defaultAdminHandlers,
    backlogReplay = replayOldestStructuredBacklog,
    scheduledWorkflow = runIncrementalDailyWorkflow,
    scheduledTrace = recordScheduledRunTrace,
} = {}) {
    return {
        async fetch(request, env) {
            const url = new URL(request.url);
            const path = url.pathname;
            console.log(`Request received: ${request.method} ${path}`);

            if (path === '/health/scheduled') {
                return handleScheduledHealth(request, env);
            }

            if (path === '/internal/backlog/replay') {
                const receivedSecret = request.headers.get('X-Content-Backlog-Secret') || '';
                if (
                    request.method !== 'POST' ||
                    !env.CONTENT_BACKLOG_REPLAY_SECRET ||
                    !(await tokensMatch(receivedSecret, env.CONTENT_BACKLOG_REPLAY_SECRET))
                ) {
                    return jsonResponse({ success: false, error: 'Unauthorized' }, {
                        status: 401,
                    });
                }
                const result = await backlogReplay(env);
                const retryable = ['blocked', 'locked', 'deferred'].includes(result.status);
                return jsonResponse({ success: !retryable, retryable, ...result }, {
                    status: retryable ? 409 : 200,
                });
            }

            if (isAdminRoute(path)) {
                return handleAdminRoute(request, env, adminHandlers);
            }

            const missingVars = missingRuntimeConfig(env);
            if (missingVars.length > 0) {
                logMissingConfig(missingVars);
                return configurationErrorResponse();
            }

            try {
                if (path === '/login') {
                    return await handleLogin(request, env);
                }
                if (path === '/logout') {
                    return await handleLogout(request, env);
                }
                if (path === '/getContent' && request.method === 'GET') {
                    return await handleGetContent(request, env);
                }
                if (path.startsWith('/rss') && request.method === 'GET') {
                    return await handleRss(request, env);
                }

                const { authenticated, cookie: newCookie } = await isAuthenticated(request, env);
                if (!authenticated) {
                    const loginUrl = new URL('/login', url.origin);
                    loginUrl.searchParams.set('redirect', url.pathname + url.search);
                    return Response.redirect(loginUrl.toString(), 302);
                }

                let response;
                if (path === '/' && request.method === 'GET') {
                    return Response.redirect(new URL('/getContentHtml', url.origin).toString(), 302);
                }
                if (path === '/writeData' && request.method === 'POST') {
                    response = await handleWriteData(request, env);
                } else if (path === '/getContentHtml' && request.method === 'GET') {
                    const dataCategories = Object.keys(dataSources).map(key => ({
                        id: key,
                        name: dataSources[key].name,
                    }));
                    response = await handleGetContentHtml(request, env, dataCategories);
                } else if (path === '/genAIContent' && request.method === 'POST') {
                    response = await handleGenAIContent(request, env);
                } else if (path === '/genAIPodcastScript' && request.method === 'POST') {
                    response = await handleGenAIPodcastScript(request, env);
                } else if (path === '/genAIDailyAnalysis' && request.method === 'POST') {
                    response = await handleGenAIDailyAnalysis(request, env);
                } else if (path === '/commitToGitHub' && request.method === 'POST') {
                    response = await handleCommitToGitHub(request, env);
                } else {
                    return new Response(null, {
                        status: 404,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                    });
                }

                return appendSessionCookie(response, newCookie);
            } catch (error) {
                console.error('[WorkerFetch] unhandled request error', {
                    path,
                    errorType: error?.name || 'Error',
                });
                return new Response('Internal Server Error', { status: 500 });
            }
        },

        async scheduled(event, env, ctx) {
            console.log(`Scheduled event triggered at: ${new Date(event.scheduledTime).toISOString()}`);
            if (String(env.EXTERNAL_WRITES_ENABLED).toLowerCase() !== 'true') {
                console.warn('[Scheduled] external writes are disabled; workflow skipped');
                return;
            }
            const scheduled = resolveScheduledRun(event.scheduledTime);
            const triggerId = scheduled.run_id;
            const runAt = scheduled.scheduled_at;
            const startedAt = new Date().toISOString();
            const workflow = Promise.resolve()
                .then(async () => {
                    const started = {
                        success: null,
                        status: 'started',
                        stage: 'started',
                        trigger_type: 'scheduled',
                        run_id: triggerId,
                        run_at: runAt,
                        started_at: startedAt,
                        finished_at: null,
                        stable_verified_at: null,
                    };
                    await Promise.all([
                        recordScheduledOutcome(env, runAt, started),
                        recordScheduledDatabaseTrace(
                            env,
                            runAt,
                            'started',
                            started,
                            scheduledTrace,
                        ),
                    ]);
                })
                .then(() => scheduledWorkflow(env, { triggerId, runAt }))
                .then(async result => {
                    const terminal = scheduledSuccessMarker(
                        result,
                        scheduled,
                        startedAt,
                        new Date().toISOString(),
                    );
                    if (
                        String(env.CONTENT_DATABASE_MIRROR_ENABLED).toLowerCase() === 'true' &&
                        terminal.database_mirror.status !== 'mirrored'
                    ) {
                        const error = new Error('Scheduled database mirror did not complete');
                        error.name = 'ScheduledDatabaseMirrorError';
                        error.failureStage = 'database_mirror';
                        error.runEvidence = terminal;
                        throw error;
                    }
                    await recordScheduledDatabaseTrace(
                        env,
                        runAt,
                        'succeeded',
                        terminal,
                        scheduledTrace,
                    );
                    await recordScheduledOutcome(env, runAt, terminal);
                    return result;
                })
                .catch(async error => {
                    const marker = scheduledFailureMarker(error, scheduled, startedAt);
                    console.error('[Scheduled] workflow failed', {
                        errorType: marker.error_type,
                        failureStage: marker.failure_stage,
                        sourceErrors: Array.isArray(marker.source_errors)
                            ? marker.source_errors.map(sourceError => ({
                                provider: sourceError.provider,
                                contentType: sourceError.content_type,
                                stage: sourceError.stage,
                                errorType: sourceError.error_type,
                                attempts: sourceError.attempts,
                            }))
                            : [],
                    });
                    await recordScheduledDatabaseTrace(
                        env,
                        runAt,
                        'failed',
                        marker,
                        scheduledTrace,
                    );
                    await recordScheduledFailure(env, triggerId, marker);
                    await recordScheduledOutcome(env, runAt, marker);
                    throw error;
                });
            ctx.waitUntil(workflow);
        },
    };
}

export default createWorker();
