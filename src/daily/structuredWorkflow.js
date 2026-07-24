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
import {
    acquireAdvisoryLease,
    listMirrorBacklogEntries,
    readMirrorBacklogEntry,
    readTriggerMarker,
    releaseAdvisoryLease,
    removeMirrorBacklogEntry,
    storeMirrorBacklogEntry,
    storeTriggerMarker,
} from './runState.js';
import { BATCH_ORDER } from './dedupe.js';
import { isExplicitInstant, isRealDate, previousReportDates } from './time.js';
import {
    dueScheduledRuns,
    resolveScheduledRun,
    scheduledRunsForReportDate,
} from './scheduleContract.js';
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

export class StructuredBacklogIndexError extends Error {
    constructor() {
        super('Required mirror backlog index write failed');
        this.name = 'StructuredBacklogIndexError';
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

async function storeConfirmedMarker(env, triggerId, marker, deps) {
    if (!triggerId) return;
    try {
        await deps.storeMarker(env.DATA_KV, triggerId, marker);
    } catch (error) {
        console.warn('[StructuredDaily] confirmed marker write failed', {
            errorType: error?.name || 'Error',
        });
    }
    if (marker.database_mirror?.status === 'failed') {
        try {
            const indexed = await deps.storeBacklogEntry(env.DATA_KV, triggerId, marker);
            if (!indexed) throw new Error('Backlog trigger is not schedulable');
        } catch (error) {
            console.error('[StructuredDaily] required mirror backlog index write failed', {
                errorType: error?.name || 'Error',
            });
            throw new StructuredBacklogIndexError();
        }
    } else if (marker.database_mirror?.status === 'mirrored') {
        try {
            await deps.removeBacklogEntry(env.DATA_KV, triggerId);
        } catch (error) {
            console.warn('[StructuredDaily] mirror backlog index cleanup failed', {
                errorType: error?.name || 'Error',
            });
        }
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
        await storeConfirmedMarker(env, triggerId, result, deps);
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
        await storeConfirmedMarker(env, triggerId, result, deps);
        return result;
    } catch (error) {
        if (error instanceof StructuredBacklogIndexError) throw error;
        console.warn('[StructuredDaily] trigger marker could not be confirmed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
}

function structuredDependencies(dependencies = {}) {
    return {
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
        listBacklogEntries:
            dependencies.listBacklogEntries || listMirrorBacklogEntries,
        readBacklogEntry:
            dependencies.readBacklogEntry || readMirrorBacklogEntry,
        storeBacklogEntry:
            dependencies.storeBacklogEntry || storeMirrorBacklogEntry,
        removeBacklogEntry:
            dependencies.removeBacklogEntry || removeMirrorBacklogEntry,
        verifyHead: dependencies.verifyHead || verifySnapshotHead,
        acquireLease: dependencies.acquireLease || acquireAdvisoryLease,
        releaseLease: dependencies.releaseLease || releaseAdvisoryLease,
        mirror: dependencies.mirror || mirrorStructuredReport,
        enrich: dependencies.enrich || applyEditorialEnrichment,
        scoreTopStory: dependencies.scoreTopStory || applyTopStorySelection,
    };
}

function assertStructuredRuntime(env) {
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
}

function markerMatchesScheduledRun(marker, run) {
    return Boolean(
        marker?.commit_sha &&
        marker.mode === 'structured' &&
        marker.reportDate === run.report_date &&
        marker.batch === run.batch_id
    );
}

async function findSupersedingStructuredMarker(env, run, nowMs, deps) {
    let superseding = null;
    for (const candidate of scheduledRunsForReportDate(run.report_date)) {
        const candidateMs = Date.parse(candidate.scheduled_at);
        if (candidateMs <= Date.parse(run.scheduled_at) || candidateMs > nowMs) continue;
        const marker = await deps.readMarker(env.DATA_KV, candidate.run_id);
        if (markerMatchesScheduledRun(marker, candidate)) {
            superseding = { run: candidate, marker };
        }
    }
    return superseding;
}

export async function reconcileStructuredTrigger(
    env,
    { scheduledAt },
    dependencies = {},
) {
    assertStructuredRuntime(env);
    const run = resolveScheduledRun(scheduledAt);
    if (typeof scheduledAt !== 'string' || run.scheduled_at !== scheduledAt) {
        throw new Error('Scheduled instant must be exact');
    }
    const deps = structuredDependencies(dependencies);
    const now = dependencies.now || new Date().toISOString();
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('Invalid reconciliation time');
    const lease = await deps.acquireLease(env.DATA_KV, {
        reportDate: run.report_date,
        batch: run.batch_id,
        now,
    });
    if (!lease.acquired) return { status: 'locked', run };
    try {
        const marker = await deps.readMarker(env.DATA_KV, run.run_id);
        if (!markerMatchesScheduledRun(marker, run)) {
            return { status: 'not_found', run };
        }
        const superseding = await findSupersedingStructuredMarker(
            env,
            run,
            nowMs,
            deps,
        );
        if (superseding) {
            return {
                status: 'superseded',
                run,
                superseded_by: {
                    run_id: superseding.run.run_id,
                    scheduled_at: superseding.run.scheduled_at,
                    database_mirror_status:
                        superseding.marker.database_mirror?.status || 'unknown',
                },
            };
        }
        if (marker.database_mirror?.status === 'mirrored') {
            return { status: 'already_mirrored', run, result: marker };
        }
        const result = await confirmedTriggerResult(
            env,
            run.run_id,
            run.report_date,
            run.batch_id,
            deps,
        );
        if (!result) return { status: 'not_confirmed', run };
        return {
            status: result.database_mirror?.status === 'mirrored'
                ? 'reconciled'
                : 'blocked',
            run,
            result,
        };
    } finally {
        await deps.releaseLease(env.DATA_KV, lease);
    }
}

export async function replayOldestStructuredBacklog(
    env,
    { now = new Date().toISOString(), lookbackHours = 48 } = {},
    dependencies = {},
) {
    assertStructuredRuntime(env);
    if (
        typeof now !== 'string' ||
        !Number.isSafeInteger(lookbackHours) ||
        lookbackHours < 1 ||
        lookbackHours > 168
    ) {
        throw new Error('Invalid backlog replay range');
    }
    const deps = structuredDependencies(dependencies);
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('Invalid backlog replay time');
    const fallbackRuns = dueScheduledRuns(nowMs, lookbackHours);
    let indexedTriggerIds = [];
    try {
        indexedTriggerIds = await deps.listBacklogEntries(env.DATA_KV);
    } catch (error) {
        console.warn('[StructuredDaily] mirror backlog index read failed', {
            errorType: error?.name || 'Error',
        });
    }
    const runsById = new Map(fallbackRuns.map(run => [run.run_id, run]));
    for (const triggerId of indexedTriggerIds) {
        try {
            const run = resolveScheduledRun(Number(triggerId.slice('scheduled:'.length)));
            if (Date.parse(run.scheduled_at) <= nowMs) runsById.set(run.run_id, run);
        } catch {
            // Ignore malformed or non-production index entries.
        }
    }
    const runs = [...runsById.values()].sort(
        (left, right) => Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at),
    );
    const indexedTriggerSet = new Set(indexedTriggerIds);
    const latestByReportDate = new Map();
    let deferredCount = 0;
    for (const run of runs) {
        let marker = await deps.readMarker(env.DATA_KV, run.run_id);
        if (!markerMatchesScheduledRun(marker, run) && indexedTriggerSet.has(run.run_id)) {
            const backlogEntry = await deps.readBacklogEntry(env.DATA_KV, run.run_id);
            const backedUpMarker = backlogEntry?.marker || null;
            if (markerMatchesScheduledRun(backedUpMarker, run)) {
                try {
                    const restored = await deps.storeMarker(
                        env.DATA_KV,
                        run.run_id,
                        backedUpMarker,
                    );
                    if (!restored) throw new Error('Trigger marker was not restored');
                    marker = backedUpMarker;
                } catch (error) {
                    console.warn('[StructuredDaily] trigger marker restore failed', {
                        errorType: error?.name || 'Error',
                        runId: run.run_id,
                    });
                    deferredCount += 1;
                    continue;
                }
            }
        }
        if (!markerMatchesScheduledRun(marker, run)) continue;
        latestByReportDate.set(run.report_date, { run, marker });
    }
    for (const { run, marker } of latestByReportDate.values()) {
        if (marker.database_mirror?.status !== 'failed') continue;
        const result = await reconcileStructuredTrigger(
            env,
            { scheduledAt: run.scheduled_at },
            { ...dependencies, now },
        );
        if (result.status === 'not_found' && indexedTriggerSet.has(run.run_id)) {
            console.warn('[StructuredDaily] restored trigger marker is not visible yet', {
                runId: run.run_id,
            });
            deferredCount += 1;
            continue;
        }
        if (['superseded', 'already_mirrored', 'not_found'].includes(result.status)) {
            try {
                await deps.removeBacklogEntry(env.DATA_KV, run.run_id);
            } catch (error) {
                console.warn('[StructuredDaily] mirror backlog cleanup failed', {
                    errorType: error?.name || 'Error',
                    runId: run.run_id,
                });
            }
            continue;
        }
        if (result.status === 'not_confirmed') {
            console.warn('[StructuredDaily] mirror backlog entry is not confirmed', {
                runId: run.run_id,
            });
            deferredCount += 1;
            continue;
        }
        return result;
    }
    return deferredCount > 0
        ? { status: 'deferred', deferred_count: deferredCount }
        : { status: 'empty' };
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
    const deps = structuredDependencies(dependencies);
    assertStructuredRuntime(env);
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
                        deps,
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
                    deps,
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
