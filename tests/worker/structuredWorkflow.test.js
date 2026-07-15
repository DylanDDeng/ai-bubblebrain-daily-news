import { describe, expect, it, vi } from 'vitest';
import {
    AtomicGitConflictError,
    AtomicGitUncertainError,
} from '../../src/daily/gitAtomic.js';
import { runStructuredDailyWorkflow } from '../../src/daily/structuredWorkflow.js';

const sha = character => character.repeat(40);
const runInput = {
    reportDate: '2026-07-14',
    batch: 'morning',
    runAt: '2026-07-14T02:00:00Z',
};
const env = {
    EXTERNAL_WRITES_ENABLED: 'true',
    DAILY_PUBLISH_MODE: 'structured',
    DAILY_STRUCTURED_WRITES_ENABLED: 'true',
    DAILY_STRUCTURED_START_DATE: '2026-07-14',
    DAILY_PRODUCER_VERSION: 'test',
    DATA_KV: {},
};
const snapshotA = { branch: 'main', headSha: sha('a'), treeSha: sha('b') };
const snapshotB = { branch: 'main', headSha: sha('c'), treeSha: sha('d') };

function files(date = runInput.reportDate) {
    return [
        { path: `data/daily/${date}.json`, content: JSON.stringify({ date }) },
        { path: `daily/${date}.md`, content: 'daily' },
        { path: `content/daily/${date}.md`, content: 'content' },
    ];
}

function dependencies(overrides = {}) {
    const reader = { readText: vi.fn(async () => null) };
    return {
        api: vi.fn(),
        acquireLease: vi.fn(async () => ({ acquired: true, key: 'lease', owner: 'owner' })),
        releaseLease: vi.fn(async () => true),
        readMarker: vi.fn(async () => null),
        storeMarker: vi.fn(async () => true),
        resolveSnapshot: vi.fn(async () => snapshotA),
        createReader: vi.fn(() => reader),
        getFoloCookie: vi.fn(async () => 'cookie'),
        fetchData: vi.fn(async () => ({ structuredItems: [], errors: [] })),
        build: vi.fn(async () => ({
            files: files(),
            noOp: false,
            metrics: { raw_count: 0 },
        })),
        commit: vi.fn(async () => ({ commitSha: sha('e'), reconciled: false })),
        verifyHead: vi.fn(async () => true),
        commitIncluded: vi.fn(async () => true),
        ...overrides,
    };
}

