import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createWorker } from '../../src/index.js';

describe('worker regression guards', () => {
    it('keeps scheduled events wired directly to the legacy incremental workflow', async () => {
        const workflowPromise = Promise.resolve({ success: true });
        const scheduledWorkflow = vi.fn(() => workflowPromise);
        const waitUntil = vi.fn();
        const env = { marker: 'production-env', EXTERNAL_WRITES_ENABLED: 'true' };
        const worker = createWorker({ scheduledWorkflow });

        await worker.scheduled({ scheduledTime: Date.UTC(2026, 6, 14) }, env, { waitUntil });

        expect(scheduledWorkflow).toHaveBeenCalledOnce();
        expect(scheduledWorkflow).toHaveBeenCalledWith(env, {
            triggerId: `scheduled:${Date.UTC(2026, 6, 14)}`,
            runAt: '2026-07-14T00:00:00.000Z',
        });
        expect(waitUntil).toHaveBeenCalledOnce();
        await expect(waitUntil.mock.calls[0][0]).resolves.toEqual({ success: true });
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
        expect(DATA_KV.put).toHaveBeenCalledOnce();
        const [markerKey, rawMarker, options] = DATA_KV.put.mock.calls[0];
        const marker = JSON.parse(rawMarker);
        expect(marker).toEqual({
            success: false,
            status: 'failed',
            trigger_type: 'scheduled',
            run_at: '2026-07-14T00:00:00.000Z',
            error_type: 'structured_source_fetch_failed',
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

        const marker = JSON.parse(DATA_KV.put.mock.calls[0][1]);
        expect(marker).toMatchObject({
            error_type: 'scheduled_workflow_failed',
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

    it('preserves the production cron and GitHub main branch configuration', async () => {
        const config = await readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8');
        expect(config).toContain('GITHUB_BRANCH = "main"');
        expect(config).toContain('GITHUB_PUBLISH_STRATEGY = "pull_request"');
        expect(config).toContain('GITHUB_PUBLISH_BRANCH_PREFIX = "automation/daily"');
        expect(config).toContain('crons = ["0 2,7,15,18,19 * * *"]');
        expect(config).toContain('DAILY_PUBLISH_MODE = "structured"');
        expect(config).toContain('DAILY_STRUCTURED_WRITES_ENABLED = "true"');
        expect(config).toContain('DAILY_STRUCTURED_START_DATE = "2026-07-16"');
        expect(config).toContain('CONTENT_DATABASE_MIRROR_ENABLED = "true"');
        expect(config).toContain('CONTENT_DATABASE_PUBLICATION_ENABLED = "true"');
        expect(config).toContain('KAZIKE_FEED_ID = "187702008971600955"');
        expect(config).toContain('KAZIKE_FETCH_PAGES = "1"');
        expect(config).toContain('KAZIKE_X_FEED_ID = "66090931808241664"');
        expect(config).toContain('KAZIKE_X_FETCH_PAGES = "1"');
        expect(config).toContain('KAZIKE_FILTER_DAYS = "7"');
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
            'needs: [worker-security, renderer-parity, database-security]',
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
        const parityIndex = siteWorkflow.indexOf('run: npm run verify:renderers');
        const finalBuildIndex = siteWorkflow.indexOf('run: npm run verify --prefix astro');
        const uploadIndex = siteWorkflow.indexOf('uses: actions/upload-artifact');
        expect(parityIndex).toBeGreaterThan(-1);
        expect(parityIndex).toBeLessThan(finalBuildIndex);
        expect(finalBuildIndex).toBeLessThan(uploadIndex);
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
        expect(staging).not.toMatch(/^\s*\[triggers\]/m);
        expect(staging).not.toMatch(/^\s*crons\s*=/m);
        expect(staging).not.toMatch(/^\s*routes?\s*=/m);
        expect(staging).toContain('namespace_id = "2001001"');
        expect(production).toContain('namespace_id = "1001001"');
    });
});
