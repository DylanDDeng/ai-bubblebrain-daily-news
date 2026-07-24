import { buildDailyArtifacts } from './buildArtifacts.js';
import { fetchProviderPreservingData } from './structuredFetch.js';
import {
    AtomicGitConflictError,
    createSnapshotReader,
    isCommitIncluded,
    publishFilesAtomically,
    resolveBranchSnapshot,
    resolveCommitSnapshot,
    resolvePublicationAlias,
    resolvePublicationSnapshot,
    verifySnapshotHead,
} from './gitAtomic.js';
import { acquireAdvisoryLease, readTriggerMarker, releaseAdvisoryLease, storeTriggerMarker } from './runState.js';
import { BATCH_ORDER } from './dedupe.js';
import { isExplicitInstant, isRealDate, previousReportDates } from './time.js';
import { resolveFoloCookie } from '../folo.js';
import { callGitHubApi } from '../github.js';
import { mirrorStructuredReport } from '../../workers/content/ingestion/mirror.ts';
import { applyEditorialEnrichment, editorialNeedsEnrichment } from './editorial.js';
import { applyTopStorySelection } from './topStory.js';

const MAX_PUBLICATION_ATTEMPTS = 3;

export function scheduledFetchPageCap(env, batch, runAt) {
    if (batch !== 'lateNight') return null;
    const hour = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        hour12: false,
    }).format(new Date(runAt)));
    if (hour < 3 || hour >= 5) return null;
    const cap = Number.parseInt(env.LATE_NIGHT_SUPPLEMENT_FETCH_PAGE_CAP || '1', 10);
    if (!Number.isInteger(cap) || cap < 1 || cap > 3) {
        throw new Error('LATE_NIGHT_SUPPLEMENT_FETCH_PAGE_CAP must be between one and three');
    }
    return cap;
}

export class StructuredRunLockedError extends Error {
    constructor() {
        super('A structured run is already in progress');
        this.name = 'StructuredRunLockedError';
    }
}

export class StructuredSourceFetchError extends Error {
    constructor(sourceErrors, sourceCounts = {}) {
        super(`Structured source fetch failed for ${sourceErrors.length} provider(s)`);
        this.name = 'StructuredSourceFetchError';
        this.sourceCounts = sourceCounts;
        this.sourceErrors = sourceErrors.map((error) => ({
            provider: error.provider,
            content_type: error.content_type,
            stage: error.stage || 'fetch',
            error_type: error.error_type || 'Error',
            attempts: Number.isInteger(error.attempts) ? error.attempts : 1,
        }));
    }
}

