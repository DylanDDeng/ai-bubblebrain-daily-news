import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createWorker } from '../../src/index.js';

describe('worker regression guards', () => {
    it('records started and terminal evidence around each scheduled workflow', async () => {
        const workflowPromise = Promise.resolve({ success: true });
        const scheduledWorkflow = vi.fn(() => workflowPromise);
        const waitUntil = vi.fn();
        const DATA_KV = { put: vi.fn(async () => undefined) };
        const env = { marker: 'production-env', EXTERNAL_WRITES_ENABLED: 'true', DATA_KV };
        const scheduledTrace = vi.fn(async () => true);
        const worker = createWorker({ scheduledWorkflow, scheduledTrace });

        await worker.scheduled({ scheduledTime: Date.UTC(2026, 6, 14) }, env, { waitUntil });

        await expect(waitUntil.mock.calls[0][0]).resolves.toEqual({ success: true });
        expect(scheduledWorkflow).toHaveBeenCalledOnce();
        expect(scheduledWorkflow).toHaveBeenCalledWith(env, {
            triggerId: `scheduled:${Date.UTC(2026, 6, 14)}`,
            runAt: '2026-07-14T00:00:00.000Z',
        });
        expect(waitUntil).toHaveBeenCalledOnce();
        expect(DATA_KV.put).toHaveBeenCalledTimes(2);
        expect(scheduledTrace.mock.calls.map(([, value]) => value.eventType))
            .toEqual(['started', 'succeeded']);
        expect(scheduledTrace.mock.calls[1][1]).toMatchObject({
            runId: `scheduled:${Date.UTC(2026, 6, 14)}`,
            scheduledAt: '2026-07-14T00:00:00.000Z',
            evidence: { status: 'succeeded' },
        });
        expect(JSON.parse(DATA_KV.put.mock.calls[0][1])).toMatchObject({
            scheduled_at: '2026-07-14T00:00:00.000Z',
            run_id: `scheduled:${Date.UTC(2026, 6, 14)}`,
            status: 'started',
            stage: 'started',
        });
        expect(DATA_KV.put.mock.calls[1][0]).toBe(
            'scheduled:outcome:2026-07-14T00:00:00.000Z',
        );
        expect(JSON.parse(DATA_KV.put.mock.calls[1][1])).toMatchObject({
            scheduled_at: '2026-07-14T00:00:00.000Z',
            status: 'succeeded',
            run_at: '2026-07-14T00:00:00.000Z',
            run_id: `scheduled:${Date.UTC(2026, 6, 14)}`,
            stable_verified_at: null,
        });
    });

    it('persists sanitized scheduled failures without converting them to success', async () => {
        const error = Object.assign(new Error('secret upstream detail'), {
            name: 'StructuredSourceFetchError',
            sourceErrors: [{
                provider: 'aibase',
                content_type: 'news',
                stage: 'fetch',
                error_type: 'network',
                attempts: 2,
            }],
        });
        const scheduledWorkflow = vi.fn(() => { throw error; });
        const waitUntil = vi.fn();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const DATA_KV = {
            put: vi.fn(async () => undefined),
        };
        const worker = createWorker({ scheduledWorkflow });

        await worker.scheduled(
            { scheduledTime: Date.UTC(2026, 6, 14) },
            { EXTERNAL_WRITES_ENABLED: 'true', DATA_KV },
            { waitUntil },
        );

        expect(waitUntil).toHaveBeenCalledOnce();
        await expect(waitUntil.mock.calls[0][0]).rejects.toBe(error);
        expect(DATA_KV.put).toHaveBeenCalledTimes(3);
        const [markerKey, rawMarker, options] = DATA_KV.put.mock.calls.find(
            ([key]) => key.startsWith('structured:attempt-failure:'),
        );
        const marker = JSON.parse(rawMarker);
        expect(marker).toMatchObject({
            success: false,
            status: 'failed',
            stage: 'failed',
            trigger_type: 'scheduled',
            run_id: `scheduled:${Date.UTC(2026, 6, 14)}`,
            run_at: '2026-07-14T00:00:00.000Z',
            error_type: 'structured_source_fetch_failed',
            failure_stage: 'fetch',
            source_errors: [{
                provider: 'aibase',
                content_type: 'news',
                stage: 'fetch',
                error_type: 'network',
                attempts: 2,
            }],
        });
        expect(markerKey).toMatch(/^structured:attempt-failure:[a-f0-9]{64}$/);
        expect(options).toEqual({ expirationTtl: 14 * 24 * 60 * 60 });
        const outcome = DATA_KV.put.mock.calls.filter(
            ([key]) => key === 'scheduled:outcome:2026-07-14T00:00:00.000Z',
        ).at(-1);
        expect(JSON.parse(outcome[1])).toMatchObject({
            scheduled_at: '2026-07-14T00:00:00.000Z',
            run_id: `scheduled:${Date.UTC(2026, 6, 14)}`,
            status: 'failed',
            failure_stage: 'fetch',
        });
        expect(rawMarker).not.toContain('secret upstream detail');
        expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('secret upstream detail');
    });

    it('preserves the original scheduled failure when marker persistence fails', async () => {
        const error = new RangeError('workflow failed');
        const scheduledWorkflow = vi.fn(async () => { throw error; });
        const waitUntil = vi.fn();
        const worker = createWorker({ scheduledWorkflow });

        await worker.scheduled(
            { scheduledTime: Date.UTC(2026, 6, 14) },
            {
                EXTERNAL_WRITES_ENABLED: 'true',
                DATA_KV: { put: vi.fn(async () => { throw new Error('KV failed'); }) },
            },
            { waitUntil },
        );

        await expect(waitUntil.mock.calls[0][0]).rejects.toBe(error);
    });

    it('maps arbitrary failure metadata to closed values before logging or persistence', async () => {
        const secret = 'secret-cookie-and-token';
        const error = Object.assign(new Error(secret), {
            name: secret,
            cause: new Error(secret),
            sourceErrors: [{
                provider: secret,
                content_type: secret,
                stage: secret,
                error_type: secret,
                attempts: 999,
            }],
        });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const waitUntil = vi.fn();
        const DATA_KV = { put: vi.fn(async () => undefined) };
        const worker = createWorker({
            scheduledWorkflow: vi.fn(async () => { throw error; }),
        });

        await worker.scheduled(
            { scheduledTime: Date.UTC(2026, 6, 14) },
            { EXTERNAL_WRITES_ENABLED: 'true', DATA_KV },
            { waitUntil },
        );
        await expect(waitUntil.mock.calls[0][0]).rejects.toBe(error);

        const failureCall = DATA_KV.put.mock.calls.find(
            ([key]) => key.startsWith('structured:attempt-failure:'),
        );
        const marker = JSON.parse(failureCall[1]);
        expect(marker).toMatchObject({
            error_type: 'scheduled_workflow_failed',
            failure_stage: 'unknown',
            source_errors: [{
                provider: 'unknown',
                content_type: 'unknown',
                stage: 'unknown',
                error_type: 'provider_failure',
                attempts: 1,
            }],
        });
        expect(JSON.stringify(marker)).not.toContain(secret);
        expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(secret);
    });

    it('never invokes scheduled workflows when external writes are not explicitly enabled', async () => {
        for (const value of [undefined, '', 'false', 'TRUEE']) {
            const scheduledWorkflow = vi.fn(() => Promise.resolve());
            const waitUntil = vi.fn();
            const worker = createWorker({ scheduledWorkflow });

            await worker.scheduled(
                { scheduledTime: Date.UTC(2026, 6, 14) },
                { EXTERNAL_WRITES_ENABLED: value },
                { waitUntil },
            );

            expect(scheduledWorkflow).not.toHaveBeenCalled();
            expect(waitUntil).not.toHaveBeenCalled();
        }
    });

    it('does not disclose missing runtime variable names to public responses', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const worker = createWorker();
        const response = await worker.fetch(new Request('https://example.test/'), {});
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(text).not.toContain('GITHUB_TOKEN');
        expect(text).not.toContain('LOGIN_PASSWORD');
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('exposes only authenticated scheduled outcomes to the production monitor', async () => {
        const values = new Map([[
            'scheduled:outcome:2026-07-20T19:00:00.000Z',
            JSON.stringify({
                scheduled_at: '2026-07-20T19:00:00.000Z',
                status: 'failed',
                run_at: '2026-07-20T19:00:45.000Z',
                error_type: 'scheduled_workflow_failed',
                failure_stage: 'git_publish',
                secret_detail: 'must-not-leak',
            }),
        ]]);
        const env = {
            DATA_KV: { get: vi.fn(async key => values.get(key) ?? null) },
            SCHEDULE_HEALTH_TOKEN: 'monitor-secret',
        };
        const worker = createWorker();
        const url = 'https://example.test/health/scheduled?scheduled_at=2026-07-20T19%3A00%3A00.000Z';

        const unauthorized = await worker.fetch(new Request(url), env);
        expect(unauthorized.status).toBe(401);

        const response = await worker.fetch(new Request(url, {
            headers: { Authorization: 'Bearer monitor-secret' },
        }), env);
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            slots: [{
                scheduled_at: '2026-07-20T19:00:00.000Z',
                status: 'failed',
                run_at: '2026-07-20T19:00:45.000Z',
                error_type: 'scheduled_workflow_failed',
                failure_stage: 'git_publish',
            }],
        });
        expect(JSON.stringify(body)).not.toContain('must-not-leak');
    });

    it('authenticates the internal backlog replay endpoint before invoking it', async () => {
        const backlogReplay = vi.fn(async () => ({
            status: 'reconciled',
            run: { run_id: 'scheduled:1783994400000' },
        }));
        const worker = createWorker({ backlogReplay });
        const env = { CONTENT_BACKLOG_REPLAY_SECRET: 'backlog-secret' };
        const url = 'https://example.test/internal/backlog/replay';

        for (const request of [
            new Request(url, { method: 'POST' }),
            new Request(url, {
                method: 'POST',
                headers: { 'X-Content-Backlog-Secret': 'wrong-secret' },
            }),
            new Request(url, {
                method: 'GET',
                headers: { 'X-Content-Backlog-Secret': 'backlog-secret' },
            }),
        ]) {
            const response = await worker.fetch(request, env);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({
                success: false,
                error: 'Unauthorized',
            });
        }
        expect(backlogReplay).not.toHaveBeenCalled();

        const response = await worker.fetch(new Request(url, {
            method: 'POST',
            headers: { 'X-Content-Backlog-Secret': 'backlog-secret' },
        }), env);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            retryable: false,
            status: 'reconciled',
            run: { run_id: 'scheduled:1783994400000' },
        });
        expect(backlogReplay).toHaveBeenCalledOnce();
        expect(backlogReplay).toHaveBeenCalledWith(env);
    });

    it('surfaces retryable backlog states as non-success responses', async () => {
        const worker = createWorker({
            backlogReplay: vi.fn(async () => ({ status: 'deferred', deferred_count: 1 })),
        });
        const response = await worker.fetch(new Request(
            'https://example.test/internal/backlog/replay',
            {
                method: 'POST',
                headers: { 'X-Content-Backlog-Secret': 'backlog-secret' },
            },
        ), { CONTENT_BACKLOG_REPLAY_SECRET: 'backlog-secret' });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            success: false,
            retryable: true,
            status: 'deferred',
            deferred_count: 1,
        });
    });

    it('fails closed when the internal backlog replay secret is not configured', async () => {
        const backlogReplay = vi.fn();
        const worker = createWorker({ backlogReplay });
        const response = await worker.fetch(new Request(
            'https://example.test/internal/backlog/replay',
            {
                method: 'POST',
                headers: { 'X-Content-Backlog-Secret': 'any-value' },
            },
        ), {});

        expect(response.status).toBe(401);
        expect(backlogReplay).not.toHaveBeenCalled();
    });

    it('does not mark a production run succeeded when its database mirror failed', async () => {
        const waitUntil = vi.fn();
        const DATA_KV = { put: vi.fn(async () => undefined) };
        const scheduledTrace = vi.fn(async () => true);
        const worker = createWorker({
            scheduledWorkflow: vi.fn(async () => ({
                success: true,
                no_op: false,
                content_sha256: 'a'.repeat(64),
                source_result: {
                    status: 'succeeded',
                    counts: { news: 3 },
                },
                database_mirror: { status: 'failed' },
                stage: 'database_mirror_failed',
            })),
            scheduledTrace,
        });

        await worker.scheduled(
            { scheduledTime: Date.UTC(2026, 6, 14) },
            {
                EXTERNAL_WRITES_ENABLED: 'true',
                CONTENT_DATABASE_MIRROR_ENABLED: 'true',
                DATA_KV,
            },
            { waitUntil },
        );

        await expect(waitUntil.mock.calls[0][0]).rejects.toMatchObject({
            name: 'ScheduledDatabaseMirrorError',
        });
        const outcome = DATA_KV.put.mock.calls
            .filter(([key]) => key === 'scheduled:outcome:2026-07-14T00:00:00.000Z')
            .map(([, value]) => JSON.parse(value))
            .at(-1);
        expect(outcome).toMatchObject({
            status: 'failed',
            stage: 'database_mirror_failed',
            error_type: 'database_mirror_failed',
            failure_stage: 'database_mirror',
            content_sha256: 'a'.repeat(64),
            source_result: {
                status: 'failed',
                counts: { news: 3 },
            },
        });
        expect(scheduledTrace.mock.calls.map(([, value]) => value.eventType))
            .toEqual(['started', 'failed']);
    });

    it('preserves the production cron and GitHub main branch configuration', async () => {
        const config = await readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8');
        expect(config).toContain('GITHUB_BRANCH = "main"');
        expect(config).toContain('GITHUB_PUBLISH_STRATEGY = "pull_request"');
        expect(config).toContain('GITHUB_PUBLISH_BRANCH_PREFIX = "automation/daily"');
        expect(config).toContain('crons = ["0 0,2,4,6,8,10,12,14,15,16,17,18,19,20,21,22,23 * * *"]');
        expect(config).toContain('DAILY_PUBLISH_MODE = "structured"');
        expect(config).toContain('DAILY_STRUCTURED_WRITES_ENABLED = "true"');
        expect(config).toContain('DAILY_STRUCTURED_START_DATE = "2026-07-16"');
        expect(config).toContain('CONTENT_DATABASE_MIRROR_ENABLED = "true"');
        expect(config).toContain('CONTENT_DATABASE_PUBLICATION_ENABLED = "true"');
        expect(config).toContain('CONTENT_BACKLOG_REPLAY_SECRET');
        expect(config).toContain('KAZIKE_FEED_ID = "187702008971600955"');
        expect(config).toContain('KAZIKE_FETCH_PAGES = "1"');
        expect(config).toContain('KAZIKE_X_FEED_ID = "66090931808241664"');
        expect(config).toContain('KAZIKE_X_FETCH_PAGES = "1"');
        expect(config).toContain('KAZIKE_FILTER_DAYS = "7"');
        expect(config).toContain('ANTHROPIC_RESEARCH_FEED_ID = "160743780570397696"');
        expect(config).toContain('ANTHROPIC_RESEARCH_FETCH_PAGES = "1"');
        expect(config).toContain('ANTHROPIC_RESEARCH_FILTER_DAYS = "14"');
        expect(config).toContain('AIBASE_FETCH_PAGES = "2"');
        expect(config).toContain('OPENAI_NEWSROOM_FETCH_PAGES = "1"');
        expect(config).toContain('XIAOHU_FETCH_PAGES = "1"');
        expect(config).toContain('HGPAPERS_FETCH_PAGES = "1"');
        expect(config).toContain('TWITTER_EXTRA_FETCH_PAGES = "1"');
        expect(config).toContain('LATE_NIGHT_SUPPLEMENT_FETCH_PAGE_CAP = "1"');
        expect(config).toContain('DAILY_SOURCE_RETRY_BUDGET = "2"');
        expect(config).toContain('X_BLOCKED_HANDLES = "ezshine,GemstoneNicole"');
        expect(config).toContain('id = "a8155f35059c4b2faf4b06ef43c30fa3"');
    });

    it('promotes automation publication pull requests only after all required checks', async () => {
        const [workflow, siteWorkflow] = await Promise.all([
            readFile(new URL('../../.github/workflows/worker-ci.yml', import.meta.url), 'utf8'),
            readFile(
                new URL('../../.github/workflows/build-and-deploy.yml', import.meta.url),
                'utf8',
            ),
        ]);
        expect(workflow).toContain('promote-publication:');
        expect(workflow).toContain(
            'needs: [worker-security, astro-verify, database-security]',
        );
        expect(workflow).toContain("startsWith(github.head_ref, 'automation/daily/')");
        expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
        expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
        expect(workflow).toContain('node scripts/verify-publication-pr.mjs');
        expect(workflow).toContain('--match-head-commit "$PR_HEAD_SHA"');
        expect(workflow).toContain('actions: write');
        expect(workflow).not.toContain('gh workflow run build-and-deploy.yml');
        expect(siteWorkflow).toContain('npm run verify --prefix astro');
        expect(siteWorkflow).toContain('path: astro/dist');
        expect(siteWorkflow).not.toContain('actions/deploy-pages');
        const finalBuildIndex = siteWorkflow.indexOf('run: npm run verify --prefix astro');
        const uploadIndex = siteWorkflow.indexOf('uses: actions/upload-artifact');
        expect(finalBuildIndex).toBeGreaterThan(-1);
        expect(finalBuildIndex).toBeLessThan(uploadIndex);
    });

    it('keeps the comments write UI gate aligned across verification and production builds', async () => {
        const [verificationWorkflow, productionWorkflow] = await Promise.all([
            readFile(
                new URL('../../.github/workflows/build-and-deploy.yml', import.meta.url),
                'utf8',
            ),
            readFile(
                new URL('../../.github/workflows/content-release.yml', import.meta.url),
                'utf8',
            ),
        ]);
        const commentsGate =
            "PUBLIC_COMMENTS_WRITE_UI_ENABLED: ${{ vars.PUBLIC_COMMENTS_WRITE_UI_ENABLED || 'false' }}";
        expect(verificationWorkflow).toContain(commentsGate);
        expect(productionWorkflow).toContain(commentsGate);
    });

    it('keeps staging isolated from production resources and triggers', async () => {
        const [production, staging] = await Promise.all([
            readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8'),
            readFile(new URL('../../wrangler.staging.toml', import.meta.url), 'utf8'),
        ]);
        const productionKv = production.match(/binding\s*=\s*"DATA_KV",\s*id\s*=\s*"([^"]+)"/)?.[1];
        const stagingKv = staging.match(/binding\s*=\s*"DATA_KV"\s*\nid\s*=\s*"([^"]+)"/)?.[1];

        expect(staging).toContain('name = "ai-daily-staging"');
        expect(staging).not.toContain('name = "ai-daily"\n');
        expect(stagingKv).toBeTruthy();
        expect(stagingKv).not.toBe(productionKv);
        expect(staging).toContain('GITHUB_BRANCH = "codex/worker-staging"');
        expect(staging).not.toContain('GITHUB_BRANCH = "main"');
        expect(staging).toContain('GITHUB_PUBLISH_STRATEGY = "direct"');
        expect(staging).toContain('EXTERNAL_WRITES_ENABLED = "false"');
        expect(staging).toContain('DAILY_PUBLISH_MODE = "legacy"');
        expect(staging).toContain('DAILY_STRUCTURED_WRITES_ENABLED = "false"');
        expect(staging).toContain('DAILY_STRUCTURED_START_DATE = "2026-07-15"');
        expect(staging).toContain('KAZIKE_FEED_ID = "187702008971600955"');
        expect(staging).toContain('KAZIKE_FETCH_PAGES = "1"');
        expect(staging).toContain('KAZIKE_X_FEED_ID = "66090931808241664"');
        expect(staging).toContain('KAZIKE_X_FETCH_PAGES = "1"');
        expect(staging).toContain('KAZIKE_FILTER_DAYS = "7"');
        expect(staging).toContain('ANTHROPIC_RESEARCH_FEED_ID = "160743780570397696"');
        expect(staging).toContain('ANTHROPIC_RESEARCH_FETCH_PAGES = "1"');
        expect(staging).toContain('ANTHROPIC_RESEARCH_FILTER_DAYS = "14"');
        expect(staging).not.toMatch(/^\s*\[triggers\]/m);
        expect(staging).not.toMatch(/^\s*crons\s*=/m);
        expect(staging).not.toMatch(/^\s*routes?\s*=/m);
        expect(staging).toContain('namespace_id = "2001001"');
        expect(production).toContain('namespace_id = "1001001"');
    });
});
