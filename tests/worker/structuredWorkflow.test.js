import { describe, expect, it, vi } from 'vitest';
import { AtomicGitConflictError, AtomicGitUncertainError } from '../../src/daily/gitAtomic.js';
import { runStructuredDailyWorkflow, StructuredSourceFetchError } from '../../src/daily/structuredWorkflow.js';

const sha = (character) => character.repeat(40);
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
        acquireLease: vi.fn(async () => ({
            acquired: true,
            key: 'lease',
            owner: 'owner',
        })),
        releaseLease: vi.fn(async () => true),
        readMarker: vi.fn(async () => null),
        storeMarker: vi.fn(async () => true),
        resolveAlias: vi.fn(async () => null),
        resolveBaseSnapshot: vi.fn(async () => snapshotA),
        resolveCommitSnapshot: vi.fn(async (_env, commitSha) => ({
            branch: null,
            headSha: commitSha,
            treeSha: snapshotA.treeSha,
        })),
        resolveSnapshot: vi.fn(async () => snapshotA),
        createReader: vi.fn(() => reader),
        getFoloCookie: vi.fn(async () => 'cookie'),
        fetchData: vi.fn(async () => ({ structuredItems: [], errors: [] })),
        build: vi.fn(async () => ({
            files: files(),
            noOp: false,
            metrics: { raw_count: 0 },
        })),
        enrich: vi.fn(async (_env, result) => result),
        commit: vi.fn(async () => ({ commitSha: sha('e'), reconciled: false })),
        verifyHead: vi.fn(async () => true),
        commitIncluded: vi.fn(async () => true),
        ...overrides,
    };
}

