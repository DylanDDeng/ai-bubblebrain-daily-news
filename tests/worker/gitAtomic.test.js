import { describe, expect, it, vi } from 'vitest';
import {
    AtomicGitConflictError,
    AtomicGitUncertainError,
    acquirePublicationLock,
    commitFilesAtomically,
    commitFilesViaPullRequest,
    createSnapshotReader,
    publishFilesAtomically,
    releasePublicationLock,
    resolveBranchSnapshot,
    resolveCommitSnapshot,
    resolvePublicationAlias,
    resolvePublicationSnapshot,
} from '../../src/daily/gitAtomic.js';
import { validatePublicationPull } from '../../scripts/verify-publication-pr.mjs';

const sha = (character) => character.repeat(40);
const snapshot = { branch: 'main', headSha: sha('a'), treeSha: sha('b') };
const lockEnv = { GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily' };
const lockBranch = 'automation/daily-lock-main';
const lockRefPath = `/git/ref/heads/${lockBranch}`;
const lockRefsPath = `/git/refs/heads/${lockBranch}`;

function publicationFiles() {
    return [
        { path: 'data/daily/2026-07-14.json', content: '{}' },
        { path: 'daily/2026-07-14.md', content: 'daily' },
        { path: 'content/daily/2026-07-14.md', content: 'content' },
    ];
}

function prDependencies(api) {
    return {
        api,
        acquireLock: vi.fn(async () => ({
            branch: 'automation/daily-lock-main',
            sha: sha('f'),
        })),
        releaseLock: vi.fn(async () => ({ reconciled: false })),
    };
}

describe('atomic Git publication', () => {
    it('acquires a fresh publication lock through an atomic ref create', async () => {
        const calls = [];
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/commits' && method === 'POST') return { sha: sha('1') };
            if (path === '/git/refs' && method === 'POST') return { ref: body.ref };
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ).resolves.toEqual({
            branch: lockBranch,
            sha: sha('1'),
            reconciled: false,
        });
        expect(calls.find((call) => call.path === '/git/refs').body).toEqual({
            ref: `refs/heads/${lockBranch}`,
            sha: sha('1'),
        });
    });

    it('reconciles a lost lock create response when its exact ref exists', async () => {
        const api = vi.fn(async (_env, path, method = 'GET') => {
            if (path === '/git/commits' && method === 'POST') return { sha: sha('1') };
            if (path === '/git/refs' && method === 'POST') throw new Error('connection reset');
            if (path === lockRefPath) return { object: { sha: sha('1') } };
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ).resolves.toEqual({ branch: lockBranch, sha: sha('1'), reconciled: true });
    });

    it('acquires a released persistent lock through a non-force CAS', async () => {
        let commitIndex = 0;
        const calls = [];
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/commits' && method === 'POST') {
                return { sha: [sha('1'), sha('2')][commitIndex++] };
            }
            if (path === '/git/refs' && method === 'POST') throw new Error('422 reference already exists');
            if (path === lockRefPath) return { object: { sha: sha('9') } };
            if (path === `/git/commits/${sha('9')}`) {
                return {
                    message: 'Publication lock released previous-owner',
                    committer: { date: '2026-07-14T01:59:59Z' },
                };
            }
            if (path === lockRefsPath && method === 'PATCH') return {};
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ).resolves.toEqual({
            branch: lockBranch,
            sha: sha('2'),
            reconciled: false,
            acquiredReleased: true,
        });
        const successor = calls.filter((call) => call.path === '/git/commits')[1];
        expect(successor.body.parents).toEqual([sha('9')]);
        expect(calls.find((call) => call.path === lockRefsPath).body).toEqual({
            sha: sha('2'),
            force: false,
        });
    });

    it('allows exactly one contender to acquire a fresh publication lock', async () => {
        let commitIndex = 0;
        let currentSha = null;
        const lockDates = new Map();
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            if (path === '/git/commits' && method === 'POST') {
                const commitSha = [sha('1'), sha('2')][commitIndex++];
                lockDates.set(commitSha, body.committer.date);
                return { sha: commitSha };
            }
            if (path === '/git/refs' && method === 'POST') {
                if (currentSha) throw new Error('422 reference already exists');
                currentSha = body.sha;
                return { ref: body.ref };
            }
            if (path === lockRefPath) return { object: { sha: currentSha } };
            if (path.startsWith('/git/commits/')) {
                return {
                    committer: {
                        date: lockDates.get(path.slice('/git/commits/'.length)),
                    },
                };
            }
            throw new Error(`unexpected ${method} ${path}`);
        });

        const contenders = await Promise.allSettled([
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ]);

        expect(contenders.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = contenders.filter((result) => result.status === 'rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(AtomicGitConflictError);
    });

    it('rejects a contender while the current publication lock is fresh', async () => {
        const api = vi.fn(async (_env, path, method = 'GET') => {
            if (path === '/git/commits' && method === 'POST') return { sha: sha('1') };
            if (path === '/git/refs' && method === 'POST') throw new Error('422 reference already exists');
            if (path === lockRefPath) return { object: { sha: sha('9') } };
            if (path === `/git/commits/${sha('9')}`) {
                return { committer: { date: '2026-07-14T01:59:00Z' } };
            }
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ).rejects.toBeInstanceOf(AtomicGitConflictError);
        expect(api.mock.calls.some((call) => call[2] === 'PATCH')).toBe(false);
    });

    it('takes over a stale lock only through a non-force fast-forward', async () => {
        const calls = [];
        let commitIndex = 0;
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/commits' && method === 'POST') {
                return { sha: [sha('1'), sha('2')][commitIndex++] };
            }
            if (path === '/git/refs' && method === 'POST') throw new Error('422 reference already exists');
            if (path === lockRefPath) return { object: { sha: sha('9') } };
            if (path === `/git/commits/${sha('9')}`) {
                return { committer: { date: '2026-07-14T01:00:00Z' } };
            }
            if (path === lockRefsPath && method === 'PATCH') return {};
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ).resolves.toEqual({
            branch: lockBranch,
            sha: sha('2'),
            reconciled: false,
            replacedStale: true,
        });
        const takeoverCommit = calls.filter((call) => call.path === '/git/commits')[1];
        expect(takeoverCommit.body.parents).toEqual([sha('9')]);
        expect(calls.find((call) => call.path === lockRefsPath && call.method === 'PATCH').body).toEqual({
            sha: sha('2'),
            force: false,
        });
    });

    it('allows exactly one stale-lock contender to win the CAS takeover', async () => {
        let commitIndex = 0;
        let currentSha = sha('9');
        let patchArrivals = 0;
        let releasePatches;
        const patchBarrier = new Promise((resolve) => {
            releasePatches = resolve;
        });
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            if (path === '/git/commits' && method === 'POST') {
                return { sha: [sha('1'), sha('2'), sha('3'), sha('4')][commitIndex++] };
            }
            if (path === '/git/refs' && method === 'POST') throw new Error('422 reference already exists');
            if (path === lockRefPath) return { object: { sha: currentSha } };
            if (path === `/git/commits/${sha('9')}`) {
                return { committer: { date: '2026-07-14T01:00:00Z' } };
            }
            if (path === lockRefsPath && method === 'PATCH') {
                patchArrivals += 1;
                if (patchArrivals === 2) releasePatches();
                await patchBarrier;
                if (currentSha !== sha('9')) throw new Error('422 not a fast-forward');
                currentSha = body.sha;
                return {};
            }
            throw new Error(`unexpected ${method} ${path}`);
        });

        const contenders = await Promise.allSettled([
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
            acquirePublicationLock(lockEnv, snapshot, 'main', {
                api,
                now: new Date('2026-07-14T02:00:00Z'),
            }),
        ]);

        expect(contenders.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = contenders.filter((result) => result.status === 'rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(AtomicGitConflictError);
        expect(api.mock.calls.filter((call) => call[1] === lockRefsPath && call[2] === 'PATCH')).toHaveLength(2);
    });

    it('never releases another owner lock and reconciles a lost release CAS response', async () => {
        const changedOwnerApi = vi.fn(async (_env, path, method = 'GET') => {
            if (path === lockRefPath) return { object: { sha: sha('2') } };
            throw new Error(`unexpected ${method} ${path}`);
        });
        await expect(
            releasePublicationLock(
                lockEnv,
                {
                    branch: lockBranch,
                    sha: sha('1'),
                },
                { api: changedOwnerApi },
            ),
        ).rejects.toBeInstanceOf(AtomicGitUncertainError);
        expect(changedOwnerApi.mock.calls.some((call) => call[1] === '/git/commits')).toBe(false);

        let currentSha = sha('1');
        const calls = [];
        const lostReleaseApi = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === lockRefPath) return { object: { sha: currentSha } };
            if (path === `/git/commits/${sha('1')}` && method === 'GET') {
                return { tree: { sha: sha('b') } };
            }
            if (path === '/git/commits' && method === 'POST') return { sha: sha('3') };
            if (path === lockRefsPath && method === 'PATCH') {
                currentSha = body.sha;
                throw new Error('connection reset');
            }
            throw new Error(`unexpected ${method} ${path}`);
        });
        await expect(
            releasePublicationLock(
                lockEnv,
                {
                    branch: lockBranch,
                    sha: sha('1'),
                },
                {
                    api: lostReleaseApi,
                    now: new Date('2026-07-14T02:01:00Z'),
                },
            ),
        ).resolves.toEqual({ reconciled: true });
        expect(currentSha).toBe(sha('3'));
        const releaseCommit = calls.find((call) => call.path === '/git/commits' && call.method === 'POST');
        expect(releaseCommit.body.parents).toEqual([sha('1')]);
        expect(releaseCommit.body.tree).toBe(sha('b'));
        expect(calls.find((call) => call.path === lockRefsPath).body).toEqual({
            sha: sha('3'),
            force: false,
        });
        expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    });

    it('cannot overwrite a stale takeover that wins during release', async () => {
        let currentSha = sha('1');
        const api = vi.fn(async (_env, path, method = 'GET') => {
            if (path === lockRefPath) return { object: { sha: currentSha } };
            if (path === `/git/commits/${sha('1')}`) return { tree: { sha: sha('b') } };
            if (path === '/git/commits' && method === 'POST') return { sha: sha('3') };
            if (path === lockRefsPath && method === 'PATCH') {
                currentSha = sha('2');
                throw new Error('422 not a fast-forward');
            }
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            releasePublicationLock(
                lockEnv,
                {
                    branch: lockBranch,
                    sha: sha('1'),
                },
                {
                    api,
                    now: new Date('2026-07-14T02:20:00Z'),
                },
            ),
        ).rejects.toBeInstanceOf(AtomicGitUncertainError);
        expect(currentSha).toBe(sha('2'));
        expect(api.mock.calls.some((call) => call[2] === 'DELETE')).toBe(false);
    });

    it('preserves the publication failure when lock release also fails', async () => {
        const publicationError = new RangeError('publication failed');
        const releaseError = new AtomicGitUncertainError('release failed');
        const releaseLock = vi.fn(async () => {
            throw releaseError;
        });
        const api = vi.fn(async (_env, path) => {
            if (path === '/pulls?state=open&base=main&per_page=100') return [];
            if (path === '/git/blobs') throw publicationError;
            throw new Error(`unexpected ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                lockEnv,
                {
                    snapshot,
                    files: [{ path: 'daily.md', content: 'daily' }],
                    message: 'publish',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                {
                    api,
                    acquireLock: vi.fn(async () => ({
                        branch: lockBranch,
                        sha: sha('1'),
                    })),
                    releaseLock,
                },
            ),
        ).rejects.toBe(publicationError);
        expect(releaseLock).toHaveBeenCalledOnce();
    });

    it('propagates a lock release failure after a successful publication', async () => {
        const releaseError = new AtomicGitUncertainError('release failed');
        const api = vi.fn(async (_env, path, method = 'GET') => {
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100') return [];
            if (path === '/git/refs' && method === 'POST') return {};
            if (path === '/pulls' && method === 'POST') {
                return {
                    number: 42,
                    html_url: 'https://example.test/pr/42',
                    state: 'open',
                };
            }
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                lockEnv,
                {
                    snapshot,
                    files: [{ path: 'daily.md', content: 'daily' }],
                    message: 'publish',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                {
                    api,
                    acquireLock: vi.fn(async () => ({
                        branch: lockBranch,
                        sha: sha('9'),
                    })),
                    releaseLock: vi.fn(async () => {
                        throw releaseError;
                    }),
                },
            ),
        ).rejects.toBe(releaseError);
    });

    it('resolves an immutable branch head and reads nested files only through its tree', async () => {
        const calls = [];
        const api = vi.fn(async (_env, path) => {
            calls.push(path);
            if (path === '/git/ref/heads/main') return { object: { sha: sha('a') } };
            if (path === `/git/commits/${sha('a')}`) return { tree: { sha: sha('b') } };
            if (path === `/git/trees/${sha('b')}`) return { tree: [{ path: 'data', type: 'tree', sha: sha('c') }] };
            if (path === `/git/trees/${sha('c')}`) return { tree: [{ path: 'daily', type: 'tree', sha: sha('d') }] };
            if (path === `/git/trees/${sha('d')}`)
                return {
                    tree: [{ path: '2026-07-14.json', type: 'blob', sha: sha('e') }],
                };
            if (path === `/git/blobs/${sha('e')}`) {
                return {
                    encoding: 'base64',
                    size: 2,
                    content: Buffer.from('{}').toString('base64'),
                };
            }
            throw new Error(`unexpected ${path}`);
        });

        const resolved = await resolveBranchSnapshot({}, { api, branch: 'main' });
        const reader = createSnapshotReader({}, resolved, { api });
        expect(await reader.readText('data/daily/2026-07-14.json')).toBe('{}');
        expect(await reader.readText('data/daily/2026-07-14.json')).toBe('{}');
        expect(calls.filter((path) => path === `/git/blobs/${sha('e')}`)).toHaveLength(1);
        expect(calls.some((path) => path.includes('/contents/'))).toBe(false);
    });

    it('resolves only a validated exact commit snapshot', async () => {
        const api = vi.fn(async (_env, path) => {
            if (path === `/git/commits/${sha('a')}`) return { tree: { sha: sha('b') } };
            return { tree: { sha: 'invalid' } };
        });

        await expect(resolveCommitSnapshot({}, sha('a'), { api })).resolves.toEqual({
            branch: null,
            headSha: sha('a'),
            treeSha: sha('b'),
        });
        await expect(resolveCommitSnapshot({}, 'invalid', { api })).rejects.toThrow('Invalid Git commit SHA');
        await expect(resolveCommitSnapshot({}, sha('c'), { api })).rejects.toThrow('Invalid Git commit tree');
        expect(api).not.toHaveBeenCalledWith(expect.anything(), '/git/commits/invalid');
    });

    it('creates three blobs, one tree, one commit with the base head parent, and one non-force ref update', async () => {
        let blobIndex = 0;
        const calls = [];
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/blobs') return { sha: [sha('c'), sha('d'), sha('e')][blobIndex++] };
            if (path === '/git/trees') return { sha: sha('f') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/git/refs/heads/main') return { object: { sha: sha('1') } };
            throw new Error(`unexpected ${path}`);
        });

        const result = await commitFilesAtomically(
            {},
            {
                snapshot,
                files: publicationFiles(),
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
            },
            { api },
        );

        expect(result).toEqual({
            commitSha: sha('1'),
            reconciled: false,
            pending: false,
        });
        expect(calls.filter((call) => call.path === '/git/blobs')).toHaveLength(3);
        const tree = calls.find((call) => call.path === '/git/trees');
        expect(tree.body.base_tree).toBe(snapshot.treeSha);
        expect(tree.body.tree.map((entry) => entry.path)).toEqual(publicationFiles().map((file) => file.path));
        const commit = calls.find((call) => call.path === '/git/commits');
        expect(commit.body.parents).toEqual([snapshot.headSha]);
        const patch = calls.find((call) => call.method === 'PATCH');
        expect(patch.body).toEqual({ sha: sha('1'), force: false });
    });

    it('never updates the ref after an intermediate blob, tree, or commit failure', async () => {
        for (const failedPath of ['/git/blobs', '/git/trees', '/git/commits']) {
            let blobIndex = 0;
            const api = vi.fn(async (_env, path) => {
                if (path === failedPath) throw new Error(`failed ${path}`);
                if (path === '/git/blobs') return { sha: [sha('c'), sha('d'), sha('e')][blobIndex++] };
                if (path === '/git/trees') return { sha: sha('f') };
                if (path === '/git/commits') return { sha: sha('1') };
                throw new Error(`unexpected ${path}`);
            });
            await expect(
                commitFilesAtomically(
                    {},
                    {
                        snapshot,
                        files: publicationFiles(),
                        message: 'publish',
                        committedAt: '2026-07-14T02:00:00Z',
                    },
                    { api },
                ),
            ).rejects.toThrow(`failed ${failedPath}`);
            expect(api.mock.calls.some((call) => call[2] === 'PATCH')).toBe(false);
        }
    });

    it('reconciles a lost PATCH response when the candidate is the head or an ancestor', async () => {
        for (const currentHead of [sha('1'), sha('2')]) {
            const api = vi.fn(async (_env, path, method) => {
                if (path === '/git/blobs') return { sha: sha('c') };
                if (path === '/git/trees') return { sha: sha('d') };
                if (path === '/git/commits') return { sha: sha('1') };
                if (method === 'PATCH') throw new Error('connection reset');
                if (path === '/git/ref/heads/main') return { object: { sha: currentHead } };
                if (path === `/git/commits/${currentHead}`) return { tree: { sha: sha('e') } };
                if (path === `/compare/${sha('1')}...${sha('2')}`) {
                    return { status: 'ahead', merge_base_commit: { sha: sha('1') } };
                }
                throw new Error(`unexpected ${path}`);
            });
            await expect(
                commitFilesAtomically(
                    {},
                    {
                        snapshot,
                        files: [{ path: 'data/daily/2026-07-14.json', content: '{}' }],
                        message: 'publish',
                        committedAt: '2026-07-14T02:00:00Z',
                    },
                    { api },
                ),
            ).resolves.toEqual({
                commitSha: sha('1'),
                reconciled: true,
                pending: false,
            });
        }
    });

    it('classifies a confirmed sibling/base head as conflict and an unreadable head as uncertain', async () => {
        const makeApi = (unreadable) =>
            vi.fn(async (_env, path, method) => {
                if (path === '/git/blobs') return { sha: sha('c') };
                if (path === '/git/trees') return { sha: sha('d') };
                if (path === '/git/commits') return { sha: sha('1') };
                if (method === 'PATCH') throw new Error('update rejected');
                if (path === '/git/ref/heads/main') {
                    if (unreadable) throw new Error('read failed');
                    return { object: { sha: snapshot.headSha } };
                }
                if (path === `/git/commits/${snapshot.headSha}`) return { tree: { sha: snapshot.treeSha } };
                if (path === `/compare/${sha('1')}...${snapshot.headSha}`) {
                    return {
                        status: 'behind',
                        merge_base_commit: { sha: snapshot.headSha },
                    };
                }
                throw new Error(`unexpected ${path}`);
            });
        const input = {
            snapshot,
            files: [{ path: 'data/daily/2026-07-14.json', content: '{}' }],
            message: 'publish',
            committedAt: '2026-07-14T02:00:00Z',
        };
        await expect(commitFilesAtomically({}, input, { api: makeApi(false) })).rejects.toBeInstanceOf(
            AtomicGitConflictError,
        );
        await expect(commitFilesAtomically({}, input, { api: makeApi(true) })).rejects.toBeInstanceOf(
            AtomicGitUncertainError,
        );
    });

    it('rejects blobs above the structured read limit', async () => {
        const api = vi.fn(async (_env, path) => {
            if (path === `/git/trees/${snapshot.treeSha}`) {
                return { tree: [{ path: 'large.json', type: 'blob', sha: sha('c') }] };
            }
            if (path === `/git/blobs/${sha('c')}`) {
                return {
                    encoding: 'base64',
                    size: 11,
                    content: Buffer.from('too large').toString('base64'),
                };
            }
            throw new Error(`unexpected ${path}`);
        });
        const reader = createSnapshotReader({}, snapshot, {
            api,
            maxBlobBytes: 10,
        });
        await expect(reader.readText('large.json')).rejects.toThrow('exceeds structured read limit');
    });

    it('publishes a candidate through a unique pull request without advancing main', async () => {
        let blobIndex = 0;
        const calls = [];
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/blobs') return { sha: [sha('c'), sha('d'), sha('e')][blobIndex++] };
            if (path === '/git/trees') return { sha: sha('f') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100') return [];
            if (path === '/git/refs') return { ref: 'created' };
            if (path === '/pulls') return { number: 42, html_url: 'https://example.test/pr/42' };
            throw new Error(`unexpected ${method} ${path}`);
        });
        const result = await commitFilesViaPullRequest(
            {
                GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
            },
            {
                snapshot,
                files: publicationFiles(),
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
                reportDate: '2026-07-14',
                batch: 'morning',
                mode: 'structured',
            },
            prDependencies(api),
        );

        expect(result).toEqual({
            commitSha: sha('1'),
            reconciled: false,
            pending: true,
            branch: `automation/daily/2026-07-14-morning-structured/${sha('1').slice(0, 12)}`,
            pullRequest: { number: 42, url: 'https://example.test/pr/42' },
        });
        expect(calls.find((call) => call.path === '/git/refs').body).toEqual({
            ref: `refs/heads/${result.branch}`,
            sha: sha('1'),
        });
        expect(calls.find((call) => call.path === '/pulls' && call.method === 'POST').body).toMatchObject({
            head: result.branch,
            base: 'main',
        });
        expect(calls.some((call) => call.method === 'PATCH' && call.path === '/git/refs/heads/main')).toBe(false);
    });

    it('reconciles lost ref and pull responses for the exact candidate', async () => {
        const branch = `automation/daily/2026-07-14-morning-structured/${sha('1').slice(0, 12)}`;
        const pull = {
            number: 42,
            html_url: 'https://example.test/pr/42',
            head: { ref: branch },
        };
        const api = vi.fn(async (_env, path, method = 'GET') => {
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100') return [];
            if (path === '/pulls?state=all&base=main&per_page=100') return [pull];
            if (path === '/git/refs' && method === 'POST') throw new Error('connection reset');
            if (path === `/git/ref/heads/${branch}`) {
                return { object: { sha: sha('1') } };
            }
            if (path === '/pulls' && method === 'POST') throw new Error('connection reset');
            throw new Error(`unexpected ${method} ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                {
                    GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
                },
                {
                    snapshot,
                    files: [{ path: 'daily.md', content: 'daily' }],
                    message: 'publish',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                prDependencies(api),
            ),
        ).resolves.toMatchObject({ reconciled: true, pending: true });
    });

    it('rejects an existing pull request whose ref no longer points at its named candidate', async () => {
        const branch = `automation/daily/2026-07-14-morning-structured/${sha('1').slice(0, 12)}`;
        const api = vi.fn(async (_env, path) => {
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100') {
                return [{ number: 42, html_url: 'existing', head: { ref: branch } }];
            }
            if (path === `/git/ref/heads/${branch}`) return { object: { sha: sha('9') } };
            throw new Error(`unexpected ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                {
                    GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
                },
                {
                    snapshot,
                    files: [{ path: 'daily.md', content: 'daily' }],
                    message: 'publish',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                prDependencies(api),
            ),
        ).rejects.toBeInstanceOf(AtomicGitConflictError);
    });

    it('creates the successor before closing the single in-flight publication', async () => {
        const exactBranch = `automation/daily/2026-07-14-morning-structured/${sha('1').slice(0, 12)}`;
        const supersededBranch = 'automation/daily/2026-07-14-morning-structured/000000000000';
        const otherBranch = 'feature/other';
        const calls = [];
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    { number: 10, html_url: 'old', head: { ref: supersededBranch } },
                    { number: 11, html_url: 'other', head: { ref: otherBranch } },
                ];
            if (path === '/git/ref/heads/main') return { object: { sha: sha('9') } };
            if (path === `/git/commits/${sha('9')}`) return { tree: { sha: sha('8') } };
            if (path === `/compare/${sha('9')}...${snapshot.headSha}`) {
                return { merge_base_commit: { sha: sha('9') } };
            }
            if (path === '/git/refs') return {};
            if (path === '/pulls/10') return {};
            if (path === `/git/refs/heads/${supersededBranch}`) return null;
            if (path === '/pulls') return { number: 42, html_url: 'new', head: { ref: exactBranch } };
            throw new Error(`unexpected ${method} ${path}`);
        });

        await commitFilesViaPullRequest(
            {
                GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
            },
            {
                snapshot: {
                    ...snapshot,
                    branch: supersededBranch,
                    baseBranch: 'main',
                    publicationPullNumber: 10,
                },
                files: [{ path: 'daily.md', content: 'daily' }],
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
                reportDate: '2026-07-14',
                batch: 'morning',
                mode: 'structured',
            },
            prDependencies(api),
        );

        expect(
            calls.some((call) => call.path === '/pulls/10' && call.method === 'PATCH' && call.body.state === 'closed'),
        ).toBe(true);
        expect(calls.some((call) => call.path === '/pulls/11' && call.method === 'PATCH')).toBe(false);
        const createIndex = calls.findIndex((call) => call.path === '/pulls' && call.method === 'POST');
        const closeIndex = calls.findIndex((call) => call.path === '/pulls/10' && call.method === 'PATCH');
        expect(createIndex).toBeGreaterThanOrEqual(0);
        expect(closeIndex).toBeGreaterThan(createIndex);
    });

    it('resolves the single in-flight publication as the next immutable work snapshot', async () => {
        const predecessor = 'automation/daily/2026-07-14-morning-structured/aaaaaaaaaaaa';
        const api = vi.fn(async (_env, path) => {
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        html_url: 'https://example.test/pr/10',
                        head: { ref: predecessor, sha: sha('a') },
                    },
                ];
            if (path === `/git/ref/heads/${predecessor}`) return { object: { sha: sha('a') } };
            if (path === `/git/commits/${sha('a')}`) return { tree: { sha: sha('b') } };
            throw new Error(`unexpected ${path}`);
        });

        await expect(
            resolvePublicationSnapshot(
                {
                    GITHUB_BRANCH: 'main',
                    GITHUB_PUBLISH_STRATEGY: 'pull_request',
                    GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
                },
                { api, expectedMode: 'structured' },
            ),
        ).resolves.toEqual({
            branch: predecessor,
            baseBranch: 'main',
            headSha: sha('a'),
            treeSha: sha('b'),
            publicationPullNumber: 10,
            publicationPull: { number: 10, url: 'https://example.test/pr/10' },
        });
    });

    it('produces a successor branch accepted by the linear promotion policy', async () => {
        const baseSha = sha('9');
        const predecessorSha = sha('a');
        const predecessor = 'automation/daily/2026-07-13-night-structured/aaaaaaaaaaaa';
        const api = vi.fn(async (_env, path) => {
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        html_url: 'old',
                        head: { ref: predecessor, sha: predecessorSha },
                    },
                ];
            if (path === '/git/ref/heads/main') return { object: { sha: baseSha } };
            if (path === `/git/commits/${baseSha}`) return { tree: { sha: sha('8') } };
            if (path === `/compare/${baseSha}...${predecessorSha}`) {
                return { merge_base_commit: { sha: baseSha } };
            }
            if (path === '/git/refs') return {};
            if (path === '/pulls') return { number: 42, html_url: 'new', state: 'open' };
            if (path === '/pulls/10') return {};
            if (path === `/git/refs/heads/${predecessor}`) return null;
            throw new Error(`unexpected ${path}`);
        });
        const result = await commitFilesViaPullRequest(
            {
                GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
            },
            {
                snapshot: {
                    branch: predecessor,
                    baseBranch: 'main',
                    headSha: predecessorSha,
                    treeSha: sha('b'),
                    publicationPullNumber: 10,
                },
                files: publicationFiles(),
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
                reportDate: '2026-07-14',
                batch: 'morning',
                mode: 'structured',
            },
            prDependencies(api),
        );

        expect(
            validatePublicationPull({
                baseSha,
                headSha: result.commitSha,
                headRef: result.branch,
                body: '<!-- bubble-daily-publication -->',
                commitChain: [
                    {
                        sha: predecessorSha,
                        parents: [baseSha],
                        message: 'Structured daily 2026-07-13 night',
                        changedPaths: [
                            'content/daily/2026-07-13.md',
                            'daily/2026-07-13.md',
                            'data/daily/2026-07-13.json',
                        ],
                        report: {
                            date: '2026-07-13',
                            batches: [{ id: 'night', status: 'completed' }],
                        },
                    },
                    {
                        sha: result.commitSha,
                        parents: [predecessorSha],
                        message: 'Structured daily 2026-07-14 morning',
                        changedPaths: publicationFiles().map((file) => file.path),
                        report: {
                            date: '2026-07-14',
                            batches: [{ id: 'morning', status: 'completed' }],
                        },
                    },
                ],
                changedPaths: [
                    'content/daily/2026-07-13.md',
                    'daily/2026-07-13.md',
                    'data/daily/2026-07-13.json',
                    ...publicationFiles().map((file) => file.path),
                ],
            }),
        ).toMatchObject({ commitCount: 2, mode: 'structured' });
    });

    it('replays a behind pending chain onto the latest main before creating its successor', async () => {
        const mergeBase = sha('0');
        const mainHead = sha('9');
        const oldHead = sha('a');
        const replayHead = sha('b');
        const newHead = sha('c');
        const oldBranch = 'automation/daily/2026-07-13-night-structured/aaaaaaaaaaaa';
        const oldPaths = ['content/daily/2026-07-13.md', 'daily/2026-07-13.md', 'data/daily/2026-07-13.json'];
        const newPaths = ['content/daily/2026-07-14.md', 'daily/2026-07-14.md', 'data/daily/2026-07-14.json'];
        const oldReport = JSON.stringify({
            date: '2026-07-13',
            batches: [{ id: 'night', status: 'completed' }],
        });
        const newReport = JSON.stringify({
            date: '2026-07-14',
            batches: [{ id: 'morning', status: 'completed' }],
        });
        const calls = [];
        let treeIndex = 0;
        let commitIndex = 0;
        const api = vi.fn(async (_env, path, method = 'GET', body = null) => {
            calls.push({ path, method, body });
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        html_url: 'old',
                        body: '<!-- bubble-daily-publication -->',
                        head: { ref: oldBranch, sha: oldHead },
                    },
                ];
            if (path === '/git/ref/heads/main') return { object: { sha: mainHead } };
            if (path === `/git/commits/${mainHead}`) return { tree: { sha: sha('8') } };
            if (path === `/compare/${mainHead}...${oldHead}`)
                return {
                    merge_base_commit: { sha: mergeBase },
                    total_commits: 1,
                    commits: [{ sha: oldHead }],
                    files: oldPaths.map((filename) => ({ filename })),
                };
            if (path === `/compare/${mergeBase}...${mainHead}`)
                return {
                    files: [{ filename: 'src/unrelated.js' }],
                };
            if (path === `/compare/${mergeBase}...${oldHead}`)
                return {
                    files: oldPaths.map((filename) => ({ filename })),
                };
            if (path === `/git/commits/${oldHead}`)
                return {
                    message: 'Structured daily 2026-07-13 night',
                    parents: [{ sha: mergeBase }],
                    tree: { sha: sha('7') },
                    committer: { date: '2026-07-13T15:00:00Z' },
                };
            if (path === `/git/trees/${sha('7')}`)
                return {
                    tree: [
                        { path: 'content', type: 'tree', sha: sha('1') },
                        { path: 'daily', type: 'tree', sha: sha('2') },
                        { path: 'data', type: 'tree', sha: sha('3') },
                    ],
                };
            if (path === `/git/trees/${sha('1')}`) return { tree: [{ path: 'daily', type: 'tree', sha: sha('4') }] };
            if (path === `/git/trees/${sha('2')}`)
                return {
                    tree: [{ path: '2026-07-13.md', type: 'blob', sha: sha('d') }],
                };
            if (path === `/git/trees/${sha('3')}`) return { tree: [{ path: 'daily', type: 'tree', sha: sha('5') }] };
            if (path === `/git/trees/${sha('4')}`)
                return {
                    tree: [{ path: '2026-07-13.md', type: 'blob', sha: sha('e') }],
                };
            if (path === `/git/trees/${sha('5')}`)
                return {
                    tree: [{ path: '2026-07-13.json', type: 'blob', sha: sha('f') }],
                };
            if (path === `/git/blobs/${sha('d')}`)
                return {
                    encoding: 'base64',
                    size: 5,
                    content: Buffer.from('daily').toString('base64'),
                };
            if (path === `/git/blobs/${sha('e')}`)
                return {
                    encoding: 'base64',
                    size: 7,
                    content: Buffer.from('content').toString('base64'),
                };
            if (path === `/git/blobs/${sha('f')}`)
                return {
                    encoding: 'base64',
                    size: oldReport.length,
                    content: Buffer.from(oldReport).toString('base64'),
                };
            if (path === '/git/blobs' && method === 'POST') return { sha: sha('6') };
            if (path === '/git/trees' && method === 'POST') {
                return { sha: [sha('6'), sha('7')][treeIndex++] };
            }
            if (path === '/git/commits' && method === 'POST') {
                return { sha: [replayHead, newHead][commitIndex++] };
            }
            if (path === `/compare/${mainHead}...${newHead}`)
                return {
                    files: [...oldPaths, ...newPaths].map((filename) => ({ filename })),
                };
            if (path === '/git/refs' && method === 'POST') return {};
            if (path === '/pulls' && method === 'POST') {
                return { number: 42, html_url: 'new', state: 'open' };
            }
            if (path === '/pulls/10' && method === 'PATCH') return {};
            if (path === `/git/refs/heads/${oldBranch}` && method === 'DELETE') return {};
            throw new Error(`unexpected ${method} ${path}`);
        });

        const result = await commitFilesViaPullRequest(
            {
                GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
            },
            {
                snapshot: {
                    branch: oldBranch,
                    baseBranch: 'main',
                    headSha: oldHead,
                    treeSha: sha('7'),
                    publicationPullNumber: 10,
                },
                files: [
                    { path: newPaths[0], content: 'content-new' },
                    { path: newPaths[1], content: 'daily-new' },
                    { path: newPaths[2], content: newReport },
                ],
                message: 'Structured daily 2026-07-14 morning',
                committedAt: '2026-07-14T02:00:00Z',
                reportDate: '2026-07-14',
                batch: 'morning',
                mode: 'structured',
            },
            prDependencies(api),
        );

        expect(result.commitSha).toBe(newHead);
        expect(result.branch).toBe(`automation/daily/2026-07-14-morning-structured/${newHead.slice(0, 12)}`);
        const createdCommits = calls.filter((call) => call.path === '/git/commits' && call.method === 'POST');
        expect(createdCommits[0].body).toMatchObject({
            message: 'Structured daily 2026-07-13 night',
            parents: [mainHead],
        });
        expect(createdCommits[1].body).toMatchObject({
            message: 'Structured daily 2026-07-14 morning',
            parents: [replayHead],
        });
        const createPullIndex = calls.findIndex((call) => call.path === '/pulls' && call.method === 'POST');
        const closeOldIndex = calls.findIndex((call) => call.path === '/pulls/10' && call.method === 'PATCH');
        expect(closeOldIndex).toBeGreaterThan(createPullIndex);
        expect(calls[createPullIndex].body.body).toContain(`<!-- supersedes-candidate:${oldHead} -->`);
    });

    it('resolves a bounded multi-hop replay alias to the live publication pull', async () => {
        const first = sha('1');
        const second = sha('2');
        const third = sha('3');
        const api = vi.fn(async (_env, path) => {
            if (path === '/pulls?state=all&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        state: 'closed',
                        body: `<!-- supersedes-candidate:${first} -->`,
                        head: { sha: second },
                    },
                    {
                        number: 11,
                        state: 'open',
                        html_url: 'new',
                        body: `<!-- supersedes-candidate:${second} -->`,
                        head: { sha: third },
                    },
                ];
            throw new Error(`unexpected ${path}`);
        });

        await expect(resolvePublicationAlias({}, first, 'main', { api })).resolves.toEqual({
            commitSha: third,
            pull: { number: 11, url: 'new', state: 'open', mergedAt: null },
        });
    });

    it('refuses to replay when main changed a pending publication artifact', async () => {
        const mergeBase = sha('0');
        const mainHead = sha('9');
        const oldHead = sha('a');
        const oldBranch = 'automation/daily/2026-07-13-night-structured/aaaaaaaaaaaa';
        const oldPath = 'data/daily/2026-07-13.json';
        const api = vi.fn(async (_env, path) => {
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        body: '<!-- bubble-daily-publication -->',
                        head: { ref: oldBranch, sha: oldHead },
                    },
                ];
            if (path === '/git/ref/heads/main') return { object: { sha: mainHead } };
            if (path === `/git/commits/${mainHead}`) return { tree: { sha: sha('8') } };
            if (path === `/compare/${mainHead}...${oldHead}`)
                return {
                    merge_base_commit: { sha: mergeBase },
                    total_commits: 1,
                    commits: [{ sha: oldHead }],
                    files: [{ filename: oldPath }],
                };
            if (path === `/compare/${mergeBase}...${mainHead}`)
                return {
                    files: [{ filename: oldPath }],
                };
            throw new Error(`unexpected ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                {
                    GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
                },
                {
                    snapshot: {
                        branch: oldBranch,
                        baseBranch: 'main',
                        headSha: oldHead,
                        treeSha: sha('7'),
                        publicationPullNumber: 10,
                    },
                    files: publicationFiles(),
                    message: 'Structured daily 2026-07-14 morning',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                prDependencies(api),
            ),
        ).rejects.toBeInstanceOf(AtomicGitConflictError);
        expect(api.mock.calls.some((call) => call[1] === '/git/refs')).toBe(false);
    });

    it('refuses to replay when main changed only the current candidate artifact', async () => {
        const mergeBase = sha('0');
        const mainHead = sha('9');
        const oldHead = sha('a');
        const oldBranch = 'automation/daily/2026-07-13-night-structured/aaaaaaaaaaaa';
        const oldPath = 'data/daily/2026-07-13.json';
        const currentPath = 'data/daily/2026-07-14.json';
        const api = vi.fn(async (_env, path) => {
            if (path === '/pulls?state=open&base=main&per_page=100')
                return [
                    {
                        number: 10,
                        body: '<!-- bubble-daily-publication -->',
                        head: { ref: oldBranch, sha: oldHead },
                    },
                ];
            if (path === '/git/ref/heads/main') return { object: { sha: mainHead } };
            if (path === `/git/commits/${mainHead}`) return { tree: { sha: sha('8') } };
            if (path === `/compare/${mainHead}...${oldHead}`)
                return {
                    merge_base_commit: { sha: mergeBase },
                    total_commits: 1,
                    commits: [{ sha: oldHead }],
                    files: [{ filename: oldPath }],
                };
            if (path === `/compare/${mergeBase}...${mainHead}`)
                return {
                    files: [{ filename: currentPath }],
                };
            throw new Error(`unexpected ${path}`);
        });

        await expect(
            commitFilesViaPullRequest(
                {
                    GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
                },
                {
                    snapshot: {
                        branch: oldBranch,
                        baseBranch: 'main',
                        headSha: oldHead,
                        treeSha: sha('7'),
                        publicationPullNumber: 10,
                    },
                    files: publicationFiles(),
                    message: 'Structured daily 2026-07-14 morning',
                    committedAt: '2026-07-14T02:00:00Z',
                    reportDate: '2026-07-14',
                    batch: 'morning',
                    mode: 'structured',
                },
                prDependencies(api),
            ),
        ).rejects.toBeInstanceOf(AtomicGitConflictError);
        expect(api.mock.calls.some((call) => call[1] === '/git/refs')).toBe(false);
    });

    it('fails closed on multiple in-flight publications or an in-flight mode transition', async () => {
        const pull = (number, mode) => ({
            number,
            head: {
                ref: `automation/daily/2026-07-14-morning-${mode}/${String(number).slice(-1).repeat(12)}`,
            },
        });
        const env = {
            GITHUB_BRANCH: 'main',
            GITHUB_PUBLISH_STRATEGY: 'pull_request',
            GITHUB_PUBLISH_BRANCH_PREFIX: 'automation/daily',
        };
        await expect(
            resolvePublicationSnapshot(env, {
                api: vi.fn(async () => [pull(1, 'structured'), pull(2, 'structured')]),
                expectedMode: 'structured',
            }),
        ).rejects.toBeInstanceOf(AtomicGitConflictError);
        await expect(
            resolvePublicationSnapshot(env, {
                api: vi.fn(async () => [pull(1, 'legacy')]),
                expectedMode: 'structured',
            }),
        ).rejects.toThrow('mode transition');
    });

    it('routes through the configured strategy and fails closed on invalid strategy', async () => {
        const api = vi.fn(async (_env, path) => {
            if (path === '/git/blobs') return { sha: sha('c') };
            if (path === '/git/trees') return { sha: sha('d') };
            if (path === '/git/commits') return { sha: sha('1') };
            if (path === '/git/refs/heads/main') return {};
            throw new Error(`unexpected ${path}`);
        });
        await expect(
            publishFilesAtomically(
                { GITHUB_PUBLISH_STRATEGY: 'direct' },
                {
                    snapshot,
                    files: [{ path: 'daily.md', content: 'daily' }],
                    message: 'publish',
                    committedAt: '2026-07-14T02:00:00Z',
                },
                { api },
            ),
        ).resolves.toMatchObject({ pending: false });
        await expect(publishFilesAtomically({ GITHUB_PUBLISH_STRATEGY: 'unsafe' }, {})).rejects.toThrow(
            'GITHUB_PUBLISH_STRATEGY',
        );
    });
});
