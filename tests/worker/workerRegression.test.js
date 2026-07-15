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
        expect(waitUntil).toHaveBeenCalledWith(workflowPromise);
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
        expect(config).toContain('crons = ["0 2,7,15,19 * * *"]');
        expect(config).toContain('DAILY_PUBLISH_MODE = "legacy"');
        expect(config).toContain('DAILY_STRUCTURED_WRITES_ENABLED = "false"');
    });

    it('promotes automation publication pull requests only after both required checks', async () => {
        const workflow = await readFile(
            new URL('../../.github/workflows/worker-ci.yml', import.meta.url),
            'utf8',
        );
        expect(workflow).toContain('promote-publication:');
        expect(workflow).toContain('needs: [worker-security, renderer-parity]');
        expect(workflow).toContain("startsWith(github.head_ref, 'automation/daily/')");
        expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
        expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
        expect(workflow).toContain('node scripts/verify-publication-pr.mjs');
        expect(workflow).toContain('--match-head-commit "$PR_HEAD_SHA"');
        expect(workflow).toContain('actions: write');
        expect(workflow).toContain('gh workflow run build-and-deploy.yml --ref main');
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
        expect(staging).not.toMatch(/^\s*\[triggers\]/m);
        expect(staging).not.toMatch(/^\s*crons\s*=/m);
        expect(staging).not.toMatch(/^\s*routes?\s*=/m);
        expect(staging).toContain('namespace_id = "2001001"');
        expect(production).toContain('namespace_id = "1001001"');
    });
});
