import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

describe('scheduled run observability migration', () => {
    let sql;

    beforeAll(async () => {
        sql = await readFile(
            new URL(
                '../../supabase/migrations/20260724000400_scheduled_run_observability.sql',
                import.meta.url,
            ),
            'utf8',
        );
    });

    it('keeps an append-only audit and a monotonic current projection', () => {
        expect(sql).toContain('private.scheduled_run_observability_events');
        expect(sql).toContain('private.scheduled_run_observability_current');
        expect(sql).toContain("v_current.status = 'failed' and v_status = 'succeeded'");
        expect(sql).toContain("v_current.status = v_status");
    });

    it('accepts only exact production schedule hours', () => {
        expect(sql).toContain("p_scheduled_at <> date_trunc('hour', p_scheduled_at)");
        expect(sql).toContain(
            'not in (0, 2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23)',
        );
    });

    it('associates fresh releases with their run in the finalize transaction', () => {
        const finalize = sql.slice(
            sql.indexOf('create or replace function private.finalize_site_release_v1'),
            sql.indexOf('-- Preserve the previous implementations'),
        );
        expect(finalize).toContain("'release_registered'");
        expect(finalize).toContain('private.record_scheduled_run_trace_v1');
        expect(finalize).toContain("'dispatch_id', existing_dispatch_id");
    });

    it('derives stability only from complete multi-round edge evidence', () => {
        expect(sql).toContain("'[15000, 45000, 120000]'::jsonb");
        expect(sql).toContain("event.evidence ->> 'stable_verified_at'");
        expect(sql).toContain("'stability_rounds'");
    });

    it('keeps write and read capabilities separated', () => {
        expect(sql).toMatch(
            /grant execute on function private\.record_scheduled_run_trace_v1\([\s\S]*?\) to content_ingestor;/,
        );
        expect(sql).toMatch(
            /grant execute on function private\.get_content_observability_v1\(\)[\s\S]*?to content_deployer;/,
        );
    });
});
