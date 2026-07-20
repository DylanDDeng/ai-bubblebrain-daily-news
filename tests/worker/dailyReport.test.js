import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDailyArtifacts } from '../../src/daily/buildArtifacts.js';
import { createDailyReportArtifacts } from '../../src/daily/serialize.js';
import {
    validateDailyReportIdentities,
    validateDailyReportSemantics,
    validateReportFilename,
} from '../../src/daily/semanticValidate.js';

const RUN_AT = '2026-07-14T07:00:00.000Z';
const PRODUCER = { version: 'phase1b-test', commitSha: 'a'.repeat(40) };

function rawItem(overrides = {}) {
    return {
        provider: 'aibase',
        id: 'source-1',
        title: 'A new AI product',
        url: 'https://example.com/story/?utm_source=rss&id=42',
        source: 'Example News',
        published_date: '2026-07-14T14:20:00+08:00',
        description: '<p>A concise summary.</p>',
        ...overrides,
    };
}

async function build(overrides = {}) {
    const reportDate = overrides.reportDate || '2026-07-14';
    return buildDailyArtifacts({
        rawItems: [rawItem()],
        reportDate,
        structuredStartDate: reportDate,
        batch: 'morning',
        runAt: RUN_AT,
        producer: PRODUCER,
        ...overrides,
    });
}

let validateSchema;

beforeAll(async () => {
    const schema = JSON.parse(await readFile(
        new URL('../../schemas/daily-report.schema.json', import.meta.url),
        'utf8',
    ));
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    validateSchema = ajv.compile(schema);
});

