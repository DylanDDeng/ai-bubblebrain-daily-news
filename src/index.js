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
import { handleIncrementalDailyWorkflow, runIncrementalDailyWorkflow } from './handlers/incrementalDailyWorkflow.js';
import { debugFoloCookie, storeFoloCookieToKV } from './folo.js';
import { handleAdminRoute, isAdminRoute } from './routes/adminRoutes.js';
import { logMissingConfig } from './logging.js';
import { storeFailureMarker, storeScheduledOutcome } from './daily/runState.js';
import { SOURCE_REGISTRY } from './daily/sourceRegistry.js';
import { handleScheduledHealth } from './routes/scheduledHealth.js';

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

function scheduledFailureMarker(error, runAt) {
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
    return {
        success: false,
        status: 'failed',
        trigger_type: 'scheduled',
        run_at: runAt,
        error_type: subrequestBudgetExceeded
            ? 'subrequest_budget_exceeded'
            : error?.name === 'StructuredSourceFetchError'
                ? 'structured_source_fetch_failed'
                : 'scheduled_workflow_failed',
        failure_stage: SAFE_WORKFLOW_FAILURE_STAGES.has(error?.failureStage)
            ? error.failureStage
            : error?.name === 'StructuredSourceFetchError'
                ? 'fetch'
                : error?.name === 'AtomicGitConflictError' || error?.name === 'AtomicGitUncertainError'
                    ? 'git_publish'
                    : 'unknown',
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

export function createWorker({
    adminHandlers = defaultAdminHandlers,
    scheduledWorkflow = runIncrementalDailyWorkflow,
} = {}) {
    return {
        async fetch(request, env) {
            const url = new URL(request.url);
            const path = url.pathname;
            console.log(`Request received: ${request.method} ${path}`);

            if (path === '/health/scheduled') {
                return handleScheduledHealth(request, env);
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
            const triggerId = `scheduled:${event.scheduledTime}`;
            const runAt = new Date(event.scheduledTime).toISOString();
            const workflow = Promise.resolve()
                .then(() => scheduledWorkflow(env, { triggerId, runAt }))
                .then(async result => {
                    await recordScheduledOutcome(env, runAt, {
                        status: 'succeeded',
                        run_at: runAt,
                    });
                    return result;
                })
                .catch(async error => {
                    const marker = scheduledFailureMarker(error, runAt);
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
                    await recordScheduledFailure(env, triggerId, marker);
                    await recordScheduledOutcome(env, runAt, marker);
                    throw error;
                });
            ctx.waitUntil(workflow);
        },
    };
}

export default createWorker();
