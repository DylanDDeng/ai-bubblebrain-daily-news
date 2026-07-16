import { buildDailyArtifacts } from './buildArtifacts.js';
import { fetchProviderPreservingData } from './structuredFetch.js';
import {
    AtomicGitConflictError,
    createSnapshotReader,
    isCommitIncluded,
    publishFilesAtomically,
    resolveBranchSnapshot,
    resolvePublicationAlias,
    resolvePublicationSnapshot,
    verifySnapshotHead,
} from './gitAtomic.js';
import {
    acquireAdvisoryLease,
    readTriggerMarker,
    releaseAdvisoryLease,
    storeTriggerMarker,
} from './runState.js';
import { BATCH_ORDER } from './dedupe.js';
import { isExplicitInstant, isRealDate, previousReportDates } from './time.js';
import { resolveFoloCookie } from '../folo.js';
import { callGitHubApi } from '../github.js';

const MAX_PUBLICATION_ATTEMPTS = 3;

export class StructuredRunLockedError extends Error {
    constructor() {
        super('A structured run is already in progress');
        this.name = 'StructuredRunLockedError';
    }
}

export class StructuredSourceFetchError extends Error {
    constructor(sourceErrors) {
        super(`Structured source fetch failed for ${sourceErrors.length} provider(s)`);
        this.name = 'StructuredSourceFetchError';
        this.sourceErrors = sourceErrors.map(error => ({
            provider: error.provider,
            content_type: error.content_type,
            stage: error.stage || 'fetch',
            error_type: error.error_type || 'Error',
            attempts: Number.isInteger(error.attempts) ? error.attempts : 1,
        }));
    }
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
    for (const date of previousReportDates(reportDate).filter(value => value >= structuredStartDate)) {
        const path = `data/daily/${date}.json`;
        const report = parseReport(await reader.readText(path), path);
        if (report) recentReports.push(report);
    }
    return { existingReport, recentReports, reader };
}

