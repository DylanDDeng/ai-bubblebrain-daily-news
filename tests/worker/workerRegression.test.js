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
        expect(scheduledWorkflow).toHaveBeenCalledWith(env);
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
        expect(config).toContain('crons = ["0 2,7,15,19 * * *"]');
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
        expect(staging).toContain('EXTERNAL_WRITES_ENABLED = "false"');
        expect(staging).not.toMatch(/^\s*\[triggers\]/m);
        expect(staging).not.toMatch(/^\s*crons\s*=/m);
        expect(staging).not.toMatch(/^\s*routes?\s*=/m);
        expect(staging).toContain('namespace_id = "2001001"');
        expect(production).toContain('namespace_id = "1001001"');
    });
});
