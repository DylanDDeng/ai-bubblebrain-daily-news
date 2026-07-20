import { callGitHubApi } from '../github.js';
import { expectedPublicationPaths, parsePublicationCommit, validatePublicationPull } from './publicationPolicy.js';

const PUBLICATION_LOCK_TTL_MS = 15 * 60 * 1000;
const PUBLICATION_LOCK_RELEASE_PREFIX = 'Publication lock released ';
const PUBLICATION_LOCK_RELEASE_ATTEMPTS = 3;

function refPath(branch) {
    return branch.split('/').map(encodeURIComponent).join('/');
}

function isNotFound(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('404') || message.includes('not found');
}

function publicationBranchSegment(value, label) {
    const normalized = String(value || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
        throw new Error(`Invalid ${label} for publication branch`);
    }
    return normalized;
}

function publicationBranchDetails(branch, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `^${escapedPrefix}/(\\d{4}-\\d{2}-\\d{2})-(morning|afternoon|night|lateNight)-(legacy|structured)/[a-f0-9]{12}$`,
    );
    const match = pattern.exec(branch || '');
    if (!match) return null;
    return { reportDate: match[1], batch: match[2], mode: match[3] };
}

function isSameRepositoryPull(env, pull) {
    const owner = String(env.GITHUB_REPO_OWNER || '').trim();
    const name = String(env.GITHUB_REPO_NAME || '').trim();
    if (!owner || !name) return true;
    return pull?.head?.repo?.full_name === `${owner}/${name}`;
}

function supersededCandidateSha(pull) {
    return /<!-- supersedes-candidate:([a-f0-9]{40}) -->/.exec(String(pull?.body || ''))?.[1] || null;
}

function selectPublicationPull(pulls) {
    if (pulls.length <= 1) return pulls[0] || null;
    const byHeadSha = new Map(pulls.map((pull) => [pull?.head?.sha, pull]));
    const referenced = new Set(pulls.map(supersededCandidateSha).filter(Boolean));
    const terminals = pulls.filter((pull) => !referenced.has(pull?.head?.sha));
    if (terminals.length !== 1) {
        throw new AtomicGitConflictError('Multiple unrelated publication pull requests are open');
    }
    let current = terminals[0];
    const visited = new Set();
    while (current) {
        if (visited.has(current.number)) {
            throw new AtomicGitConflictError('Publication pull alias cycle detected');
        }
        visited.add(current.number);
        const previousSha = supersededCandidateSha(current);
        current = previousSha ? byHeadSha.get(previousSha) : null;
    }
    if (visited.size !== pulls.length) {
        throw new AtomicGitConflictError('Multiple unrelated publication pull requests are open');
    }
    return terminals[0];
}

function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export class AtomicGitConflictError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'AtomicGitConflictError';
    }
}

export class AtomicGitUncertainError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'AtomicGitUncertainError';
    }
}

export async function resolveBranchSnapshot(env, { api = callGitHubApi, branch = env.GITHUB_BRANCH } = {}) {
    if (!branch) throw new Error('GITHUB_BRANCH is required');
    const ref = await api(env, `/git/ref/heads/${refPath(branch)}`);
    const headSha = ref?.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(headSha || '')) throw new Error('Invalid Git branch head');
    const commit = await api(env, `/git/commits/${headSha}`);
    const treeSha = commit?.tree?.sha;
    if (!/^[a-f0-9]{40}$/.test(treeSha || '')) throw new Error('Invalid Git commit tree');
    return { branch, headSha, treeSha };
}

export async function resolveCommitSnapshot(env, commitSha, { api = callGitHubApi } = {}) {
    if (!/^[a-f0-9]{40}$/.test(commitSha || '')) throw new Error('Invalid Git commit SHA');
    const commit = await api(env, `/git/commits/${commitSha}`);
    const treeSha = commit?.tree?.sha;
    if (!/^[a-f0-9]{40}$/.test(treeSha || '')) throw new Error('Invalid Git commit tree');
    return { branch: null, headSha: commitSha, treeSha };
}