describe('daily report v1 deterministic boundary', () => {
    it('builds a schema-valid and semantically valid report', async () => {
        const result = await build();
        expect(validateSchema(result.report), JSON.stringify(validateSchema.errors)).toBe(true);
        expect(() => validateDailyReportSemantics(result.report)).not.toThrow();
        expect(result.report).toMatchObject({
            schema_version: 1,
            identity_version: 1,
            dedupe_version: 1,
            taxonomy_version: 1,
            classifier_version: 1,
            timezone: 'Asia/Shanghai',
            producer: {
                name: 'bubble-brain-worker',
                version: 'phase1b-test',
                commit_sha: 'a'.repeat(40),
                dedupe_lookback_days: 7,
            },
        });
        expect(result.report.items[0]).toMatchObject({
            source_type: 'aibase',
            content_type: 'news',
            source_id: 'source-1',
            category: 'products',
            topic_ids: ['topic_products'],
            entity_ids: [],
            featured: false,
            score: null,
            reason: null,
            related_source_ids: [],
            published_at: '2026-07-14T06:20:00.000Z',
            published_date: '2026-07-14',
            time_precision: 'exact',
        });
    });

    it('separates exact, date-only, and inferred time semantics', async () => {
        const result = await build({
            rawItems: [
                rawItem({ id: 'exact' }),
                rawItem({ id: 'date', url: 'https://example.com/date', published_date: '2026-07-13' }),
                rawItem({ id: 'unknown', url: 'https://example.com/unknown', published_date: 'unknown' }),
            ],
        });
        const byId = Object.fromEntries(result.report.items.map(item => [item.source_id, item]));
        expect(byId.exact).toMatchObject({ time_precision: 'exact', published_date: '2026-07-14' });
        expect(byId.date).toMatchObject({ time_precision: 'date_only', published_at: null, published_date: '2026-07-13' });
        expect(byId.unknown).toMatchObject({ time_precision: 'inferred', published_at: null, published_date: null });
        expect(validateSchema(result.report), JSON.stringify(validateSchema.errors)).toBe(true);
    });

    it('rejects malformed inputs into quarantine metrics', async () => {
        const result = await build({
            rawItems: [
                rawItem({ title: '' }),
                rawItem({ provider: 'unknown', id: 'two' }),
                rawItem({ id: null, url: null, published_date: null }),
            ],
        });
        expect(result.report.items).toEqual([]);
        expect(result.rejected).toEqual(['missing_title', 'unknown_provider', 'missing_identity']);
        expect(result.metrics).toMatchObject({ raw_count: 3, accepted_count: 0, rejected_count: 3 });
    });

    it('deduplicates connected source and URL claims independent of input order', async () => {
        const first = rawItem({ provider: 'aibase', id: 'aibase-id' });
        const second = rawItem({
            provider: 'xiaohu',
            id: 'xiaohu-id',
            url: 'https://example.com/story/?id=42&utm_medium=social',
            source: 'Different display name',
        });
        const left = await build({ rawItems: [first, second] });
        const right = await build({ rawItems: [second, first] });

        expect(left.report.items).toHaveLength(1);
        expect(left.json).toBe(right.json);
        expect(left.markdown).toBe(right.markdown);
        expect(left.report.items[0].identity_claims).toHaveLength(3);
        expect(left.metrics.same_day_duplicate_count).toBe(1);
    });

    it('does not merge identical titles when exact claims differ', async () => {
        const result = await build({
            rawItems: [
                rawItem({ id: 'one', url: 'https://example.com/one' }),
                rawItem({ id: 'two', url: 'https://example.com/two' }),
            ],
        });
        expect(result.report.items).toHaveLength(2);
    });

    it('makes an exact rerun a byte-identical no-op even with a later clock', async () => {
        const first = await build();
        const second = await build({
            existingReport: first.report,
            runAt: '2026-07-14T15:00:00Z',
        });
        expect(second.noOp).toBe(true);
        expect(second.metrics.fresh_count).toBe(0);
        expect(second.json).toBe(first.json);
        expect(second.markdown).toBe(first.markdown);
        expect(second.report.generated_at).toBe(first.report.generated_at);
        expect(second.report.overview).toEqual(first.report.overview);
    });

    it('repairs an existing report by removing newly blocked X accounts', async () => {
        const first = await build({
            rawItems: [rawItem({
                provider: 'twitter',
                id: 'blocked-social',
                url: 'https://x.com/ezshine/status/2079115504036552777',
                source: 'twitter-大帅老猿',
                title: 'A social post that was previously accepted',
            })],
        });
        const blockedId = first.report.items[0].id;
        const second = await build({
            existingReport: first.report,
            rawItems: [],
            runAt: '2026-07-14T15:00:00Z',
            blockedXHandles: 'ezshine',
        });

        expect(second.noOp).toBe(true);
        expect(second.report.items).toEqual([]);
        expect(second.report.batches.every(batch => !batch.item_ids.includes(blockedId))).toBe(true);
        expect(second.metrics.blocked_existing_count).toBe(1);
        expect(second.markdown).not.toContain('大帅老猿');
    });

    it('filters incoming cross-day duplicates for the inclusive seven-day window', async () => {
        const prior = await buildDailyArtifacts({
            rawItems: [rawItem()],
            reportDate: '2026-07-07',
            batch: 'morning',
            runAt: '2026-07-07T07:00:00Z',
            producer: PRODUCER,
            structuredStartDate: '2026-07-07',
        });
        const current = await build({ recentReports: [prior.report] });
        expect(current.report.items).toEqual([]);
        expect(current.metrics.cross_day_duplicate_count).toBe(1);
    });

    it('reports the same most-recent cross-day match regardless of history input order', async () => {
        const makePrior = date => buildDailyArtifacts({
            rawItems: [rawItem()],
            reportDate: date,
            batch: 'morning',
            runAt: `${date}T07:00:00Z`,
            producer: PRODUCER,
            structuredStartDate: date,
        });
        const older = await makePrior('2026-07-12');
        const newer = await makePrior('2026-07-13');
        const left = await build({ recentReports: [older.report, newer.report] });
        const right = await build({ recentReports: [newer.report, older.report] });
        expect(left.crossDayDuplicates).toEqual(right.crossDayDuplicates);
        expect(left.crossDayDuplicates[0].original_date).toBe('2026-07-13');
    });

    it('retains an incoming story outside the seven-day window', async () => {
        const old = await buildDailyArtifacts({
            rawItems: [rawItem()],
            reportDate: '2026-07-06',
            batch: 'morning',
            runAt: '2026-07-06T07:00:00Z',
            producer: PRODUCER,
            structuredStartDate: '2026-07-06',
        });
        const current = await build({ recentReports: [old.report] });
        expect(current.report.items).toHaveLength(1);
        expect(current.metrics.cross_day_duplicate_count).toBe(0);
    });

    it('never deletes an existing current-day item because history also contains it', async () => {
        const existing = await build();
        const prior = structuredClone(existing.report);
        prior.date = '2026-07-13';
        const current = await build({
            existingReport: existing.report,
            recentReports: [prior],
            rawItems: [],
            runAt: '2026-07-14T15:00:00Z',
        });
        expect(current.noOp).toBe(true);
        expect(current.report.items).toEqual(existing.report.items);
    });

    it('fails closed for missing expected structured history after the start date', async () => {
        await expect(build({
            structuredStartDate: '2026-07-13',
        })).rejects.toThrow('Missing structured history report');
        await expect(build({
            structuredStartDate: '2026-07-14',
        })).resolves.toMatchObject({ metrics: { cold_start: true } });
    });

    it('fails closed when a provided historical report is semantically invalid', async () => {
        const prior = await buildDailyArtifacts({
            rawItems: [rawItem()],
            reportDate: '2026-07-13',
            batch: 'morning',
            runAt: '2026-07-13T07:00:00Z',
            producer: PRODUCER,
            structuredStartDate: '2026-07-13',
        });
        prior.report.batches[0].item_ids = [];
        await expect(build({ recentReports: [prior.report] })).rejects.toThrow('invalid_batch_membership');
    });

    it('creates JSON and byte-identical Markdown compatibility files from one report', async () => {
        const result = await build();
        expect(result.files.map(file => file.path)).toEqual([
            'data/daily/2026-07-14.json',
            'daily/2026-07-14.md',
            'content/daily/2026-07-14.md',
        ]);
        expect(result.files[1].content).toBe(result.files[2].content);
        expect(result.files[1].content).toContain(`lastmod: ${result.report.generated_at}`);
        expect(result.files[1].content).toContain(result.report.overview.text);
    });

    it('checks filename dates and bidirectional batch invariants', async () => {
        const result = await build();
        expect(validateReportFilename(result.report, 'data/daily/2026-07-14.json')).toBe(true);
        expect(() => validateReportFilename(result.report, 'data/daily/2026-07-13.json')).toThrow();
        const broken = structuredClone(result.report);
        broken.batches[0].item_ids = [];
        expect(() => validateDailyReportSemantics(broken)).toThrow('invalid_batch_membership');
    });

    it('is pure and never calls fetch while building artifacts', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        await build();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid dates and clocks', async () => {
        await expect(build({ reportDate: '2026-02-30' })).rejects.toThrow('Invalid report date');
        await expect(build({ runAt: 'not-a-date' })).rejects.toThrow('Invalid runAt');
        await expect(build({ runAt: '2026-07-14T12:00:00' }))
            .rejects.toThrow('runAt must include an explicit timezone');
        await expect(build({ structuredStartDate: undefined })).rejects.toThrow('Invalid structuredStartDate');
        await expect(build({ structuredStartDate: '2026-07-15' }))
            .rejects.toThrow('structuredStartDate cannot be after reportDate');
    });

    it('builds identical artifacts across host timezones when runAt is explicit', async () => {
        const originalTimezone = process.env.TZ;
        try {
            process.env.TZ = 'UTC';
            const utc = await build();
            process.env.TZ = 'America/New_York';
            const newYork = await build();
            process.env.TZ = 'Asia/Shanghai';
            const shanghai = await build();
            expect(newYork.json).toBe(utc.json);
            expect(shanghai.json).toBe(utc.json);
            expect(newYork.markdown).toBe(utc.markdown);
            expect(shanghai.markdown).toBe(utc.markdown);
        } finally {
            if (originalTimezone === undefined) delete process.env.TZ;
            else process.env.TZ = originalTimezone;
        }
    });

    it('preserves the existing item as the first-seen record when a later source joins its claim graph', async () => {
        const first = await build();
        const original = structuredClone(first.report.items[0]);
        const updated = await build({
            existingReport: first.report,
            batch: 'afternoon',
            runAt: '2026-07-14T08:00:00Z',
            rawItems: [rawItem({
                provider: 'xiaohu',
                id: 'later-source-id',
                source: 'Later source',
                url: 'https://example.com/story/?id=42&utm_campaign=duplicate',
            })],
        });

        expect(updated.noOp).toBe(false);
        expect(updated.report.items).toHaveLength(1);
        expect(updated.report.items[0]).toMatchObject({
            id: original.id,
            source_type: original.source_type,
            source_id: original.source_id,
            ingested_at: original.ingested_at,
            batch: original.batch,
        });
        expect(updated.report.items[0].identity_claims.length).toBeGreaterThan(original.identity_claims.length);
    });

    it('keeps the late-night batch on the requested report date across the Beijing midnight boundary', async () => {
        const result = await build({
            reportDate: '2026-07-15',
            batch: 'lateNight',
            runAt: '2026-07-15T19:00:00Z',
            rawItems: [rawItem({
                id: 'late-night',
                url: 'https://example.com/late-night',
                published_date: '2026-07-16T02:30:00+08:00',
            })],
        });

        expect(result.report.date).toBe('2026-07-15');
        expect(result.report.items[0]).toMatchObject({
            batch: 'lateNight',
            ingested_at: '2026-07-15T19:00:00.000Z',
            published_date: '2026-07-16',
        });
        expect(result.files[0].path).toBe('data/daily/2026-07-15.json');
    });

    it('reruns the same reportDate and lateNight batch idempotently, appending only new items', async () => {
        // The 02:00 and 03:00 Beijing cron triggers both resolve to the previous
        // day's lateNight batch, so the same batch runs twice per report date.
        const first = await build({
            reportDate: '2026-07-15',
            batch: 'lateNight',
            runAt: '2026-07-15T18:00:00Z',
            rawItems: [rawItem({
                id: 'late-night',
                url: 'https://example.com/late-night',
                published_date: '2026-07-16T01:30:00+08:00',
            })],
        });

        const rerunSameFetch = await build({
            reportDate: '2026-07-15',
            batch: 'lateNight',
            existingReport: first.report,
            runAt: '2026-07-15T19:00:00Z',
            rawItems: [rawItem({
                id: 'late-night',
                url: 'https://example.com/late-night',
                published_date: '2026-07-16T01:30:00+08:00',
            })],
        });
        expect(rerunSameFetch.noOp).toBe(true);
        expect(rerunSameFetch.json).toBe(first.json);
        expect(rerunSameFetch.markdown).toBe(first.markdown);

        const rerunWithNewItem = await build({
            reportDate: '2026-07-15',
            batch: 'lateNight',
            existingReport: first.report,
            runAt: '2026-07-15T19:00:00Z',
            rawItems: [
                rawItem({
                    id: 'late-night',
                    url: 'https://example.com/late-night',
                    published_date: '2026-07-16T01:30:00+08:00',
                }),
                rawItem({
                    id: 'late-night-extra',
                    url: 'https://example.com/late-night-extra',
                    title: 'A later story',
                    published_date: '2026-07-16T02:30:00+08:00',
                }),
            ],
        });
        expect(rerunWithNewItem.noOp).toBe(false);
        expect(rerunWithNewItem.metrics.fresh_count).toBe(1);
        expect(rerunWithNewItem.report.items).toHaveLength(2);
        expect(rerunWithNewItem.report.items.map(item => item.batch)).toEqual(['lateNight', 'lateNight']);
        expect(rerunWithNewItem.report.items[0]).toMatchObject({
            id: first.report.items[0].id,
            source_id: 'late-night',
            ingested_at: first.report.items[0].ingested_at,
        });
        expect(rerunWithNewItem.report.items[1]).toMatchObject({ source_id: 'late-night-extra' });
        expect(rerunWithNewItem.report.batches.map(batch => batch.id))
            .toEqual(['morning', 'afternoon', 'night', 'lateNight']);
        expect(rerunWithNewItem.report.batches.find(batch => batch.id === 'lateNight').item_ids)
            .toEqual(rerunWithNewItem.report.items.map(item => item.id));
        expect(validateSchema(rerunWithNewItem.report), JSON.stringify(validateSchema.errors)).toBe(true);
    });

    it('fails closed on mismatched current reports, duplicate history dates, and invalid start dates', async () => {
        const existing = await build();
        await expect(build({ reportDate: '2026-07-15', existingReport: existing.report }))
            .rejects.toThrow('Existing report date mismatch');
        await expect(build({ recentReports: [existing.report, structuredClone(existing.report)] }))
            .rejects.toThrow('Duplicate structured history report date');
        await expect(build({ structuredStartDate: '2026-02-30' }))
            .rejects.toThrow('Invalid structuredStartDate');
    });

    it('rejects duplicate claims and every broken direction of batch or related-item references', async () => {
        const result = await build({
            rawItems: [
                rawItem({ id: 'one', url: 'https://example.com/one' }),
                rawItem({ id: 'two', url: 'https://example.com/two' }),
            ],
        });
        const firstId = result.report.items[0].id;
        const secondId = result.report.items[1].id;

        const duplicateClaim = structuredClone(result.report);
        duplicateClaim.items[1].identity_claims.push(duplicateClaim.items[0].identity_claims[0]);
        expect(() => validateDailyReportSemantics(duplicateClaim)).toThrow('identity_claim_collision');

        const duplicateMembership = structuredClone(result.report);
        duplicateMembership.batches[1].item_ids.push(firstId);
        expect(() => validateDailyReportSemantics(duplicateMembership)).toThrow('invalid_batch_membership');

        const unknownMembership = structuredClone(result.report);
        unknownMembership.batches[0].item_ids.push(`n_${'f'.repeat(64)}`);
        expect(() => validateDailyReportSemantics(unknownMembership)).toThrow('unknown_batch_item');

        const unknownRelated = structuredClone(result.report);
        unknownRelated.items[0].related_source_ids = [`n_${'e'.repeat(64)}`];
        expect(() => validateDailyReportSemantics(unknownRelated)).toThrow('unknown_related_source');

        const validRelated = structuredClone(result.report);
        validRelated.items[0].related_source_ids = [secondId];
        expect(() => validateDailyReportSemantics(validRelated)).not.toThrow();
    });

    it('keeps Phase 1 event identity strict without freezing future event clustering semantics', async () => {
        const result = await build();
        const clustered = structuredClone(result.report);
        clustered.items[0].event_id = `e_${'b'.repeat(64)}`;

        expect(() => validateDailyReportSemantics(clustered)).not.toThrow();
        expect(() => validateDailyReportSemantics(clustered, { enforcePhase1: true }))
            .toThrow('phase1_event_id_mismatch');
    });

    it('enforces schema size ceilings and rejects non-finite scores', async () => {
        const result = await build();
        const oversizedTitle = structuredClone(result.report);
        oversizedTitle.items[0].title = 'x'.repeat(501);
        expect(validateSchema(oversizedTitle)).toBe(false);

        const oversizedTopics = structuredClone(result.report);
        oversizedTopics.items[0].topic_ids = Array.from({ length: 33 }, (_, index) => `topic_${index}`);
        expect(validateSchema(oversizedTopics)).toBe(false);

        const unsafeScore = structuredClone(result.report);
        unsafeScore.items[0].score = Number.POSITIVE_INFINITY;
        expect(validateSchema(unsafeScore)).toBe(false);

        const missingAiProvenance = structuredClone(result.report);
        missingAiProvenance.overview = {
            text: 'Generated overview',
            kind: 'generated',
            provenance: { method: 'ai', model: null, prompt_version: null },
        };
        expect(validateSchema(missingAiProvenance)).toBe(false);
    });

    it('quarantines malformed raw values instead of aborting the whole batch', async () => {
        const result = await build({ rawItems: [null, rawItem({ id: 'valid-after-null' })] });
        expect(result.report.items).toHaveLength(1);
        expect(result.rejected).toEqual(['invalid_item']);
        expect(result.metrics).toMatchObject({ raw_count: 2, accepted_count: 1, rejected_count: 1 });
    });

    it('locks JSON and Markdown bytes with golden SHA-256 checksums', async () => {
        const result = await build();
        const digest = value => createHash('sha256').update(value).digest('hex');
        expect(digest(result.json)).toBe('32fe9efc6b4ea941a811be5afb3edbc08342ad16a61839ecc811b0e715882cfc');
        expect(digest(result.markdown)).toBe('b16d1f684594f328127c79ed42bc1ebc1dfb3fac1a84f06f03eb0352327fcdd4');
    });

    it('recomputes primary identity from source fields and fails closed on tampering', async () => {
        const result = await build();
        await expect(validateDailyReportIdentities(result.report)).resolves.toBe(true);

        const tamperedSource = structuredClone(result.report);
        tamperedSource.items[0].source_id = 'tampered-source-id';
        tamperedSource.items[0].source.id = 'tampered-source-id';
        await expect(validateDailyReportIdentities(tamperedSource)).rejects.toThrow('item_identity_mismatch');

        const tamperedClaims = structuredClone(result.report);
        tamperedClaims.items[0].identity_claims = [
            `c_${tamperedClaims.items[0].id.slice(2)}`,
        ];
        await expect(validateDailyReportIdentities(tamperedClaims)).rejects.toThrow('derived_claim_missing');
    });

    it('serializes identically when valid object keys were inserted in a different order', async () => {
        const result = await build();
        const reverseKeys = value => {
            if (Array.isArray(value)) return value.map(reverseKeys);
            if (!value || typeof value !== 'object') return value;
            return Object.fromEntries(
                Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]),
            );
        };
        const reordered = reverseKeys(result.report);
        const artifacts = createDailyReportArtifacts(reordered);
        expect(artifacts.json).toBe(result.json);
        expect(artifacts.markdown).toBe(result.markdown);
    });

    it('runs full schema validation for current history and final reports before returning artifacts', async () => {
        const existing = await build();
        const invalidCurrent = structuredClone(existing.report);
        invalidCurrent.schema_version = 999;
        await expect(build({ existingReport: invalidCurrent }))
            .rejects.toThrow('Invalid daily report schema');

        const invalidHistory = structuredClone(existing.report);
        invalidHistory.date = '2026-07-13';
        invalidHistory.producer.version = 'x'.repeat(101);
        await expect(build({ recentReports: [invalidHistory] }))
            .rejects.toThrow('Invalid daily report schema');

        await expect(build({ producer: { version: 'x'.repeat(101), commitSha: 'a'.repeat(40) } }))
            .rejects.toThrow('Invalid daily report schema');
        await expect(build({ producer: { version: 'valid', commitSha: 'not-a-sha' } }))
            .rejects.toThrow('Invalid daily report schema');
    });

    it('fails closed when one incoming entry bridges two distinct existing items', async () => {
        const existing = await build({
            rawItems: [
                rawItem({ id: 'existing-one', url: 'https://example.com/existing-one' }),
                rawItem({ id: 'existing-two', url: 'https://example.com/existing-two' }),
            ],
        });
        await expect(build({
            existingReport: existing.report,
            rawItems: [rawItem({ id: 'existing-one', url: 'https://example.com/existing-two' })],
        })).rejects.toThrow('conflict with multiple existing items');
    });

    it('distinguishes pending batches from completed empty batches and no-op reruns', async () => {
        const morning = await build();
        expect(morning.report.batches.map(({ status, generated_at: generatedAt }) => ({ status, generatedAt })))
            .toEqual([
                { status: 'completed', generatedAt: RUN_AT },
                { status: 'pending', generatedAt: null },
                { status: 'pending', generatedAt: null },
                { status: 'pending', generatedAt: null },
            ]);

        const afternoon = await build({
            existingReport: morning.report,
            rawItems: [],
            batch: 'afternoon',
            runAt: '2026-07-14T08:00:00Z',
        });
        expect(afternoon.noOp).toBe(false);
        expect(afternoon.report.batches[1]).toMatchObject({
            status: 'completed',
            generated_at: '2026-07-14T08:00:00.000Z',
            item_ids: [],
        });

        const rerun = await build({
            existingReport: afternoon.report,
            rawItems: [],
            batch: 'afternoon',
            runAt: '2026-07-14T09:00:00Z',
        });
        expect(rerun.noOp).toBe(true);
        expect(rerun.json).toBe(afternoon.json);
    });

    it('derives and enforces the complete fixed seven-day history window internally', async () => {
        const reports = [];
        for (let day = 7; day <= 13; day += 1) {
            const date = `2026-07-${String(day).padStart(2, '0')}`;
            const prior = await buildDailyArtifacts({
                rawItems: [],
                reportDate: date,
                batch: 'morning',
                runAt: `${date}T07:00:00Z`,
                producer: PRODUCER,
                structuredStartDate: date,
            });
            reports.push(prior.report);
        }
        await expect(build({
            recentReports: reports,
            structuredStartDate: '2026-07-07',
        })).resolves.toMatchObject({ metrics: { history_days_loaded: 7 } });

        await expect(build({
            recentReports: reports.slice(1),
            structuredStartDate: '2026-07-07',
        })).rejects.toThrow('Missing structured history report: 2026-07-07');
    });
});
