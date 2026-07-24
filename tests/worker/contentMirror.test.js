import { describe, expect, it, vi } from 'vitest';
import {
    mirrorStructuredReport,
    publicationBatchId,
    resolveForwardBuildCodeSha,
} from '../../workers/content/ingestion/mirror.ts';
import { canonicalJsonBytes } from '../../workers/content/shared/canonical.ts';

const decode = (bytes) => new TextDecoder().decode(bytes);
const codeSha = 'A'.repeat(40);

function report() {
    return {
        date: '2026-07-17',
        schema_version: 1,
        taxonomy_version: 1,
    };
}

function bucket() {
    const objects = new Map();
    return {
        objects,
        get: vi.fn(async (key) => {
            const bytes = objects.get(key);
            return bytes
                ? {
                      arrayBuffer: async () => bytes.slice().buffer,
                  }
                : null;
        }),
        put: vi.fn(async (key, value) => {
            objects.set(key, new Uint8Array(value));
        }),
    };
}

function database({
    loseFirstFinalizeResponse = false,
    rejectFinalize = false,
    reserveError = null,
    reserveFailureCount = Number.POSITIVE_INFINITY,
} = {}) {
    const calls = [];
    let finalized = false;
    let reserveFailures = 0;
    let attemptStatus = 'started';
    const release = {
        site_release_id: '22222222-2222-4222-8222-222222222222',
        site_release_sequence: 7,
    };
    const reservation = {
        reservation_id: release.site_release_id,
        site_release_id: release.site_release_id,
        site_release_sequence: release.site_release_sequence,
        expected_predecessor_id: null,
        reports: [
            {
                report_date: '2026-07-17',
                report_snapshot_id: '11111111-1111-4111-8111-111111111111',
                byte_sha256: 'b'.repeat(64),
            },
        ],
    };
    const sql = vi.fn(async (strings, ...values) => {
        const query = strings.join(' ');
        calls.push({ query, values });
        if (query.includes('ingest_report_snapshot_v1')) {
            return [
                {
                    result: {
                        report_snapshot_id: reservation.reports[0].report_snapshot_id,
                    },
                },
            ];
        }
        if (query.includes('prepare_ingestion_publication_slot_v1')) {
            return [{ result: { reset: false, reason: 'slot_absent' } }];
        }
        if (query.includes('reserve_ingestion_site_release_v1')) {
            if (reserveError && reserveFailures < reserveFailureCount) {
                reserveFailures += 1;
                throw reserveError;
            }
            return [{ result: { ...reservation, idempotent: finalized } }];
        }
        if (query.includes('finalize_site_release_v1')) {
            if (rejectFinalize) throw new Error('shadow publication is disabled');
            if (loseFirstFinalizeResponse && !finalized) {
                finalized = true;
                attemptStatus = 'succeeded';
                throw new Error('finalize response lost after commit');
            }
            finalized = true;
            attemptStatus = 'succeeded';
            return [
                {
                    result: {
                        ...release,
                        idempotent: calls.filter((call) => call.query.includes('finalize_site_release_v1')).length > 1,
                    },
                },
            ];
        }
        if (query.includes('fail_ingestion_publication_attempt_v1')) {
            if (attemptStatus !== 'succeeded') attemptStatus = 'failed';
            return [{ result: { status: attemptStatus } }];
        }
        throw new Error(`Unexpected query: ${query}`);
    });
    sql.json = vi.fn((value) => value);
    sql.end = vi.fn(async () => undefined);
    return { calls, sql };
}

function enabledEnv(publicationEnabled = 'false') {
    return {
        CONTENT_DATABASE_MIRROR_ENABLED: 'true',
        CONTENT_DATABASE_PUBLICATION_ENABLED: publicationEnabled,
        REPORT_SNAPSHOTS: bucket(),
        SITE_MANIFESTS: bucket(),
    };
}

function input(value = report()) {
    return {
        report: value,
        canonicalJson: decode(canonicalJsonBytes(value)),
        codeSha,
        batch: 'morning',
    };
}