describe('structured publication workflow', () => {
    it('editorializes fresh items and same-day legacy social items before publishing', async () => {
        const freshBuild = {
            files: files(),
            noOp: false,
            metrics: { raw_count: 1 },
            report: {
                items: [
                    {
                        id: 'legacy-social',
                        content_type: 'socialMedia',
                        identity_strategy: 'source_id',
                        title: 'one of the best features of ChatGPT Work is that it runs in the cloud...',
                    },
                    {
                        id: 'edited-social',
                        content_type: 'socialMedia',
                        identity_strategy: 'source_id',
                        title: 'ChatGPT Work 可在云端持续运行并支持手机续接任务',
                    },
                    { id: 'fresh' },
                ],
            },
        };
        const enrich = vi.fn(async (_env, result) => result);
        const existingReport = {
            date: runInput.reportDate,
            items: [{ id: 'legacy-social' }, { id: 'edited-social' }],
        };
        const deps = dependencies({
            createReader: vi.fn(() => ({
                readText: vi.fn(async path => (
                    path === `data/daily/${runInput.reportDate}.json`
                        ? JSON.stringify(existingReport)
                        : null
                )),
            })),
            build: vi.fn(async () => freshBuild),
            enrich,
        });

        await runStructuredDailyWorkflow(env, runInput, deps);

        expect(enrich).toHaveBeenCalledWith(env, freshBuild, {
            itemIds: ['legacy-social', 'fresh'],
            cache: expect.any(Map),
        });

        const noOpDeps = dependencies({
            build: vi.fn(async () => ({ files: files(), noOp: true, metrics: {}, report: { items: [] } })),
            enrich: vi.fn(),
            createReader: vi.fn(() => ({
                readText: vi.fn(async path => files().find(file => file.path === path)?.content ?? null),
            })),
        });
        await runStructuredDailyWorkflow(env, runInput, noOpDeps);
        expect(noOpDeps.enrich).not.toHaveBeenCalled();
    });

    it('repairs a legacy social headline even when the fetch itself is an exact no-op', async () => {
        const existingReport = {
            date: runInput.reportDate,
            items: [{
                id: 'legacy-social',
                content_type: 'socialMedia',
                identity_strategy: 'source_id',
                title: 'one of the best features of ChatGPT Work is that it runs in the cloud...',
            }],
        };
        const originalFiles = files();
        const repairedFiles = originalFiles.map(file => ({
            ...file,
            content: `${file.content}-repaired`,
        }));
        const noOpBuild = {
            files: originalFiles,
            noOp: true,
            metrics: { fresh_count: 0 },
            report: existingReport,
        };
        const enrich = vi.fn(async (_env, result) => ({ ...result, files: repairedFiles }));
        const deps = dependencies({
            createReader: vi.fn(() => ({
                readText: vi.fn(async path => (
                    path === `data/daily/${runInput.reportDate}.json`
                        ? JSON.stringify(existingReport)
                        : originalFiles.find(file => file.path === path)?.content ?? null
                )),
            })),
            build: vi.fn(async () => noOpBuild),
            enrich,
        });

        await runStructuredDailyWorkflow(env, runInput, deps);

        expect(enrich).toHaveBeenCalledWith(env, noOpBuild, {
            itemIds: ['legacy-social'],
            cache: expect.any(Map),
        });
        expect(deps.commit).toHaveBeenCalledOnce();
    });

    it('fails closed unless all write gates and structured inputs are valid', async () => {
        const variants = [
            [{ ...env, EXTERNAL_WRITES_ENABLED: 'false' }, 'External writes'],
            [{ ...env, DAILY_PUBLISH_MODE: 'shadow' }, 'DAILY_PUBLISH_MODE'],
            [{ ...env, DAILY_STRUCTURED_WRITES_ENABLED: 'false' }, 'Structured writes'],
            [{ ...env, DAILY_STRUCTURED_START_DATE: undefined }, 'DAILY_STRUCTURED_START_DATE'],
            [{ ...env, DAILY_STRUCTURED_RESUME_DATE: '2026-07-15' }, 'DAILY_STRUCTURED_RESUME_DATE'],
            [
                {
                    ...env,
                    DAILY_STRUCTURED_START_DATE: '2026-07-10',
                    DAILY_STRUCTURED_RESUME_DATE: '2026-07-09',
                },
                'DAILY_STRUCTURED_RESUME_DATE',
            ],
        ];
        for (const [candidate, message] of variants) {
            const deps = dependencies();
            await expect(runStructuredDailyWorkflow(candidate, runInput, deps)).rejects.toThrow(message);
            expect(deps.acquireLease).not.toHaveBeenCalled();
        }
        await expect(
            runStructuredDailyWorkflow(
                env,
                {
                    ...runInput,
                    runAt: '2026-07-14T02:00:00',
                },
                dependencies(),
            ),
        ).rejects.toThrow('explicit timezone');
    });

    it('fails closed on any provider error and always releases the advisory lease', async () => {
        const deps = dependencies({
            fetchData: vi.fn(async () => ({
                structuredItems: [],
                errors: [
                    {
                        provider: 'broken',
                        content_type: 'news',
                        stage: 'fetch',
                        error_type: 'network',
                        attempts: 2,
                    },
                ],
            })),
        });
        const run = runStructuredDailyWorkflow(env, runInput, deps);
        await expect(run).rejects.toMatchObject({
            name: 'StructuredSourceFetchError',
            sourceErrors: [
                {
                    provider: 'broken',
                    content_type: 'news',
                    stage: 'fetch',
                    error_type: 'network',
                    attempts: 2,
                },
            ],
        });
        await expect(run).rejects.toBeInstanceOf(StructuredSourceFetchError);
        expect(deps.resolveSnapshot).not.toHaveBeenCalled();
        expect(deps.commit).not.toHaveBeenCalled();
        expect(deps.releaseLease).toHaveBeenCalledOnce();
    });

    it('never treats a prior failure marker as a confirmed publication', async () => {
        const deps = dependencies({
            readMarker: vi.fn(async () => ({
                success: false,
                status: 'failed',
                error_type: 'StructuredSourceFetchError',
            })),
        });

        await expect(
            runStructuredDailyWorkflow(
                env,
                {
                    ...runInput,
                    triggerId: 'scheduled:failed',
                },
                deps,
            ),
        ).resolves.toMatchObject({ success: true, commit_sha: sha('e') });

        expect(deps.fetchData).toHaveBeenCalledOnce();
        expect(deps.commit).toHaveBeenCalledOnce();
    });

    it('returns no-op only when all three artifacts match the same snapshot and head is unchanged', async () => {
        const artifactFiles = files();
        const readText = vi.fn(async (path) => artifactFiles.find((file) => file.path === path)?.content ?? null);
        const deps = dependencies({
            createReader: vi.fn(() => ({ readText })),
            build: vi.fn(async () => ({
                files: artifactFiles,
                noOp: true,
                metrics: {},
            })),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result).toMatchObject({
            success: true,
            noOp: true,
            commit_sha: snapshotA.headSha,
        });
        expect(deps.verifyHead).toHaveBeenCalledWith(env, snapshotA, {
            api: deps.api,
        });
        expect(deps.commit).not.toHaveBeenCalled();
    });

    it('keeps a no-op on an in-flight queue snapshot pending on the same pull request', async () => {
        const artifactFiles = files();
        const pendingSnapshot = {
            ...snapshotA,
            branch: 'automation/daily/2026-07-14-morning-structured/aaaaaaaaaaaa',
            baseBranch: 'main',
            publicationPullNumber: 42,
            publicationPull: { number: 42, url: 'https://example.test/pr/42' },
        };
        const deps = dependencies({
            resolveSnapshot: vi.fn(async () => pendingSnapshot),
            createReader: vi.fn(() => ({
                readText: vi.fn(async (path) => artifactFiles.find((file) => file.path === path)?.content ?? null),
            })),
            build: vi.fn(async () => ({
                files: artifactFiles,
                noOp: true,
                metrics: {},
            })),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result).toMatchObject({
            noOp: true,
            pending: true,
            publication_status: 'pending',
            pull_request: { number: 42 },
        });
        expect(deps.commit).not.toHaveBeenCalled();
    });

    it('repairs a missing or drifted Markdown artifact with one three-file commit', async () => {
        const artifactFiles = files();
        const readText = vi.fn(async (path) => {
            if (path === artifactFiles[0].path) return artifactFiles[0].content;
            if (path === artifactFiles[1].path) return null;
            return 'drifted';
        });
        const deps = dependencies({
            createReader: vi.fn(() => ({ readText })),
            build: vi.fn(async () => ({
                files: artifactFiles,
                noOp: true,
                metrics: {},
            })),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result).toMatchObject({
            success: true,
            noOp: false,
            commit_sha: sha('e'),
        });
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
                build: vi.fn(async () => ({
                    files: invalid,
                    noOp: false,
                    metrics: {},
                })),
            });
            await expect(runStructuredDailyWorkflow(env, runInput, deps)).rejects.toThrow(
                'invalid publication file set',
            );
            expect(deps.commit).not.toHaveBeenCalled();
        }
    });

    it('re-reads and rebuilds from a new snapshot when the branch moves before no-op', async () => {
        const artifactFiles = files();
        const deps = dependencies({
            resolveSnapshot: vi.fn().mockResolvedValueOnce(snapshotA).mockResolvedValueOnce(snapshotB),
            createReader: vi.fn(() => ({
                readText: vi.fn(async (path) => artifactFiles.find((file) => file.path === path)?.content ?? null),
            })),
            build: vi.fn(async () => ({
                files: artifactFiles,
                noOp: true,
                metrics: {},
            })),
            verifyHead: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
        });

        const result = await runStructuredDailyWorkflow(env, runInput, deps);

        expect(result.commit_sha).toBe(snapshotB.headSha);
        expect(deps.resolveSnapshot).toHaveBeenCalledTimes(2);
        expect(deps.createReader).toHaveBeenCalledTimes(2);
        expect(deps.build).toHaveBeenCalledTimes(2);
    });

    it('rebuilds after a ref conflict but never retries an uncertain ref outcome', async () => {
        const conflictDeps = dependencies({
            resolveSnapshot: vi.fn().mockResolvedValueOnce(snapshotA).mockResolvedValueOnce(snapshotB),
            commit: vi
                .fn()
                .mockRejectedValueOnce(new AtomicGitConflictError('moved'))
                .mockResolvedValueOnce({ commitSha: sha('e'), reconciled: false }),
        });
        await expect(runStructuredDailyWorkflow(env, runInput, conflictDeps)).resolves.toMatchObject({
            success: true,
            commit_sha: sha('e'),
        });
        expect(conflictDeps.build).toHaveBeenCalledTimes(2);

        const uncertainDeps = dependencies({
            commit: vi.fn(async () => {
                throw new AtomicGitUncertainError('unknown');
            }),
        });
        await expect(runStructuredDailyWorkflow(env, runInput, uncertainDeps)).rejects.toBeInstanceOf(
            AtomicGitUncertainError,
        );
        expect(uncertainDeps.resolveSnapshot).toHaveBeenCalledOnce();
    });

    it('keeps Git success when marker persistence fails', async () => {
        const deps = dependencies({
            storeMarker: vi.fn(async () => {
                throw new Error('KV unavailable');
            }),
        });
        await expect(
            runStructuredDailyWorkflow(
                env,
                {
                    ...runInput,
                    triggerId: 'scheduled:1',
                },
                deps,
            ),
        ).resolves.toMatchObject({ success: true, commit_sha: sha('e') });
        expect(deps.releaseLease).toHaveBeenCalledOnce();
    });

    it('keeps a successful Git candidate when the database mirror fails', async () => {
        const mirror = vi.fn(async () => {
            throw new Error('database unavailable');
        });
        const deps = dependencies({
            mirror,
            commit: vi.fn(async () => ({
                commitSha: sha('e'),
                reconciled: false,
                pending: true,
                branch: 'automation/daily/candidate',
                pullRequest: { number: 42, url: 'https://example.test/pr/42' },
            })),
        });

        await expect(
            runStructuredDailyWorkflow(
                {
                    ...env,
                    CONTENT_DATABASE_MIRROR_ENABLED: 'true',
                },
                {
                    ...runInput,
                    triggerId: 'scheduled:mirror-failure',
                },
                deps,
            ),
        ).resolves.toMatchObject({
            success: true,
            pending: true,
            commit_sha: sha('e'),
            database_mirror: { status: 'failed', error_type: 'Error' },
        });
        expect(deps.commit).toHaveBeenCalledOnce();
        expect(mirror).toHaveBeenCalledOnce();
    });

    it('reconciles a failed mirror from the exact merged commit without refetching providers', async () => {
        const canonicalJson = `${JSON.stringify({ date: runInput.reportDate })}\n`;
        const mirrorEnv = {
            ...env,
            CONTENT_DATABASE_MIRROR_ENABLED: 'true',
        };
        const marker = {
            success: true,
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: runInput.reportDate,
            batch: runInput.batch,
            pending: true,
            publication_status: 'pending',
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
            database_mirror: { status: 'failed', error_type: 'Error' },
        };
        const mirror = vi.fn(async (_env, input) => ({
            status: 'mirrored',
            reportSnapshotId: 'snapshot-id',
            contentSha256: input.codeSha,
        }));
        const readText = vi.fn(async (path) =>
            path === `data/daily/${runInput.reportDate}.json` ? canonicalJson : null,
        );
        const deps = dependencies({
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') {
                    return {
                        state: 'closed',
                        merged_at: '2026-07-14T03:00:00Z',
                        merge_commit_sha: sha('f'),
                    };
                }
                throw new Error(`unexpected ${path}`);
            }),
            createReader: vi.fn(() => ({ readText })),
            mirror,
        });

        const result = await runStructuredDailyWorkflow(
            mirrorEnv,
            {
                ...runInput,
                triggerId: 'scheduled:mirror-reconcile',
            },
            deps,
        );

        expect(result).toMatchObject({
            success: true,
            pending: false,
            idempotent: true,
            commit_sha: sha('f'),
            database_mirror: { status: 'mirrored', reportSnapshotId: 'snapshot-id' },
        });
        expect(deps.resolveCommitSnapshot).toHaveBeenCalledWith(mirrorEnv, sha('f'), {
            api: deps.api,
        });
        expect(readText).toHaveBeenCalledWith(`data/daily/${runInput.reportDate}.json`);
        expect(mirror).toHaveBeenCalledWith(expect.anything(), {
            report: { date: runInput.reportDate },
            canonicalJson,
            codeSha: sha('f'),
            batch: runInput.batch,
            triggerId: 'scheduled:mirror-reconcile',
        });
        expect(deps.fetchData).not.toHaveBeenCalled();
        expect(deps.build).not.toHaveBeenCalled();
        expect(deps.commit).not.toHaveBeenCalled();
        expect(deps.storeMarker).toHaveBeenCalledWith(
            env.DATA_KV,
            'scheduled:mirror-reconcile',
            expect.objectContaining({
                database_mirror: expect.objectContaining({ status: 'mirrored' }),
            }),
        );
    });

    it('suppresses only the same trigger after Git ancestry confirmation', async () => {
        const marker = {
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: '2026-07-14',
            batch: 'morning',
        };
        const deps = dependencies({ readMarker: vi.fn(async () => marker) });
        const result = await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            deps,
        );
        expect(result).toEqual({
            ...marker,
            pending: false,
            publication_status: 'published',
            idempotent: true,
        });
        expect(deps.commitIncluded).toHaveBeenCalledOnce();
        expect(deps.fetchData).not.toHaveBeenCalled();

        const mismatchedDeps = dependencies({
            readMarker: vi.fn(async () => ({ ...marker, batch: 'afternoon' })),
        });
        await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            mismatchedDeps,
        );
        expect(mismatchedDeps.commitIncluded).not.toHaveBeenCalled();
        expect(mismatchedDeps.fetchData).toHaveBeenCalledOnce();
        expect(mismatchedDeps.commit).toHaveBeenCalledOnce();

        const legacyMarkerDeps = dependencies({
            readMarker: vi.fn(async () => ({ ...marker, mode: 'legacy' })),
        });
        await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            legacyMarkerDeps,
        );
        expect(legacyMarkerDeps.commitIncluded).not.toHaveBeenCalled();
        expect(legacyMarkerDeps.fetchData).toHaveBeenCalledOnce();
        expect(legacyMarkerDeps.commit).toHaveBeenCalledOnce();

        const manualDeps = dependencies();
        await runStructuredDailyWorkflow(env, runInput, manualDeps);
        expect(manualDeps.readMarker).not.toHaveBeenCalled();
        expect(manualDeps.fetchData).toHaveBeenCalledOnce();
        expect(manualDeps.build).toHaveBeenCalledOnce();
    });

    it('treats an open publication pull request as a pending idempotent trigger', async () => {
        const marker = {
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: '2026-07-14',
            batch: 'morning',
            pending: true,
            publication_status: 'pending',
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
        };
        const deps = dependencies({
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'open', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
        });

        const result = await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            deps,
        );

        expect(result).toEqual({ ...marker, idempotent: true });
        expect(deps.fetchData).not.toHaveBeenCalled();
        expect(deps.resolveBaseSnapshot).not.toHaveBeenCalled();
        expect(deps.resolveSnapshot).not.toHaveBeenCalled();
    });

    it('retries a failed mirror from an exact open pull request candidate without regenerating content', async () => {
        const canonicalJson = `${JSON.stringify({ date: runInput.reportDate })}\n`;
        const mirrorEnv = { ...env, CONTENT_DATABASE_MIRROR_ENABLED: 'true' };
        const marker = {
            success: true,
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: runInput.reportDate,
            batch: runInput.batch,
            pending: true,
            publication_status: 'pending',
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
            database_mirror: { status: 'failed', error_type: 'Error' },
        };
        const mirror = vi.fn(async () => ({
            status: 'mirrored',
            reportSnapshotId: 'snapshot-id',
        }));
        const deps = dependencies({
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'open', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
            createReader: vi.fn(() => ({
                readText: vi.fn(async () => canonicalJson),
            })),
            mirror,
        });

        const result = await runStructuredDailyWorkflow(
            mirrorEnv,
            { ...runInput, triggerId: 'scheduled:open-mirror-reconcile' },
            deps,
        );

        expect(result).toMatchObject({
            success: true,
            pending: true,
            idempotent: true,
            database_mirror: { status: 'mirrored', reportSnapshotId: 'snapshot-id' },
        });
        expect(deps.resolveCommitSnapshot).toHaveBeenCalledWith(mirrorEnv, sha('e'), {
            api: deps.api,
        });
        expect(deps.fetchData).not.toHaveBeenCalled();
        expect(deps.build).not.toHaveBeenCalled();
        expect(deps.commit).not.toHaveBeenCalled();
        expect(deps.resolveBaseSnapshot).not.toHaveBeenCalled();
        expect(deps.storeMarker).toHaveBeenCalledWith(
            env.DATA_KV,
            'scheduled:open-mirror-reconcile',
            expect.objectContaining({
                database_mirror: expect.objectContaining({ status: 'mirrored' }),
            }),
        );
    });

    it('returns pull request publication metadata and stores it in the trigger marker', async () => {
        const deps = dependencies({
            commit: vi.fn(async () => ({
                commitSha: sha('e'),
                reconciled: false,
                pending: true,
                branch: 'automation/daily/candidate',
                pullRequest: { number: 42, url: 'https://example.test/pr/42' },
            })),
        });

        const result = await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            deps,
        );

        expect(result).toMatchObject({
            success: true,
            pending: true,
            publication_status: 'pending',
            publication_branch: 'automation/daily/candidate',
            pull_request: { number: 42 },
        });
        expect(deps.storeMarker).toHaveBeenCalledWith(
            env.DATA_KV,
            'scheduled:1',
            expect.objectContaining({
                pending: true,
                pull_request: { number: 42, url: 'https://example.test/pr/42' },
            }),
        );
    });

    it('confirms a superseded closed candidate only after it is an ancestor of main', async () => {
        const marker = {
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: '2026-07-14',
            batch: 'morning',
            pending: true,
            pull_request: { number: 42, url: 'https://example.test/pr/42' },
        };
        const deps = dependencies({
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'closed', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
            commitIncluded: vi.fn(async () => true),
        });

        const result = await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            deps,
        );

        expect(result).toMatchObject({ pending: false, idempotent: true });
        expect(deps.resolveBaseSnapshot).toHaveBeenCalledOnce();
        expect(deps.resolveSnapshot).not.toHaveBeenCalled();
    });

    it('follows a replay alias instead of regenerating an old structured trigger', async () => {
        const marker = {
            commit_sha: sha('e'),
            mode: 'structured',
            reportDate: '2026-07-14',
            batch: 'morning',
            pending: true,
            pull_request: { number: 42, url: 'old' },
        };
        const deps = dependencies({
            readMarker: vi.fn(async () => marker),
            api: vi.fn(async (_env, path) => {
                if (path === '/pulls/42') return { state: 'closed', merged_at: null };
                throw new Error(`unexpected ${path}`);
            }),
            resolveAlias: vi.fn(async () => ({
                commitSha: sha('f'),
                pull: { number: 43, url: 'new', state: 'open', mergedAt: null },
            })),
        });

        const result = await runStructuredDailyWorkflow(
            env,
            {
                ...runInput,
                triggerId: 'scheduled:1',
            },
            deps,
        );

        expect(result).toMatchObject({
            commit_sha: sha('f'),
            pending: true,
            idempotent: true,
            pull_request: { number: 43, url: 'new' },
        });
        expect(deps.resolveBaseSnapshot).not.toHaveBeenCalled();
        expect(deps.build).not.toHaveBeenCalled();
    });

    it('starts an explicit recovery epoch without requiring pre-resume history', async () => {
        const deps = dependencies();
        const result = await runStructuredDailyWorkflow(
            {
                ...env,
                DAILY_STRUCTURED_START_DATE: '2026-07-01',
                DAILY_STRUCTURED_RESUME_DATE: '2026-07-14',
            },
            runInput,
            deps,
        );

        expect(result.history_epoch_start_date).toBe('2026-07-14');
        expect(deps.build).toHaveBeenCalledWith(
            expect.objectContaining({
                structuredStartDate: '2026-07-14',
                recentReports: [],
            }),
        );
    });
});