async function sha256Text(value) {
    if (typeof value !== 'string') return null;
    const bytes = new TextEncoder().encode(value);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeSourceCounts(value) {
    const counts = {};
    for (const key of ['news', 'project', 'paper', 'socialMedia']) {
        const count = Number(value?.[key] || 0);
        counts[key] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }
    return counts;
}

async function attachScheduledRunEvidence(response, {
    databaseMirror,
    fetched,
    result,
    runAt,
    sourceCompletedAt,
    triggerId,
}) {
    const contentSha256 =
        databaseMirror?.contentSha256 || await sha256Text(result?.json);
    const mirrorStatus = String(databaseMirror?.status || 'disabled');
    return {
        ...response,
        run_id: /^scheduled:\d{13}$/.test(String(triggerId || ''))
            ? triggerId
            : null,
        scheduled_at: runAt,
        source_result: {
            status: 'succeeded',
            completed_at: sourceCompletedAt,
            counts: safeSourceCounts(fetched?.sourceCounts),
        },
        content_sha256: contentSha256,
        no_op: result?.noOp === true,
        site_release_id: databaseMirror?.siteReleaseId || null,
        site_release_sequence: Number.isSafeInteger(databaseMirror?.siteReleaseSequence)
            ? databaseMirror.siteReleaseSequence
            : null,
        dispatch_id: databaseMirror?.dispatchId || null,
        stage: mirrorStatus === 'failed'
            ? 'database_mirror_failed'
            : mirrorStatus === 'mirrored'
                ? 'release_registered'
                : 'content_published',
        stable_verified_at: null,
    };
}

function parseReport(text, path) {
    if (text === null) return null;
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Invalid structured report JSON: ${path}`);
    }
}

export function resolveHistoryEpochStartDate(env, reportDate) {
    const configured = env.DAILY_STRUCTURED_START_DATE;
    if (!isRealDate(configured) || configured > reportDate) {
        throw new Error('Invalid DAILY_STRUCTURED_START_DATE');
    }
    const resume = env.DAILY_STRUCTURED_RESUME_DATE;
    if (resume === undefined || resume === null || resume === '') return configured;
    if (!isRealDate(resume) || resume < configured || resume > reportDate) {
        throw new Error('Invalid DAILY_STRUCTURED_RESUME_DATE');
    }
    return resume;
}

async function loadReports(env, snapshot, reportDate, structuredStartDate, deps) {
    const reader = deps.createReader(env, snapshot, { api: deps.api });
    const currentPath = `data/daily/${reportDate}.json`;
    const existingReport = parseReport(await reader.readText(currentPath), currentPath);
    const recentReports = [];
    for (const date of previousReportDates(reportDate).filter((value) => value >= structuredStartDate)) {
        const path = `data/daily/${date}.json`;
        const report = parseReport(await reader.readText(path), path);
        if (report) recentReports.push(report);
    }
    return { existingReport, recentReports, reader };
}

function assertPublicationFiles(files, reportDate) {
    const expectedPaths = [`data/daily/${reportDate}.json`, `daily/${reportDate}.md`, `content/daily/${reportDate}.md`];
    const actualPaths = files?.map((file) => file.path) || [];
    if (
        actualPaths.length !== expectedPaths.length ||
        new Set(actualPaths).size !== expectedPaths.length ||
        expectedPaths.some((path) => !actualPaths.includes(path))
    ) {
        throw new Error('Structured build returned an invalid publication file set');
    }
    return expectedPaths;
}

async function storeConfirmedMarker(env, triggerId, marker, storeMarker) {
    if (!triggerId) return;
    try {
        await storeMarker(env.DATA_KV, triggerId, marker);
    } catch (error) {
        console.warn('[StructuredDaily] confirmed marker write failed', {
            errorType: error?.name || 'Error',
        });
    }
}

async function mirrorWithoutBlocking(env, result, codeSha, batch, triggerId, mirror) {
    try {
        return await mirror(env, {
            report: result.report,
            canonicalJson: result.json,
            codeSha,
            batch,
            triggerId,
        });
    } catch (error) {
        console.error('[StructuredDaily] database mirror failed after Git publication', {
            errorType: error?.name || 'Error',
            reportDate: result.report?.date,
        });
        return { status: 'failed', error_type: error?.name || 'Error' };
    }
}

async function reconcileConfirmedMirror(env, marker, confirmedSha, reportDate, triggerId, deps) {
    if (
        String(env.CONTENT_DATABASE_MIRROR_ENABLED).toLowerCase() !== 'true' ||
        marker.database_mirror?.status === 'mirrored'
    )
        return marker.database_mirror;
    try {
        const snapshot = await deps.resolveCommitSnapshot(env, confirmedSha, {
            api: deps.api,
        });
        const reader = deps.createReader(env, snapshot, { api: deps.api });
        const path = `data/daily/${reportDate}.json`;
        const canonicalJson = await reader.readText(path);
        const report = parseReport(canonicalJson, path);
        if (!report) throw new Error(`Confirmed structured report is missing: ${path}`);
        return await mirrorWithoutBlocking(
            env,
            { report, json: canonicalJson },
            confirmedSha,
            marker.batch,
            triggerId,
            deps.mirror,
        );
    } catch (error) {
        console.error('[StructuredDaily] confirmed database mirror reconciliation failed', {
            errorType: error?.name || 'Error',
            reportDate,
        });
        return { status: 'failed', error_type: error?.name || 'Error' };
    }
}

async function pendingTriggerResult(env, triggerId, marker, confirmedSha, reportDate, deps) {
    const result = { ...marker, commit_sha: confirmedSha, idempotent: true };
    const databaseMirror = await reconcileConfirmedMirror(env, marker, confirmedSha, reportDate, triggerId, deps);
    if (databaseMirror !== marker.database_mirror) {
        result.database_mirror = databaseMirror;
        await storeConfirmedMarker(env, triggerId, result, deps.storeMarker);
    }
    return result;
}

async function confirmedTriggerResult(env, triggerId, reportDate, batch, deps) {
    if (!triggerId) return null;
    let marker;
    try {
        marker = await deps.readMarker(env.DATA_KV, triggerId);
    } catch (error) {
        console.warn('[StructuredDaily] trigger marker read failed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
    if (
        !marker?.commit_sha ||
        marker.mode !== 'structured' ||
        marker.reportDate !== reportDate ||
        marker.batch !== batch
    )
        return null;
    try {
        let confirmedSha = marker.commit_sha;
        let successor = null;
        if (marker.pending === true && Number.isInteger(marker?.pull_request?.number)) {
            const pull = await deps.api(env, `/pulls/${marker.pull_request.number}`);
            if (pull?.state === 'open') {
                return pendingTriggerResult(env, triggerId, marker, confirmedSha, reportDate, deps);
            }
            if (pull?.state === 'closed' && pull?.merged_at && /^[a-f0-9]{40}$/.test(pull?.merge_commit_sha || '')) {
                confirmedSha = pull.merge_commit_sha;
            }
            if (pull?.state === 'closed' && !pull?.merged_at) {
                successor = await deps.resolveAlias(env, marker.commit_sha, env.GITHUB_BRANCH || 'main', {
                    api: deps.api,
                });
                if (successor) {
                    confirmedSha = successor.commitSha;
                    if (successor.pull.state === 'open') {
                        return pendingTriggerResult(
                            env,
                            triggerId,
                            {
                                ...marker,
                                commit_sha: confirmedSha,
                                pull_request: {
                                    number: successor.pull.number,
                                    url: successor.pull.url,
                                },
                            },
                            confirmedSha,
                            reportDate,
                            deps,
                        );
                    }
                }
            }
        }
        const snapshot = await deps.resolveBaseSnapshot(env, { api: deps.api });
        if (
            !(await deps.commitIncluded(env, confirmedSha, snapshot.headSha, {
                api: deps.api,
            }))
        ) {
            return null;
        }
        const result = {
            ...marker,
            commit_sha: confirmedSha,
            ...(successor
                ? {
                      pull_request: {
                          number: successor.pull.number,
                          url: successor.pull.url,
                      },
                  }
                : {}),
            pending: false,
            publication_status: 'published',
            idempotent: true,
        };
        result.database_mirror = await reconcileConfirmedMirror(env, marker, confirmedSha, reportDate, triggerId, deps);
        await storeConfirmedMarker(env, triggerId, result, deps.storeMarker);
        return result;
    } catch (error) {
        console.warn('[StructuredDaily] trigger marker could not be confirmed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
}

export async function runStructuredDailyWorkflow(
    env,
    {
        reportDate,
        batch,
        triggerId = null,
        runAt = new Date().toISOString(),
        contentCutoff = runAt,
    },
    dependencies = {},
) {
    const deps = {
        api: dependencies.api || callGitHubApi,
        build: dependencies.build || buildDailyArtifacts,
        commit: dependencies.commit || publishFilesAtomically,
        commitIncluded: dependencies.commitIncluded || isCommitIncluded,
        createReader: dependencies.createReader || createSnapshotReader,
        fetchData: dependencies.fetchData || fetchProviderPreservingData,
        getFoloCookie: dependencies.getFoloCookie || resolveFoloCookie,
        readMarker: dependencies.readMarker || readTriggerMarker,
        resolveAlias: dependencies.resolveAlias || resolvePublicationAlias,
        resolveBaseSnapshot: dependencies.resolveBaseSnapshot || resolveBranchSnapshot,
        resolveCommitSnapshot: dependencies.resolveCommitSnapshot || resolveCommitSnapshot,
        resolveSnapshot:
            dependencies.resolveSnapshot ||
            ((targetEnv, options) =>
                resolvePublicationSnapshot(targetEnv, {
                    ...options,
                    expectedMode: 'structured',
                })),
        storeMarker: dependencies.storeMarker || storeTriggerMarker,
        verifyHead: dependencies.verifyHead || verifySnapshotHead,
        acquireLease: dependencies.acquireLease || acquireAdvisoryLease,
        releaseLease: dependencies.releaseLease || releaseAdvisoryLease,
        mirror: dependencies.mirror || mirrorStructuredReport,
        enrich: dependencies.enrich || applyEditorialEnrichment,
        scoreTopStory: dependencies.scoreTopStory || applyTopStorySelection,
    };
    if (String(env.EXTERNAL_WRITES_ENABLED).toLowerCase() !== 'true') {
        throw new Error('External writes are disabled');
    }
    if (env.DAILY_PUBLISH_MODE !== 'structured') {
        throw new Error('DAILY_PUBLISH_MODE must be structured');
    }
    if (String(env.DAILY_STRUCTURED_WRITES_ENABLED).toLowerCase() !== 'true') {
        throw new Error('Structured writes are disabled');
    }
    if (!env.DATA_KV) throw new Error('Structured DATA_KV is required');
    const structuredStartDate = resolveHistoryEpochStartDate(env, reportDate);
    const producerVersion = env.DAILY_PRODUCER_VERSION;
    if (!isRealDate(reportDate)) throw new Error('Invalid report date');
    if (!BATCH_ORDER.includes(batch)) throw new Error('Invalid batch');
    if (!isExplicitInstant(runAt)) throw new Error('runAt must include an explicit timezone');
    if (!isExplicitInstant(contentCutoff)) {
        throw new Error('contentCutoff must include an explicit timezone');
    }
    if (new Date(contentCutoff).getTime() > new Date(runAt).getTime()) {
        throw new Error('contentCutoff cannot be after runAt');
    }
    if (!producerVersion) throw new Error('DAILY_PRODUCER_VERSION is required');

    const lease = await deps.acquireLease(env.DATA_KV, {
        reportDate,
        batch,
        now: runAt,
    });
    if (!lease.acquired) throw new StructuredRunLockedError();

    let failureStage = 'unknown';
    try {
        failureStage = 'git_publish';
        const confirmed = await confirmedTriggerResult(env, triggerId, reportDate, batch, deps);
        if (confirmed) return confirmed;

        failureStage = 'fetch';
        const foloCookie = await deps.getFoloCookie(env);
        const fetchPageCap = scheduledFetchPageCap(env, batch, runAt);
        const fetched = await deps.fetchData(env, foloCookie, { fetchPageCap });
        const sourceCompletedAt = new Date().toISOString();
        if (fetched.errors.length > 0) {
            throw new StructuredSourceFetchError(
                fetched.errors,
                safeSourceCounts(fetched.sourceCounts),
            );
        }

        const editorialCache = new Map();
        const topStoryCache = new Map();
        for (let attempt = 1; attempt <= MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
            failureStage = 'git_publish';
            const snapshot = await deps.resolveSnapshot(env, { api: deps.api });
            const { reader, ...reports } = await loadReports(env, snapshot, reportDate, structuredStartDate, deps);
            failureStage = 'build';
            let result = await deps.build({
                ...reports,
                rawItems: fetched.structuredItems,
                reportDate,
                batch,
                runAt,
                contentCutoff,
                producer: {
                    version: producerVersion,
                    commitSha: env.DAILY_PRODUCER_COMMIT_SHA || null,
                },
                blockedXHandles: env.X_BLOCKED_HANDLES || '',
                structuredStartDate,
            });
            if (Array.isArray(result.report?.items)) {
                const existingIds = new Set(reports.existingReport?.items?.map(item => item.id) || []);
                const editorialIds = result.report.items
                    .filter(item => !existingIds.has(item.id) || editorialNeedsEnrichment(item))
                    .map(item => item.id);
                if (editorialIds.length > 0) {
                    const preEditorialResult = result;
                    try {
                        result = await deps.enrich(
                            env,
                            preEditorialResult,
                            { itemIds: editorialIds, cache: editorialCache },
                        );
                    } catch (error) {
                        console.warn('[StructuredDaily] editorial enrichment failed; publishing valid source data', {
                            errorType: error?.name || 'Error',
                            itemCount: editorialIds.length,
                        });
                        result = {
                            ...preEditorialResult,
                            metrics: {
                                ...preEditorialResult.metrics,
                                editorial_degraded: true,
                                editorial_error_type: error?.name || 'Error',
                            },
                        };
                    }
                }
            }
            if (Array.isArray(result.report?.items)) {
                const topStoryIds = result.report.items
                    .filter(item => item.content_type === 'news' && item.score === null)
                    .map(item => item.id);
                if (topStoryIds.length > 0) {
                    const preTopStoryResult = result;
                    try {
                        result = await deps.scoreTopStory(
                            env,
                            preTopStoryResult,
                            { itemIds: topStoryIds, cache: topStoryCache },
                        );
                    } catch (error) {
                        console.warn('[StructuredDaily] top-story scoring failed; publishing valid source data', {
                            errorType: error?.name || 'Error',
                            itemCount: topStoryIds.length,
                        });
                        result = {
                            ...preTopStoryResult,
                            metrics: {
                                ...preTopStoryResult.metrics,
                                top_story_degraded: true,
                                top_story_error_type: error?.name || 'Error',
                            },
                        };
                    }
                }
            }
            const expectedPaths = assertPublicationFiles(result.files, reportDate);

            if (result.noOp) {
                failureStage = 'git_publish';
                const artifactsMatch = (
                    await Promise.all(
                        expectedPaths.map(async (path) => {
                            const expected = result.files.find((file) => file.path === path).content;
                            return (await reader.readText(path)) === expected;
                        }),
                    )
                ).every(Boolean);
                if (!artifactsMatch) {
                    console.warn('[StructuredDaily] repairing drifted publication artifacts');
                } else {
                    if (!(await deps.verifyHead(env, snapshot, { api: deps.api }))) continue;
                    const databaseMirror = await mirrorWithoutBlocking(
                        env,
                        result,
                        snapshot.headSha,
                        batch,
                        triggerId,
                        deps.mirror,
                    );
                    const response = await attachScheduledRunEvidence({
                        success: true,
                        mode: 'structured',
                        reportDate,
                        batch,
                        history_epoch_start_date: structuredStartDate,
                        noOp: true,
                        commit_sha: snapshot.headSha,
                        pending: Boolean(snapshot.publicationPull),
                        publication_status: snapshot.publicationPull ? 'pending' : 'published',
                        ...(snapshot.publicationPull
                            ? {
                                  publication_branch: snapshot.branch,
                                  pull_request: snapshot.publicationPull,
                              }
                            : {}),
                        metrics: result.metrics,
                        database_mirror: databaseMirror,
                    }, {
                        databaseMirror,
                        fetched,
                        result,
                        runAt,
                        sourceCompletedAt,
                        triggerId,
                    });
                    await storeConfirmedMarker(
                        env,
                        triggerId,
                        {
                            ...response,
                            confirmed_at: runAt,
                        },
                        deps.storeMarker,
                    );
                    return response;
                }
            }

            try {
                failureStage = 'git_publish';
                const published = await deps.commit(
                    env,
                    {
                        snapshot,
                        files: result.files,
                        message: `Structured daily ${reportDate} ${batch}`,
                        committedAt: runAt,
                        reportDate,
                        batch,
                        mode: 'structured',
                    },
                    { api: deps.api },
                );
                const databaseMirror = await mirrorWithoutBlocking(
                    env,
                    result,
                    published.commitSha,
                    batch,
                    triggerId,
                    deps.mirror,
                );
                const response = await attachScheduledRunEvidence({
                    success: true,
                    mode: 'structured',
                    reportDate,
                    batch,
                    history_epoch_start_date: structuredStartDate,
                    noOp: false,
                    commit_sha: published.commitSha,
                    reconciled: published.reconciled,
                    pending: published.pending === true,
                    publication_status: published.pending === true ? 'pending' : 'published',
                    ...(published.branch ? { publication_branch: published.branch } : {}),
                    ...(published.pullRequest ? { pull_request: published.pullRequest } : {}),
                    ...(published.lockRelease ? { lock_release: published.lockRelease } : {}),
                    metrics: result.metrics,
                    database_mirror: databaseMirror,
                }, {
                    databaseMirror,
                    fetched,
                    result,
                    runAt,
                    sourceCompletedAt,
                    triggerId,
                });
                await storeConfirmedMarker(
                    env,
                    triggerId,
                    {
                        ...response,
                        confirmed_at: runAt,
                    },
                    deps.storeMarker,
                );
                return response;
            } catch (error) {
                if (error instanceof AtomicGitConflictError && attempt < MAX_PUBLICATION_ATTEMPTS) {
                    continue;
                }
                throw error;
            }
        }
        throw new AtomicGitConflictError('Git branch kept moving during structured publication');
    } catch (error) {
        if (error && typeof error === 'object' && !error.failureStage) {
            try {
                error.failureStage = failureStage;
            } catch {
                // Preserve the original failure even when an exotic error object is immutable.
            }
        }
        throw error;
    } finally {
        try {
            await deps.releaseLease(env.DATA_KV, lease);
        } catch (error) {
            console.warn('[StructuredDaily] advisory lease release failed', {
                errorType: error?.name || 'Error',
            });
        }
    }
}