describe('structured content database mirror', () => {
    it('pins a delayed mirror to current main when the source commit is its ancestor', async () => {
        const mainSha = 'b'.repeat(40);
        const api = vi
            .fn()
            .mockResolvedValueOnce({ object: { sha: mainSha } })
            .mockResolvedValueOnce({
                status: 'ahead',
                base_commit: { sha: codeSha.toLowerCase() },
                merge_base_commit: { sha: codeSha.toLowerCase() },
            });

        await expect(resolveForwardBuildCodeSha({}, codeSha, api)).resolves.toBe(mainSha);
        expect(api).toHaveBeenNthCalledWith(1, expect.anything(), '/git/ref/heads/main');
        expect(api).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            `/compare/${codeSha.toLowerCase()}...${mainSha}`,
        );
    });

    it('does not replace a source SHA that is not contained by current main', async () => {
        const mainSha = 'b'.repeat(40);
        const api = vi
            .fn()
            .mockResolvedValueOnce({ object: { sha: mainSha } })
            .mockResolvedValueOnce({
                status: 'diverged',
                base_commit: { sha: codeSha.toLowerCase() },
                merge_base_commit: { sha: 'c'.repeat(40) },
            });

        await expect(resolveForwardBuildCodeSha({}, codeSha, api)).resolves.toBe(
            codeSha.toLowerCase(),
        );
    });

    it('uses a separate publication fence for the scheduled 03:00 supplement', () => {
        expect(publicationBatchId('lateNight', `scheduled:${Date.parse('2026-07-20T18:00:00.000Z')}`))
            .toBe('lateNight');
        expect(publicationBatchId('lateNight', `scheduled:${Date.parse('2026-07-20T19:00:00.000Z')}`))
            .toBe('lateNightSupplement');
        expect(publicationBatchId('lateNight', 'manual:repair')).toBe('lateNight');
        expect(publicationBatchId('morning', `scheduled:${Date.parse('2026-07-20T19:00:00.000Z')}`))
            .toBe('morning');
    });

    it('passes the 03:00 supplement identity to the database without changing report batches', async () => {
        const env = enabledEnv();
        const db = database();
        await mirrorStructuredReport(
            env,
            {
                ...input(),
                batch: 'lateNight',
                triggerId: `scheduled:${Date.parse('2026-07-20T19:00:00.000Z')}`,
            },
            { openDatabase: vi.fn(() => db.sql) },
        );
        const reserve = db.calls.find((call) => call.query.includes('reserve_ingestion_site_release_v1'));
        expect(reserve.values[1]).toBe('lateNightSupplement');
    });

    it('does not touch R2 or Postgres while the mirror gate is disabled', async () => {
        const openDatabase = vi.fn();

        await expect(
            mirrorStructuredReport({ CONTENT_DATABASE_MIRROR_ENABLED: 'false' }, input(), { openDatabase }),
        ).resolves.toEqual({ status: 'disabled' });
        expect(openDatabase).not.toHaveBeenCalled();
    });

    it('fails closed before R2 and Postgres when canonical bytes drift', async () => {
        const env = enabledEnv();
        const openDatabase = vi.fn();
        const drifted = { ...report(), unexpected: true };

        await expect(
            mirrorStructuredReport(
                env,
                { ...input(), canonicalJson: decode(canonicalJsonBytes(drifted)) },
                { openDatabase },
            ),
        ).rejects.toThrow('Canonical report bytes do not match');
        expect(env.REPORT_SNAPSHOTS.get).not.toHaveBeenCalled();
        expect(env.REPORT_SNAPSHOTS.put).not.toHaveBeenCalled();
        expect(openDatabase).not.toHaveBeenCalled();
    });

    it.each([
        ['false', 'shadow'],
        ['true', 'production'],
    ])(
        'verifies both immutable R2 objects and maps publication=%s to %s only in the dispatch payload',
        async (flag, expectedMode) => {
            const env = enabledEnv(flag);
            const db = database();

            const result = await mirrorStructuredReport(env, input(), {
                openDatabase: vi.fn(() => db.sql),
            });

            expect(result).toMatchObject({
                status: 'mirrored',
                reportSnapshotId: '11111111-1111-4111-8111-111111111111',
                siteReleaseId: '22222222-2222-4222-8222-222222222222',
                siteReleaseSequence: 7,
            });
            for (const immutableBucket of [env.REPORT_SNAPSHOTS, env.SITE_MANIFESTS]) {
                expect(immutableBucket.put).toHaveBeenCalledOnce();
                expect(immutableBucket.get).toHaveBeenCalledTimes(2);
                expect(immutableBucket.put.mock.calls[0][2]).toMatchObject({
                    onlyIf: { etagDoesNotMatch: '*' },
                });
            }
            const siteManifest = JSON.parse(
                decode(env.SITE_MANIFESTS.put.mock.calls[0][1]),
            );
            expect(siteManifest).toMatchObject({
                schema_version: 1,
                taxonomy_version: 1,
                source_contract_version: 'daily-source-v1',
                serializer_version: 'daily-json-c14n-v1',
                search_contract_version: 'search-v1',
            });
            expect(siteManifest).not.toHaveProperty('daily_source_contract_version');
            const reserve = db.calls.find((call) => call.query.includes('reserve_ingestion_site_release_v1'));
            const prepare = db.calls.find((call) =>
                call.query.includes('prepare_ingestion_publication_slot_v1'),
            );
            expect(prepare.values).toEqual([
                '11111111-1111-4111-8111-111111111111',
                'morning',
                result.contentSha256,
            ]);
            expect(reserve.values.slice(1)).toEqual([
                'morning',
                result.contentSha256,
                result.contentSha256,
                `structured:2026-07-17:morning:${codeSha.toLowerCase()}`,
                'content-ingestor-unknown',
            ]);
            const finalize = db.calls.find((call) => call.query.includes('finalize_site_release_v1'));
            expect(finalize.values.at(-1)).toMatchObject({
                mode: expectedMode,
                code_sha: codeSha.toLowerCase(),
                source_code_sha: codeSha.toLowerCase(),
            });
            expect(db.sql.end).toHaveBeenCalledWith({ timeout: 2 });
        },
    );

    it('persists the forward-selected build SHA before the immutable outbox is created', async () => {
        const env = {
            ...enabledEnv('true'),
            GITHUB_TOKEN: 'test-token',
            GITHUB_REPO_OWNER: 'owner',
            GITHUB_REPO_NAME: 'repo',
        };
        const db = database();
        const mainSha = 'b'.repeat(40);
        const api = vi
            .fn()
            .mockResolvedValueOnce({ object: { sha: mainSha } })
            .mockResolvedValueOnce({
                status: 'ahead',
                base_commit: { sha: codeSha.toLowerCase() },
                merge_base_commit: { sha: codeSha.toLowerCase() },
            });

        await mirrorStructuredReport(env, input(), {
            openDatabase: vi.fn(() => db.sql),
            api,
        });

        const finalize = db.calls.find((call) => call.query.includes('finalize_site_release_v1'));
        expect(finalize.values.at(-1)).toMatchObject({
            code_sha: mainSha,
            source_code_sha: codeSha.toLowerCase(),
        });
    });

    it('reuses exact R2 bytes and the deterministic reservation after a committed finalize loses its response', async () => {
        const env = enabledEnv();
        const db = database({ loseFirstFinalizeResponse: true });
        const openDatabase = vi.fn(() => db.sql);

        await expect(mirrorStructuredReport(env, input(), { openDatabase })).rejects.toThrow(
            'finalize response lost after commit',
        );
        await expect(mirrorStructuredReport(env, input(), { openDatabase })).resolves.toMatchObject({
            status: 'mirrored',
            siteReleaseId: '22222222-2222-4222-8222-222222222222',
        });

        expect(env.REPORT_SNAPSHOTS.put).toHaveBeenCalledOnce();
        expect(env.SITE_MANIFESTS.put).toHaveBeenCalledOnce();
        const reservations = db.calls.filter((call) => call.query.includes('reserve_ingestion_site_release_v1'));
        expect(reservations).toHaveLength(2);
        expect(reservations[0].values).toEqual(reservations[1].values);
        const failureRecord = db.calls.find((call) => call.query.includes('fail_ingestion_publication_attempt_v1'));
        expect(failureRecord).toBeDefined();
        expect(db.sql.end).toHaveBeenCalledTimes(2);
    });

    it('records a failed semantic publication attempt without hiding the original error', async () => {
        const env = enabledEnv();
        const db = database({ rejectFinalize: true });

        await expect(
            mirrorStructuredReport(
                env,
                { ...input(), triggerId: 'scheduled:test-failure' },
                {
                    openDatabase: vi.fn(() => db.sql),
                },
            ),
        ).rejects.toThrow('shadow publication is disabled');

        const failureRecord = db.calls.find((call) => call.query.includes('fail_ingestion_publication_attempt_v1'));
        expect(failureRecord.values).toEqual([
            '2026-07-17',
            'morning',
            expect.stringMatching(/^[a-f0-9]{64}$/),
            'scheduled:test-failure',
            'content-ingestor-unknown',
            'Error',
            'shadow publication is disabled',
        ]);
        expect(db.sql.end).toHaveBeenCalledWith({ timeout: 2 });
    });

    it.each(['55P03', '40001'])(
        'retries transient database contention with bounded backoff %s',
        async (code) => {
            const env = enabledEnv();
            const contention = Object.assign(new Error('Release head is busy'), { code });
            const db = database({ reserveError: contention, reserveFailureCount: 1 });
            const sleep = vi.fn(async () => undefined);

            await expect(
                mirrorStructuredReport(env, input(), {
                    openDatabase: vi.fn(() => db.sql),
                    sleep,
                }),
            ).resolves.toMatchObject({ status: 'mirrored' });

            expect(
                db.calls.filter((call) => call.query.includes('reserve_ingestion_site_release_v1')),
            ).toHaveLength(2);
            expect(sleep).toHaveBeenCalledWith(100);
        },
    );

    it.each(['55P03', '40001'])(
        'does not permanently fail a publication attempt for transient database contention %s',
        async (code) => {
            const env = enabledEnv();
            const contention = Object.assign(new Error('Release head is busy'), {
                code,
            });
            const db = database({ reserveError: contention });

            await expect(
                mirrorStructuredReport(env, input(), {
                    openDatabase: vi.fn(() => db.sql),
                    sleep: vi.fn(async () => undefined),
                }),
            ).rejects.toBe(contention);

            expect(
                db.calls.filter((call) => call.query.includes('reserve_ingestion_site_release_v1')),
            ).toHaveLength(3);
            expect(
                db.calls.some((call) => call.query.includes('fail_ingestion_publication_attempt_v1')),
            ).toBe(false);
            expect(db.sql.end).toHaveBeenCalledWith({ timeout: 2 });
        },
    );
});