describe('structured publication workflow', () => {
    it('fails closed unless all write gates and structured inputs are valid', async () => {
        const variants = [
            [{ ...env, EXTERNAL_WRITES_ENABLED: 'false' }, 'External writes'],
            [{ ...env, DAILY_PUBLISH_MODE: 'shadow' }, 'DAILY_PUBLISH_MODE'],
            [{ ...env, DAILY_STRUCTURED_WRITES_ENABLED: 'false' }, 'Structured writes'],
            [{ ...env, DAILY_STRUCTURED_START_DATE: undefined }, 'DAILY_STRUCTURED_START_DATE'],
        ];
        for (const [candidate, message] of variants) {
            const deps = dependencies();
            await expect(runStructuredDailyWorkflow(candidate, runInput, deps)).rejects.toThrow(message);
            expect(deps.acquireLease).not.toHaveBeenCalled();
        }
        await expect(runStructuredDailyWorkflow(env, {
            ...runInput,
            runAt: '2026-07-14T02:00:00',
        }, dependencies())).rejects.toThrow('explicit timezone');
    });

    it('fails closed on any provider error and always releases the advisory lease', async () => {
        const deps = dependencies({
            fetchData: vi.fn(async () => ({
                structuredItems: [],
                errors: [{ provider: 'broken' }],
            })),
        });
        await expect(runStructuredDailyWorkflow(env, runInput, deps)).rejects.toThrow('source fetch failed');
        expect(deps.resolveSnapshot).not.toHaveBeenCalled();
        expect(deps.commit).not.toHaveBeenCalled();
        expect(deps.releaseLease).toHaveBeenCalledOnce();
    });

    it('returns no-op only when all three artifacts match the same snapshot and head is unchanged', async () => {
        const artifactFiles = files();
        const readText = vi.fn(async path => artifactFiles.find(file => file.path === path)?.content ?? null);
        const deps = dependencies({
            createReader: vi.fn(() => ({ readText })),
            build: vi.fn(async () => ({ files: artifactFiles, noOp: true, metrics: {} })),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result).toMatchObject({ success: true, noOp: true, commit_sha: snapshotA.headSha });
        expect(deps.verifyHead).toHaveBeenCalledWith(env, snapshotA, { api: deps.api });
        expect(deps.commit).not.toHaveBeenCalled();
    });

    it('repairs a missing or drifted Markdown artifact with one three-file commit', async () => {
        const artifactFiles = files();
        const readText = vi.fn(async path => {
            if (path === artifactFiles[0].path) return artifactFiles[0].content;
            if (path === artifactFiles[1].path) return null;
            return 'drifted';
        });
        const deps = dependencies({
            createReader: vi.fn(() => ({ readText })),
            build: vi.fn(async () => ({ files: artifactFiles, noOp: true, metrics: {} })),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result).toMatchObject({ success: true, noOp: false, commit_sha: sha('e') });
        expect(deps.commit).toHaveBeenCalledOnce();
        expect(deps.commit.mock.calls[0][1].files).toEqual(artifactFiles);
    });

    it('rejects extra, missing, duplicate, and wrong-date publication paths before commit', async () => {
        const valid = files();
        const invalidSets = [
            valid.slice(0, 2),
            [...valid, { path: 'extra.txt', content: 'x' }],
            [valid[0], valid[1], { ...valid[2], path: valid[1].path }],
            files('2026-07-13'),
        ];
        for (const invalid of invalidSets) {
            const deps = dependencies({
                build: vi.fn(async () => ({ files: invalid, noOp: false, metrics: {} })),
            });
            await expect(runStructuredDailyWorkflow(env, runInput, deps))
                .rejects.toThrow('invalid publication file set');
            expect(deps.commit).not.toHaveBeenCalled();
        }
    });

    it('re-reads and rebuilds from a new snapshot when the branch moves before no-op', async () => {
        const artifactFiles = files();
        const deps = dependencies({
            resolveSnapshot: vi.fn()
                .mockResolvedValueOnce(snapshotA)
                .mockResolvedValueOnce(snapshotB),
            createReader: vi.fn(() => ({
                readText: vi.fn(async path => artifactFiles.find(file => file.path === path)?.content ?? null),
            })),
            build: vi.fn(async () => ({ files: artifactFiles, noOp: true, metrics: {} })),
            verifyHead: vi.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result.commit_sha).toBe(snapshotB.headSha);
        expect(deps.resolveSnapshot).toHaveBeenCalledTimes(2);
        expect(deps.createReader).toHaveBeenCalledTimes(2);
        expect(deps.build).toHaveBeenCalledTimes(2);
    });

    it('rebuilds after a ref conflict but never retries an uncertain ref outcome', async () => {
        const conflictDeps = dependencies({
            resolveSnapshot: vi.fn()
                .mockResolvedValueOnce(snapshotA)
                .mockResolvedValueOnce(snapshotB),
            commit: vi.fn()
                .mockRejectedValueOnce(new AtomicGitConflictError('moved'))
                .mockResolvedValueOnce({ commitSha: sha('e'), reconciled: false }),
        });
        await expect(runStructuredDailyWorkflow(env, runInput, conflictDeps)).resolves.toMatchObject({
            success: true,
            commit_sha: sha('e'),
        });
        expect(conflictDeps.build).toHaveBeenCalledTimes(2);

        const uncertainDeps = dependencies({
            commit: vi.fn(async () => { throw new AtomicGitUncertainError('unknown'); }),
        });
        await expect(runStructuredDailyWorkflow(env, runInput, uncertainDeps))
            .rejects.toBeInstanceOf(AtomicGitUncertainError);
        expect(uncertainDeps.resolveSnapshot).toHaveBeenCalledOnce();
    });

    it('keeps Git success when marker persistence fails', async () => {
        const deps = dependencies({
            storeMarker: vi.fn(async () => { throw new Error('KV unavailable'); }),
        });
        await expect(runStructuredDailyWorkflow(env, {
            ...runInput,
            triggerId: 'scheduled:1',
        }, deps)).resolves.toMatchObject({ success: true, commit_sha: sha('e') });
        expect(deps.releaseLease).toHaveBeenCalledOnce();
    });

    it('suppresses only the same trigger after Git ancestry confirmation', async () => {
        const marker = { commit_sha: sha('e'), reportDate: '2026-07-14', batch: 'morning' };
        const deps = dependencies({ readMarker: vi.fn(async () => marker) });
        const result = await runStructuredDailyWorkflow(env, {
            ...runInput,
            triggerId: 'scheduled:1',
        }, deps);
        expect(result).toEqual({ ...marker, idempotent: true });
        expect(deps.commitIncluded).toHaveBeenCalledOnce();
        expect(deps.fetchData).not.toHaveBeenCalled();

        const mismatchedDeps = dependencies({
            readMarker: vi.fn(async () => ({ ...marker, batch: 'afternoon' })),
        });
        await runStructuredDailyWorkflow(env, {
            ...runInput,
            triggerId: 'scheduled:1',
        }, mismatchedDeps);
        expect(mismatchedDeps.commitIncluded).not.toHaveBeenCalled();
        expect(mismatchedDeps.fetchData).toHaveBeenCalledOnce();
        expect(mismatchedDeps.commit).toHaveBeenCalledOnce();

        const manualDeps = dependencies();
        await runStructuredDailyWorkflow(env, runInput, manualDeps);
        expect(manualDeps.readMarker).not.toHaveBeenCalled();
        expect(manualDeps.fetchData).toHaveBeenCalledOnce();
        expect(manualDeps.build).toHaveBeenCalledOnce();
    });
});
