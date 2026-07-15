import { describe, expect, it, vi } from 'vitest';
import {
    AtomicGitConflictError,
    AtomicGitUncertainError,
    commitFilesAtomically,
    createSnapshotReader,
    resolveBranchSnapshot,
} from '../../src/daily/gitAtomic.js';

const sha = character => character.repeat(40);
const snapshot = { branch: 'main', headSha: sha('a'), treeSha: sha('b') };

function publicationFiles() {
    return [
        { path: 'data/daily/2026-07-14.json', content: '{}' },
        { path: 'daily/2026-07-14.md', content: 'daily' },
        { path: 'content/daily/2026-07-14.md', content: 'content' },
    ];
}

describe('atomic Git publication', () => {
    it('resolves an immutable branch head and reads nested files only through its tree', async () => {
        const calls = [];
        const api = vi.fn(async (_env, path) => {
            calls.push(path);
            if (path === '/git/ref/heads/main') return { object: { sha: sha('a') } };
            if (path === `/git/commits/${sha('a')}`) return { tree: { sha: sha('b') } };
            if (path === `/git/trees/${sha('b')}`) return { tree: [{ path: 'data', type: 'tree', sha: sha('c') }] };
            if (path === `/git/trees/${sha('c')}`) return { tree: [{ path: 'daily', type: 'tree', sha: sha('d') }] };
            if (path === `/git/trees/${sha('d')}`) return { tree: [{ path: '2026-07-14.json', type: 'blob', sha: sha('e') }] };
            if (path === `/git/blobs/${sha('e')}`) {
                return { encoding: 'base64', size: 2, content: Buffer.from('{}').toString('base64') };
            }
            throw new Error(`unexpected ${path}`);
        });

        const resolved = await resolveBranchSnapshot({}, { api, branch: 'main' });
        const reader = createSnapshotReader({}, resolved, { api });
        expect(await reader.readText('data/daily/2026-07-14.json')).toBe('{}');
        expect(await reader.readText('data/daily/2026-07-14.json')).toBe('{}');
        expect(calls.filter(path => path === `/git/blobs/${sha('e')}`)).toHaveLength(1);
        expect(calls.some(path => path.includes('/contents/'))).toBe(false);
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

        const result = await commitFilesAtomically({}, {
            snapshot,
            files: publicationFiles(),
            message: 'publish',
            committedAt: '2026-07-14T02:00:00Z',
        }, { api });

        expect(result).toEqual({ commitSha: sha('1'), reconciled: false });
        expect(calls.filter(call => call.path === '/git/blobs')).toHaveLength(3);
        const tree = calls.find(call => call.path === '/git/trees');
        expect(tree.body.base_tree).toBe(snapshot.treeSha);
        expect(tree.body.tree.map(entry => entry.path)).toEqual(publicationFiles().map(file => file.path));
        const commit = calls.find(call => call.path === '/git/commits');
        expect(commit.body.parents).toEqual([snapshot.headSha]);
        const patch = calls.find(call => call.method === 'PATCH');
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
            await expect(commitFilesAtomically({}, {
                snapshot,
                files: publicationFiles(),
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
            }, { api })).rejects.toThrow(`failed ${failedPath}`);
            expect(api.mock.calls.some(call => call[2] === 'PATCH')).toBe(false);
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
            await expect(commitFilesAtomically({}, {
                snapshot,
                files: [{ path: 'data/daily/2026-07-14.json', content: '{}' }],
                message: 'publish',
                committedAt: '2026-07-14T02:00:00Z',
            }, { api })).resolves.toEqual({ commitSha: sha('1'), reconciled: true });
        }
    });

    it('classifies a confirmed sibling/base head as conflict and an unreadable head as uncertain', async () => {
        const makeApi = unreadable => vi.fn(async (_env, path, method) => {
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
                return { status: 'behind', merge_base_commit: { sha: snapshot.headSha } };
            }
            throw new Error(`unexpected ${path}`);
        });
        const input = {
            snapshot,
            files: [{ path: 'data/daily/2026-07-14.json', content: '{}' }],
            message: 'publish',
            committedAt: '2026-07-14T02:00:00Z',
        };
        await expect(commitFilesAtomically({}, input, { api: makeApi(false) }))
            .rejects.toBeInstanceOf(AtomicGitConflictError);
        await expect(commitFilesAtomically({}, input, { api: makeApi(true) }))
            .rejects.toBeInstanceOf(AtomicGitUncertainError);
    });

    it('rejects blobs above the structured read limit', async () => {
        const api = vi.fn(async (_env, path) => {
            if (path === `/git/trees/${snapshot.treeSha}`) {
                return { tree: [{ path: 'large.json', type: 'blob', sha: sha('c') }] };
            }
            if (path === `/git/blobs/${sha('c')}`) {
                return { encoding: 'base64', size: 11, content: Buffer.from('too large').toString('base64') };
            }
            throw new Error(`unexpected ${path}`);
        });
        const reader = createSnapshotReader({}, snapshot, { api, maxBlobBytes: 10 });
        await expect(reader.readText('large.json')).rejects.toThrow('exceeds structured read limit');
    });
});
