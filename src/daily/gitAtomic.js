import { callGitHubApi } from '../github.js';

function refPath(branch) {
    return branch.split('/').map(encodeURIComponent).join('/');
}

function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
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

export async function resolveBranchSnapshot(env, {
    api = callGitHubApi,
    branch = env.GITHUB_BRANCH,
} = {}) {
    if (!branch) throw new Error('GITHUB_BRANCH is required');
    const ref = await api(env, `/git/ref/heads/${refPath(branch)}`);
    const headSha = ref?.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(headSha || '')) throw new Error('Invalid Git branch head');
    const commit = await api(env, `/git/commits/${headSha}`);
    const treeSha = commit?.tree?.sha;
    if (!/^[a-f0-9]{40}$/.test(treeSha || '')) throw new Error('Invalid Git commit tree');
    return { branch, headSha, treeSha };
}

export function createSnapshotReader(env, snapshot, {
    api = callGitHubApi,
    maxBlobBytes = 10 * 1024 * 1024,
} = {}) {
    const treeCache = new Map();
    const blobCache = new Map();

    async function treeEntries(treeSha) {
        if (!treeCache.has(treeSha)) {
            treeCache.set(treeSha, api(env, `/git/trees/${treeSha}`).then(result => {
                if (!Array.isArray(result?.tree)) throw new Error('Invalid Git tree response');
                return result.tree;
            }));
        }
        return treeCache.get(treeSha);
    }

    async function readText(path) {
        const parts = String(path).split('/').filter(Boolean);
        if (parts.length === 0) throw new Error('Git path is required');
        let treeSha = snapshot.treeSha;
        for (let index = 0; index < parts.length; index += 1) {
            const entries = await treeEntries(treeSha);
            const entry = entries.find(candidate => candidate.path === parts[index]);
            if (!entry) return null;
            const last = index === parts.length - 1;
            if (last) {
                if (entry.type !== 'blob') throw new Error(`Git path is not a blob: ${path}`);
                if (!blobCache.has(entry.sha)) {
                    blobCache.set(entry.sha, api(env, `/git/blobs/${entry.sha}`).then(blob => {
                        if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') {
                            throw new Error(`Invalid Git blob response: ${path}`);
                        }
                        if (!Number.isInteger(blob.size) || blob.size < 0 || blob.size > maxBlobBytes) {
                            throw new Error(`Git blob exceeds structured read limit: ${path}`);
                        }
                        return decodeBase64Utf8(blob.content);
                    }));
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
    return comparison?.merge_base_commit?.sha === candidateSha
        && ['ahead', 'identical'].includes(comparison.status);
}

export async function verifySnapshotHead(env, snapshot, { api = callGitHubApi } = {}) {
    const current = await resolveBranchSnapshot(env, { api, branch: snapshot.branch });
    return current.headSha === snapshot.headSha;
}

export async function commitFilesAtomically(env, {
    snapshot,
    files,
    message,
    committedAt,
}, { api = callGitHubApi } = {}) {
    if (!snapshot?.headSha || !snapshot?.treeSha) throw new Error('Git snapshot is required');
    if (!Array.isArray(files) || files.length === 0) throw new Error('Files are required');
    if (new Set(files.map(file => file.path)).size !== files.length) {
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

    try {
        await api(env, `/git/refs/heads/${refPath(snapshot.branch)}`, 'PATCH', {
            sha: candidate.sha,
            force: false,
        });
        return { commitSha: candidate.sha, reconciled: false };
    } catch (updateError) {
        let current;
        try {
            current = await resolveBranchSnapshot(env, { api, branch: snapshot.branch });
            if (await isCommitIncluded(env, candidate.sha, current.headSha, { api })) {
                return { commitSha: candidate.sha, reconciled: true };
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