export async function resolvePublicationSnapshot(
    env,
    { api = callGitHubApi, branch = env.GITHUB_BRANCH, expectedMode } = {},
) {
    const strategy = env.GITHUB_PUBLISH_STRATEGY || 'direct';
    if (strategy === 'direct') return resolveBranchSnapshot(env, { api, branch });
    if (strategy !== 'pull_request') {
        throw new Error('GITHUB_PUBLISH_STRATEGY must be direct or pull_request');
    }
    if (!branch) throw new Error('GITHUB_BRANCH is required');
    const prefix = String(env.GITHUB_PUBLISH_BRANCH_PREFIX || '').replace(/^\/+|\/+$/g, '');
    if (!prefix) throw new Error('GITHUB_PUBLISH_BRANCH_PREFIX is required');
    const pulls = await listPublicationPulls(env, branch, 'open', { api });
    const publications = pulls.filter(
        (pull) => isSameRepositoryPull(env, pull) && publicationBranchDetails(pull?.head?.ref, prefix),
    );
    if (publications.length === 0) {
        const snapshot = await resolveBranchSnapshot(env, { api, branch });
        return {
            ...snapshot,
            baseBranch: branch,
            publicationPullNumber: null,
            publicationPull: null,
        };
    }
    const pull = selectPublicationPull(publications);
    const details = publicationBranchDetails(pull.head.ref, prefix);
    if (expectedMode && details.mode !== expectedMode) {
        throw new AtomicGitConflictError('Publication mode transition has an in-flight pull request');
    }
    const snapshot = await resolveBranchSnapshot(env, {
        api,
        branch: pull.head.ref,
    });
    if (pull?.head?.sha && pull.head.sha !== snapshot.headSha) {
        throw new AtomicGitConflictError('Publication pull head changed during snapshot resolution');
    }
    return {
        ...snapshot,
        baseBranch: branch,
        publicationPullNumber: pull.number,
        publicationPull: {
            number: pull.number,
            url: pull.html_url,
        },
    };
}

export function createSnapshotReader(env, snapshot, { api = callGitHubApi, maxBlobBytes = 10 * 1024 * 1024 } = {}) {
    const treeCache = new Map();
    const blobCache = new Map();

    async function treeEntries(treeSha) {
        if (!treeCache.has(treeSha)) {
            treeCache.set(
                treeSha,
                api(env, `/git/trees/${treeSha}`).then((result) => {
                    if (!Array.isArray(result?.tree)) throw new Error('Invalid Git tree response');
                    return result.tree;
                }),
            );
        }
        return treeCache.get(treeSha);
    }

    async function readText(path) {
        const parts = String(path).split('/').filter(Boolean);
        if (parts.length === 0) throw new Error('Git path is required');
        let treeSha = snapshot.treeSha;
        for (let index = 0; index < parts.length; index += 1) {
            const entries = await treeEntries(treeSha);
            const entry = entries.find((candidate) => candidate.path === parts[index]);
            if (!entry) return null;
            const last = index === parts.length - 1;
            if (last) {
                if (entry.type !== 'blob') throw new Error(`Git path is not a blob: ${path}`);
                if (!blobCache.has(entry.sha)) {
                    blobCache.set(
                        entry.sha,
                        api(env, `/git/blobs/${entry.sha}`).then((blob) => {
                            if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') {
                                throw new Error(`Invalid Git blob response: ${path}`);
                            }
                            if (!Number.isInteger(blob.size) || blob.size < 0 || blob.size > maxBlobBytes) {
                                throw new Error(`Git blob exceeds structured read limit: ${path}`);
                            }
                            return decodeBase64Utf8(blob.content);
                        }),
                    );
                }
                return blobCache.get(entry.sha);
            }
            if (entry.type !== 'tree') return null;
            treeSha = entry.sha;
        }
        return null;
    }

    return { readText };
}

export async function isCommitIncluded(env, candidateSha, headSha, { api = callGitHubApi } = {}) {
    if (candidateSha === headSha) return true;
    const comparison = await api(env, `/compare/${candidateSha}...${headSha}`);
    return comparison?.merge_base_commit?.sha === candidateSha && ['ahead', 'identical'].includes(comparison.status);
}

export async function verifySnapshotHead(env, snapshot, { api = callGitHubApi } = {}) {
    const current = await resolveBranchSnapshot(env, {
        api,
        branch: snapshot.branch,
    });
    return current.headSha === snapshot.headSha;
}