function assertPublicationFiles(files, reportDate) {
    const expectedPaths = [
        `data/daily/${reportDate}.json`,
        `daily/${reportDate}.md`,
        `content/daily/${reportDate}.md`,
    ];
    const actualPaths = files?.map(file => file.path) || [];
    if (actualPaths.length !== expectedPaths.length
        || new Set(actualPaths).size !== expectedPaths.length
        || expectedPaths.some(path => !actualPaths.includes(path))) {
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
    if (!marker?.commit_sha
        || marker.mode !== 'structured'
        || marker.reportDate !== reportDate
        || marker.batch !== batch) return null;
    try {
        let confirmedSha = marker.commit_sha;
        let successor = null;
        if (marker.pending === true && Number.isInteger(marker?.pull_request?.number)) {
            const pull = await deps.api(env, `/pulls/${marker.pull_request.number}`);
            if (pull?.state === 'open') return { ...marker, idempotent: true };
            if (pull?.state === 'closed' && !pull?.merged_at) {
                successor = await deps.resolveAlias(
                    env,
                    marker.commit_sha,
                    env.GITHUB_BRANCH || 'main',
                    { api: deps.api },
                );
                if (successor) {
                    confirmedSha = successor.commitSha;
                    if (successor.pull.state === 'open') {
                        return {
                            ...marker,
                            commit_sha: confirmedSha,
                            pull_request: {
                                number: successor.pull.number,
                                url: successor.pull.url,
                            },
                            idempotent: true,
                        };
                    }
                }
            }
        }
        const snapshot = await deps.resolveBaseSnapshot(env, { api: deps.api });
        if (!await deps.commitIncluded(env, confirmedSha, snapshot.headSha, { api: deps.api })) {
            return null;
        }
        return {
            ...marker,
            commit_sha: confirmedSha,
            ...(successor ? {
                pull_request: { number: successor.pull.number, url: successor.pull.url },
            } : {}),
            pending: false,
            publication_status: 'published',
            idempotent: true,
        };
    } catch (error) {
        console.warn('[StructuredDaily] trigger marker could not be confirmed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
}

export async function runStructuredDailyWorkflow(env, {
    reportDate,
    batch,
    triggerId = null,
    runAt = new Date().toISOString(),
}, dependencies = {}) {
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
        resolveSnapshot: dependencies.resolveSnapshot || ((targetEnv, options) => (
            resolvePublicationSnapshot(targetEnv, { ...options, expectedMode: 'structured' })
        )),
        storeMarker: dependencies.storeMarker || storeTriggerMarker,
        verifyHead: dependencies.verifyHead || verifySnapshotHead,
        acquireLease: dependencies.acquireLease || acquireAdvisoryLease,
        releaseLease: dependencies.releaseLease || releaseAdvisoryLease,
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
    if (!producerVersion) throw new Error('DAILY_PRODUCER_VERSION is required');

    const lease = await deps.acquireLease(env.DATA_KV, { reportDate, batch, now: runAt });
    if (!lease.acquired) throw new StructuredRunLockedError();

    try {
        const confirmed = await confirmedTriggerResult(
            env, triggerId, reportDate, batch, deps,
        );
        if (confirmed) return confirmed;

        const foloCookie = await deps.getFoloCookie(env);
        const fetched = await deps.fetchData(env, foloCookie);
        if (fetched.errors.length > 0) {
            throw new StructuredSourceFetchError(fetched.errors);
        }

        for (let attempt = 1; attempt <= MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
            const snapshot = await deps.resolveSnapshot(env, { api: deps.api });
            const { reader, ...reports } = await loadReports(
                env, snapshot, reportDate, structuredStartDate, deps,
            );
            const result = await deps.build({
                ...reports,
                rawItems: fetched.structuredItems,
                reportDate,
                batch,
                runAt,
                producer: {
                    version: producerVersion,
                    commitSha: env.DAILY_PRODUCER_COMMIT_SHA || null,
                },
                structuredStartDate,
            });
            const expectedPaths = assertPublicationFiles(result.files, reportDate);

            if (result.noOp) {
                const artifactsMatch = (await Promise.all(expectedPaths.map(async path => {
                    const expected = result.files.find(file => file.path === path).content;
                    return await reader.readText(path) === expected;
                }))).every(Boolean);
                if (!artifactsMatch) {
                    console.warn('[StructuredDaily] repairing drifted publication artifacts');
                } else {
                    if (!await deps.verifyHead(env, snapshot, { api: deps.api })) continue;
                    const response = {
                        success: true,
                        mode: 'structured',
                        reportDate,
                        batch,
                        history_epoch_start_date: structuredStartDate,
                        noOp: true,
                        commit_sha: snapshot.headSha,
                        pending: Boolean(snapshot.publicationPull),
                        publication_status: snapshot.publicationPull ? 'pending' : 'published',
                        ...(snapshot.publicationPull ? {
                            publication_branch: snapshot.branch,
                            pull_request: snapshot.publicationPull,
                        } : {}),
                        metrics: result.metrics,
                    };
                    await storeConfirmedMarker(env, triggerId, {
                        ...response,
                        confirmed_at: runAt,
                    }, deps.storeMarker);
                    return response;
                }
            }

            try {
                const published = await deps.commit(env, {
                    snapshot,
                    files: result.files,
                    message: `Structured daily ${reportDate} ${batch}`,
                    committedAt: runAt,
                    reportDate,
                    batch,
                    mode: 'structured',
                }, { api: deps.api });
                const response = {
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
                    metrics: result.metrics,
                };
                await storeConfirmedMarker(env, triggerId, {
                    ...response,
                    confirmed_at: runAt,
                }, deps.storeMarker);
                return response;
            } catch (error) {
                if (error instanceof AtomicGitConflictError && attempt < MAX_PUBLICATION_ATTEMPTS) {
                    continue;
                }
                throw error;
            }
        }
        throw new AtomicGitConflictError('Git branch kept moving during structured publication');
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
