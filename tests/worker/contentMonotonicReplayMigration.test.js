import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('monotonic content replay migration', () => {
    it('rejects a report snapshot older than the release predecessor', async () => {
        const migration = await readFile(new URL(
            '../../supabase/migrations/20260724000700_monotonic_report_release.sql',
            import.meta.url,
        ), 'utf8');

        expect(migration).toContain('enforce_monotonic_site_release_report_v1');
        expect(migration).toContain("release.expected_predecessor_id");
        expect(migration).toContain("parsed_document ->> 'generated_at'");
        expect(migration).toContain(
            'v_candidate_generated_at < v_predecessor_generated_at',
        );
        expect(migration).toContain('Site release report snapshot is superseded');
        expect(migration).toContain(
            'before insert or update of report_snapshot_id',
        );
        expect(migration).toContain('set local role postgres;');
        expect(migration).not.toMatch(/^reset role;/m);
    });
});