async function createCandidateCommit(env, { snapshot, files, message, committedAt }, { api }) {
    if (!snapshot?.headSha || !snapshot?.treeSha) throw new Error('Git snapshot is required');
    if (!Array.isArray(files) || files.length === 0) throw new Error('Files are required');
    if (new Set(files.map((file) => file.path)).size !== files.length) {
        throw new Error('Duplicate atomic commit paths');
    }

    const tree = [];
    for (const file of files) {
        if (typeof file.path !== 'string' || typeof file.content !== 'string') {
            throw new Error('Invalid atomic commit file');
        }
        const blob = await api(env, '/git/blobs', 'POST', {
            content: file.content,
            encoding: 'utf-8',
        });
        if (!/^[a-f0-9]{40}$/.test(blob?.sha || '')) throw new Error('Invalid created blob SHA');
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const createdTree = await api(env, '/git/trees', 'POST', {
        base_tree: snapshot.treeSha,
        tree,
    });
    if (!/^[a-f0-9]{40}$/.test(createdTree?.sha || '')) throw new Error('Invalid created tree SHA');
    const identity = {
        name: 'Bubble Brain Worker',
        email: 'worker@bubblenews.today',
        date: committedAt,
    };
    const candidate = await api(env, '/git/commits', 'POST', {
        message,
        tree: createdTree.sha,
        parents: [snapshot.headSha],
        author: identity,
        committer: identity,
    });
    if (!/^[a-f0-9]{40}$/.test(candidate?.sha || '')) throw new Error('Invalid created commit SHA');
    return { sha: candidate.sha, treeSha: createdTree.sha };
}

export async function commitFilesAtomically(
    env,
    { snapshot, files, message, committedAt },
    { api = callGitHubApi } = {},
) {
    const candidate = await createCandidateCommit(
        env,
        {
            snapshot,
            files,
            message,
            committedAt,
        },
        { api },
    );
    const candidateSha = candidate.sha;

    try {
        await api(env, `/git/refs/heads/${refPath(snapshot.branch)}`, 'PATCH', {
            sha: candidateSha,
            force: false,
        });
        return { commitSha: candidateSha, reconciled: false, pending: false };
    } catch (updateError) {
        let current;
        try {
            current = await resolveBranchSnapshot(env, {
                api,
                branch: snapshot.branch,
            });
            if (await isCommitIncluded(env, candidateSha, current.headSha, { api })) {
                return { commitSha: candidateSha, reconciled: true, pending: false };
            }
        } catch (reconcileError) {
            throw new AtomicGitUncertainError('Git ref update outcome could not be reconciled', {
                cause: reconcileError,
            });
        }
        throw new AtomicGitConflictError('Git branch moved before atomic publication', {
            cause: updateError,
        });
    }
}

async function listOpenPublicationPulls(env, baseBranch, { api }) {
    return listPublicationPulls(env, baseBranch, 'open', { api });
}

async function listPublicationPulls(env, baseBranch, state, { api }) {
    const query = new URLSearchParams({
        state,
        base: baseBranch,
        per_page: '100',
    });
    const pulls = await api(env, `/pulls?${query.toString()}`);
    if (!Array.isArray(pulls)) throw new Error('Invalid GitHub pull request list');
    return pulls;
}

export async function resolvePublicationAlias(env, candidateSha, baseBranch, { api = callGitHubApi } = {}) {
    if (!/^[a-f0-9]{40}$/.test(candidateSha || '')) return null;
    const pulls = await listPublicationPulls(env, baseBranch, 'all', { api });
    let currentSha = candidateSha;
    const visited = new Set([currentSha]);
    for (let depth = 0; depth < 8; depth += 1) {
        const marker = `<!-- supersedes-candidate:${currentSha} -->`;
        const matches = pulls.filter(
            (pull) => isSameRepositoryPull(env, pull) && String(pull?.body || '').includes(marker),
        );
        if (matches.length > 1) {
            throw new AtomicGitConflictError('Multiple publication aliases target one candidate');
        }
        if (matches.length === 0) return null;
        const pull = matches[0];
        const nextSha = pull?.head?.sha;
        if (!/^[a-f0-9]{40}$/.test(nextSha || '') || visited.has(nextSha)) {
            throw new AtomicGitConflictError('Invalid publication alias chain');
        }
        visited.add(nextSha);
        currentSha = nextSha;
        if (pull.state === 'open' || pull.merged_at) {
            return {
                commitSha: currentSha,
                pull: {
                    number: pull.number,
                    url: pull.html_url,
                    state: pull.state,
                    mergedAt: pull.merged_at || null,
                },
            };
        }
    }
    throw new AtomicGitConflictError('Publication alias chain exceeds the replay limit');
}

async function ensureCandidateRef(env, branch, candidateSha, { api }) {
    try {
        await api(env, '/git/refs', 'POST', {
            ref: `refs/heads/${branch}`,
            sha: candidateSha,
        });
        return false;
    } catch (createError) {
        try {
            const ref = await api(env, `/git/ref/heads/${refPath(branch)}`);
            if (ref?.object?.sha === candidateSha) return true;
        } catch (reconcileError) {
            throw new AtomicGitUncertainError('Publication ref creation could not be reconciled', {
                cause: reconcileError,
            });
        }
        throw new AtomicGitConflictError('Publication ref already exists at another commit', {
            cause: createError,
        });
    }
}

async function refShaOrNull(env, branch, { api }) {
    try {
        const ref = await api(env, `/git/ref/heads/${refPath(branch)}`);
        return ref?.object?.sha || null;
    } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
    }
}

export async function acquirePublicationLock(env, snapshot, baseBranch, { api, now = new Date() } = {}) {
    const prefix = String(env.GITHUB_PUBLISH_BRANCH_PREFIX || '').replace(/^\/+|\/+$/g, '');
    const baseSegment = String(baseBranch || '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    if (!baseSegment) throw new Error('Invalid base branch for publication lock');
    const lockBranch = `${prefix}-lock-${baseSegment}`;
    const instant = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(instant.getTime())) throw new Error('Invalid publication lock time');
    const identity = {
        name: 'Bubble Brain Worker',
        email: 'worker@bubblenews.today',
        date: instant.toISOString(),
    };
    const lockCommit = await api(env, '/git/commits', 'POST', {
        message: `Publication lock ${crypto.randomUUID()}`,
        tree: snapshot.treeSha,
        parents: [snapshot.headSha],
        author: identity,
        committer: identity,
    });
    const lockSha = lockCommit?.sha;
    if (!/^[a-f0-9]{40}$/.test(lockSha || '')) throw new Error('Invalid publication lock SHA');

    const create = () =>
        api(env, '/git/refs', 'POST', {
            ref: `refs/heads/${lockBranch}`,
            sha: lockSha,
        });
    try {
        await create();
        return { branch: lockBranch, sha: lockSha, reconciled: false };
    } catch (createError) {
        const currentSha = await refShaOrNull(env, lockBranch, { api });
        if (currentSha === lockSha) {
            return { branch: lockBranch, sha: lockSha, reconciled: true };
        }
        if (!currentSha) {
            throw new AtomicGitUncertainError('Publication lock creation could not be reconciled', {
                cause: createError,
            });
        }
        const current = await api(env, `/git/commits/${currentSha}`);
        const createdAt = new Date(current?.committer?.date).getTime();
        const released = String(current?.message || '').startsWith(PUBLICATION_LOCK_RELEASE_PREFIX);
        if (!released && (!Number.isFinite(createdAt) || instant.getTime() - createdAt <= PUBLICATION_LOCK_TTL_MS)) {
            throw new AtomicGitConflictError('Another publication holds the Git lock', {
                cause: createError,
            });
        }
        const takeoverCommit = await api(env, '/git/commits', 'POST', {
            message: released
                ? `Publication lock ${crypto.randomUUID()}`
                : `Publication lock takeover ${crypto.randomUUID()}`,
            tree: snapshot.treeSha,
            parents: [currentSha],
            author: identity,
            committer: identity,
        });
        const takeoverSha = takeoverCommit?.sha;
        if (!/^[a-f0-9]{40}$/.test(takeoverSha || '')) {
            throw new Error('Invalid publication lock takeover SHA');
        }
        try {
            await api(env, `/git/refs/heads/${refPath(lockBranch)}`, 'PATCH', {
                sha: takeoverSha,
                force: false,
            });
            return {
                branch: lockBranch,
                sha: takeoverSha,
                reconciled: false,
                ...(released ? { acquiredReleased: true } : { replacedStale: true }),
            };
        } catch (retryError) {
            if ((await refShaOrNull(env, lockBranch, { api })) === takeoverSha) {
                return {
                    branch: lockBranch,
                    sha: takeoverSha,
                    reconciled: true,
                    ...(released ? { acquiredReleased: true } : { replacedStale: true }),
                };
            }
            throw new AtomicGitConflictError('Publication lock was acquired concurrently', {
                cause: retryError,
            });
        }
    }
}

export async function releasePublicationLock(env, lock, { api, now = new Date() } = {}) {
    const currentSha = await refShaOrNull(env, lock.branch, { api });
    if (currentSha === null) return { reconciled: true };
    if (currentSha !== lock.sha) {
        const current = await api(env, `/git/commits/${currentSha}`);
        const releasedByOwner = String(current?.message || '').startsWith(PUBLICATION_LOCK_RELEASE_PREFIX)
            && current?.parents?.some(parent => parent?.sha === lock.sha);
        if (releasedByOwner) return { reconciled: true };
        throw new AtomicGitUncertainError('Publication lock owner changed before release');
    }
    const instant = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(instant.getTime())) throw new Error('Invalid publication lock release time');
    const current = await api(env, `/git/commits/${currentSha}`);
    const treeSha = current?.tree?.sha;
    if (!/^[a-f0-9]{40}$/.test(treeSha || '')) {
        throw new AtomicGitUncertainError('Publication lock tree could not be verified before release');
    }
    const identity = {
        name: 'Bubble Brain Worker',
        email: 'worker@bubblenews.today',
        date: instant.toISOString(),
    };
    const releaseCommit = await api(env, '/git/commits', 'POST', {
        message: `${PUBLICATION_LOCK_RELEASE_PREFIX}${crypto.randomUUID()}`,
        tree: treeSha,
        parents: [lock.sha],
        author: identity,
        committer: identity,
    });
    const releaseSha = releaseCommit?.sha;
    if (!/^[a-f0-9]{40}$/.test(releaseSha || '')) {
        throw new AtomicGitUncertainError('Invalid publication lock release SHA');
    }
    try {
        await api(env, `/git/refs/heads/${refPath(lock.branch)}`, 'PATCH', {
            sha: releaseSha,
            force: false,
        });
        return { reconciled: false };
    } catch (releaseError) {
        if ((await refShaOrNull(env, lock.branch, { api })) === releaseSha) {
            return { reconciled: true };
        }
        throw new AtomicGitUncertainError('Publication lock release could not be reconciled', {
            cause: releaseError,
        });
    }
}

function comparisonPaths(comparison) {
    if (!Array.isArray(comparison?.files) || comparison.files.length >= 300) {
        throw new AtomicGitConflictError('Publication comparison is incomplete or too large');
    }
    return comparison.files
        .map((file) => file?.filename)
        .filter(Boolean)
        .sort();
}

async function replayPublicationChain(env, snapshot, predecessor, baseBranch, mode, { api, candidatePaths = [] }) {
    const baseSnapshot = await resolveBranchSnapshot(env, {
        api,
        branch: baseBranch,
    });
    const comparison = await api(env, `/compare/${baseSnapshot.headSha}...${snapshot.headSha}`);
    const mergeBaseSha = comparison?.merge_base_commit?.sha;
    if (!/^[a-f0-9]{40}$/.test(mergeBaseSha || '')) {
        throw new AtomicGitConflictError('Publication merge base could not be resolved');
    }
    if (mergeBaseSha === baseSnapshot.headSha) {
        return { snapshot, policyChain: null, replayedFrom: null };
    }
    if (
        !Array.isArray(comparison?.commits) ||
        comparison.commits.length < 1 ||
        comparison.commits.length !== comparison.total_commits
    ) {
        throw new AtomicGitConflictError('Publication commit chain is incomplete');
    }

    const baseComparison = await api(env, `/compare/${mergeBaseSha}...${baseSnapshot.headSha}`);
    const baseChangedPaths = new Set(comparisonPaths(baseComparison));
    const aggregatePaths = comparisonPaths(comparison);
    const replayWritePaths = new Set([...aggregatePaths, ...candidatePaths]);
    if ([...replayWritePaths].some((path) => baseChangedPaths.has(path))) {
        throw new AtomicGitConflictError('Main changed a publication artifact being replayed');
    }

    const oldPolicyChain = [];
    const replayEntries = [];
    let expectedParent = mergeBaseSha;
    for (const summary of comparison.commits) {
        const commitSha = summary?.sha;
        if (!/^[a-f0-9]{40}$/.test(commitSha || '')) {
            throw new AtomicGitConflictError('Invalid pending publication commit SHA');
        }
        const commit = await api(env, `/git/commits/${commitSha}`);
        const parentShas = commit?.parents?.map((parent) => parent.sha) || [];
        const details = parsePublicationCommit(commit?.message);
        if (parentShas.length !== 1 || parentShas[0] !== expectedParent || details?.mode !== mode) {
            throw new AtomicGitConflictError('Pending publication chain is not replayable');
        }
        const expectedPaths = expectedPublicationPaths(details.reportDate, mode);
        const commitComparison = await api(env, `/compare/${expectedParent}...${commitSha}`);
        const changedPaths = comparisonPaths(commitComparison);
        if (
            changedPaths.length !== expectedPaths.length ||
            expectedPaths.some((path, index) => path !== changedPaths[index])
        ) {
            throw new AtomicGitConflictError('Pending publication commit paths are not replayable');
        }
        const treeSha = commit?.tree?.sha;
        if (!/^[a-f0-9]{40}$/.test(treeSha || '')) {
            throw new AtomicGitConflictError('Pending publication tree is invalid');
        }
        const reader = createSnapshotReader(env, { treeSha }, { api });
        const files = [];
        for (const path of expectedPaths) {
            const content = await reader.readText(path);
            if (content === null) throw new AtomicGitConflictError(`Pending artifact is missing: ${path}`);
            files.push({ path, content });
        }
        let report;
        if (mode === 'structured') {
            try {
                report = JSON.parse(files.find((file) => file.path.endsWith('.json')).content);
            } catch {
                throw new AtomicGitConflictError('Pending structured report is invalid');
            }
        }
        oldPolicyChain.push({
            sha: commitSha,
            parents: parentShas,
            message: commit.message,
            changedPaths,
            report,
        });
        replayEntries.push({
            files,
            message: commit.message,
            committedAt: commit?.committer?.date,
        });
        expectedParent = commitSha;
    }
    validatePublicationPull({
        baseSha: baseSnapshot.headSha,
        mergeBaseSha,
        headSha: snapshot.headSha,
        headRef: snapshot.branch,
        body: predecessor?.body,
        commitChain: oldPolicyChain,
        changedPaths: aggregatePaths,
    });

    let replaySnapshot = baseSnapshot;
    const policyChain = [];
    for (const entry of replayEntries) {
        const created = await createCandidateCommit(
            env,
            {
                snapshot: replaySnapshot,
                ...entry,
            },
            { api },
        );
        policyChain.push({
            sha: created.sha,
            parents: [replaySnapshot.headSha],
            message: entry.message,
            changedPaths: entry.files.map((file) => file.path).sort(),
            ...(mode === 'structured'
                ? {
                      report: JSON.parse(entry.files.find((file) => file.path.endsWith('.json')).content),
                  }
                : {}),
        });
        replaySnapshot = {
            branch: snapshot.branch,
            baseBranch,
            headSha: created.sha,
            treeSha: created.treeSha,
        };
    }
    return {
        snapshot: replaySnapshot,
        policyChain,
        replayedFrom: snapshot.headSha,
    };
}

async function closeSupersededPulls(env, pulls, branchPrefix, exactBranch, { api }) {
    const superseded = pulls.filter(
        (pull) =>
            isSameRepositoryPull(env, pull) &&
            pull?.head?.ref !== exactBranch &&
            String(pull?.head?.ref || '').startsWith(`${branchPrefix}/`),
    );
    for (const pull of superseded) {
        if (!Number.isInteger(pull?.number)) continue;
        try {
            await api(env, `/pulls/${pull.number}`, 'PATCH', { state: 'closed' });
        } catch (closeError) {
            const current = await api(env, `/pulls/${pull.number}`);
            if (current?.state !== 'closed') throw closeError;
        }
        const oldBranch = pull?.head?.ref;
        if (!oldBranch) continue;
        try {
            await api(env, `/git/refs/heads/${refPath(oldBranch)}`, 'DELETE');
        } catch (error) {
            if (!isNotFound(error)) {
                console.warn('[GitPublication] failed to delete superseded branch', {
                    pullNumber: pull.number,
                    errorType: error?.name || 'Error',
                });
            }
        }
    }
}

async function commitFilesViaPullRequestLocked(
    env,
    { snapshot, files, message, committedAt, reportDate, batch, mode },
    { api = callGitHubApi } = {},
) {
    const prefix = String(env.GITHUB_PUBLISH_BRANCH_PREFIX || '').replace(/^\/+|\/+$/g, '');
    if (!prefix || !prefix.split('/').every((part) => /^[a-zA-Z0-9._-]+$/.test(part))) {
        throw new Error('GITHUB_PUBLISH_BRANCH_PREFIX is required for pull request publishing');
    }
    const dateSegment = publicationBranchSegment(reportDate, 'report date');
    const batchSegment = publicationBranchSegment(batch, 'batch');
    const modeSegment = publicationBranchSegment(mode, 'publication mode');
    const baseBranch = snapshot.baseBranch || snapshot.branch;
    const openPulls = await listOpenPublicationPulls(env, baseBranch, { api });
    const publicationPulls = openPulls.filter(
        (pull) => isSameRepositoryPull(env, pull) && publicationBranchDetails(pull?.head?.ref, prefix),
    );

    const predecessor = selectPublicationPull(publicationPulls);
    if (publicationPulls.length > 1) {
        await closeSupersededPulls(
            env,
            publicationPulls.filter((pull) => pull.number !== predecessor.number),
            prefix,
            predecessor.head.ref,
            { api },
        );
    }
    if (predecessor) {
        if (
            snapshot.publicationPullNumber !== predecessor.number ||
            predecessor?.head?.ref !== snapshot.branch ||
            (predecessor?.head?.sha && predecessor.head.sha !== snapshot.headSha)
        ) {
            throw new AtomicGitConflictError('Publication queue moved before candidate creation');
        }
        const predecessorMode = publicationBranchDetails(predecessor.head.ref, prefix)?.mode;
        if (predecessorMode !== modeSegment) {
            throw new AtomicGitConflictError('Cannot supersede a publication from another mode');
        }
    } else if (snapshot.publicationPullNumber !== null && snapshot.publicationPullNumber !== undefined) {
        throw new AtomicGitConflictError('Publication predecessor disappeared before candidate creation');
    }

    const replay = predecessor
        ? await replayPublicationChain(env, snapshot, predecessor, baseBranch, modeSegment, {
              api,
              candidatePaths: files.map((file) => file.path),
          })
        : { snapshot, policyChain: null, replayedFrom: null };
    const candidate = await createCandidateCommit(
        env,
        {
            snapshot: replay.snapshot,
            files,
            message,
            committedAt,
        },
        { api },
    );
    const candidateSha = candidate.sha;
    const familyPrefix = `${prefix}/${dateSegment}-${batchSegment}-${modeSegment}`;
    const branch = `${familyPrefix}/${candidateSha.slice(0, 12)}`;
    const existing = openPulls.find((pull) => isSameRepositoryPull(env, pull) && pull?.head?.ref === branch);

    if (replay.policyChain) {
        let report;
        if (modeSegment === 'structured') {
            try {
                report = JSON.parse(files.find((file) => file.path.endsWith('.json'))?.content);
            } catch {
                throw new AtomicGitConflictError('Structured candidate report is invalid');
            }
        }
        const candidateComparison = await api(env, `/compare/${replay.policyChain[0].parents[0]}...${candidateSha}`);
        validatePublicationPull({
            baseSha: replay.policyChain[0].parents[0],
            headSha: candidateSha,
            headRef: branch,
            body: '<!-- bubble-daily-publication -->',
            commitChain: [
                ...replay.policyChain,
                {
                    sha: candidateSha,
                    parents: [replay.snapshot.headSha],
                    message,
                    changedPaths: files.map((file) => file.path).sort(),
                    report,
                },
            ],
            changedPaths: comparisonPaths(candidateComparison),
        });
    }

    let reconciled = false;
    if (existing) {
        const existingRef = await api(env, `/git/ref/heads/${refPath(branch)}`);
        if (existingRef?.object?.sha !== candidateSha) {
            throw new AtomicGitConflictError('Existing publication pull ref does not match candidate');
        }
        reconciled = true;
    } else {
        reconciled = await ensureCandidateRef(env, branch, candidateSha, { api });
    }

    let pull = existing;
    if (!pull) {
        try {
            pull = await api(env, '/pulls', 'POST', {
                title: `chore: publish daily ${reportDate} ${batch}`,
                head: branch,
                base: baseBranch,
                body: [
                    '<!-- bubble-daily-publication -->',
                    ...(predecessor ? [`<!-- supersedes-candidate:${snapshot.headSha} -->`] : []),
                    `Automated ${mode} publication for ${reportDate} ${batch}.`,
                    '',
                    `Candidate commit: ${candidateSha}`,
                    'This pull request must pass the required Worker and renderer checks before merge.',
                ].join('\n'),
                maintainer_can_modify: false,
            });
        } catch (createError) {
            try {
                const reconciledPulls = await listPublicationPulls(env, baseBranch, 'all', { api });
                pull = reconciledPulls.find(
                    (candidate) => isSameRepositoryPull(env, candidate) && candidate?.head?.ref === branch,
                );
                if (!pull) throw createError;
                reconciled = true;
            } catch (reconcileError) {
                throw new AtomicGitUncertainError('Publication pull request could not be reconciled', {
                    cause: reconcileError,
                });
            }
        }
    }
    if (!Number.isInteger(pull?.number) || typeof pull?.html_url !== 'string') {
        throw new Error('Invalid publication pull request response');
    }
    if (pull.state === 'closed' && !pull.merged_at) {
        throw new AtomicGitConflictError('Publication pull request closed without merge');
    }
    if (predecessor && predecessor.number !== pull.number) {
        await closeSupersededPulls(env, [predecessor], prefix, branch, { api });
    }
    const pending = pull.state === undefined || pull.state === 'open';
    return {
        commitSha: candidateSha,
        reconciled,
        pending,
        branch,
        pullRequest: {
            number: pull.number,
            url: pull.html_url,
        },
    };
}

export async function commitFilesViaPullRequest(env, input, dependencies = {}) {
    const api = dependencies.api || callGitHubApi;
    const acquireLock = dependencies.acquireLock || acquirePublicationLock;
    const releaseLock = dependencies.releaseLock || releasePublicationLock;
    const releaseRetryWait = dependencies.releaseRetryWait
        || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const baseBranch = input?.snapshot?.baseBranch || input?.snapshot?.branch;
    const lock = await acquireLock(env, input.snapshot, baseBranch, {
        api,
        ...(dependencies.lockNow ? { now: dependencies.lockNow } : {}),
    });
    let publicationError = null;
    let publication = null;
    try {
        publication = await commitFilesViaPullRequestLocked(env, input, { api });
    } catch (error) {
        publicationError = error;
    }

    let releaseError = null;
    let releaseAttempts = 0;
    for (let attempt = 1; attempt <= PUBLICATION_LOCK_RELEASE_ATTEMPTS; attempt += 1) {
        releaseAttempts = attempt;
        try {
            await releaseLock(env, lock, { api });
            releaseError = null;
            break;
        } catch (error) {
            releaseError = error;
            if (attempt < PUBLICATION_LOCK_RELEASE_ATTEMPTS) {
                await releaseRetryWait(attempt * 250);
            }
        }
    }

    if (publicationError) {
        if (releaseError) {
            console.error('[GitPublication] publication and lock release both failed', {
                publicationErrorType: publicationError?.name || 'Error',
                releaseErrorType: releaseError?.name || 'Error',
                releaseAttempts,
            });
        }
        throw publicationError;
    }
    if (releaseError) {
        console.error('[GitPublication] lock release failed after successful publication; continuing', {
            releaseErrorType: releaseError?.name || 'Error',
            releaseAttempts,
        });
        return {
            ...publication,
            lockRelease: {
                status: 'failed',
                error_type: releaseError?.name || 'Error',
                attempts: releaseAttempts,
            },
        };
    }
    return publication;
}

export async function publishFilesAtomically(env, input, dependencies = {}) {
    const strategy = env.GITHUB_PUBLISH_STRATEGY || 'direct';
    if (strategy === 'direct') return commitFilesAtomically(env, input, dependencies);
    if (strategy === 'pull_request') {
        return commitFilesViaPullRequest(env, input, dependencies);
    }
    throw new Error('GITHUB_PUBLISH_STRATEGY must be direct or pull_request');
}
