import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    parseCliReportDate,
    verifyCompleteReportDay,
} from '../../scripts/verify-complete-report-day.mjs';
import { buildDailyArtifacts } from '../../src/daily/buildArtifacts.js';
import { createDailyReportArtifacts } from '../../src/daily/serialize.js';

const REPORT_DATE = '2026-07-16';
const PRODUCER = { version: 'complete-day-test', commitSha: 'a'.repeat(40) };
const RUN_AT = {
    morning: '2026-07-16T02:00:00.000Z',
    afternoon: '2026-07-16T07:00:00.000Z',
    night: '2026-07-16T15:00:00.000Z',
    lateNight: '2026-07-16T19:00:00.000Z',
};

const temporaryRoots = [];

function rawItem(batch) {
    return {
        provider: 'aibase',
        id: `source-${batch}`,
        title: `AI update from ${batch}`,
        url: `https://example.com/${batch}`,
        source: 'Example News',
        published_date: RUN_AT[batch],
        description: `Summary for ${batch}.`,
    };
}

async function buildThrough(lastBatch = 'lateNight') {
    let existingReport = null;
    for (const batch of ['morning', 'afternoon', 'night', 'lateNight']) {
        const result = await buildDailyArtifacts({
            existingReport,
            rawItems: [rawItem(batch)],
            reportDate: REPORT_DATE,
            structuredStartDate: REPORT_DATE,
            batch,
            runAt: RUN_AT[batch],
            producer: PRODUCER,
        });
        existingReport = result.report;
        if (batch === lastBatch) return result;
    }
    throw new Error(`Unknown batch: ${lastBatch}`);
}

async function writeArtifacts(files) {
    const root = await mkdtemp(resolve(tmpdir(), 'complete-report-day-'));
    temporaryRoots.push(root);
    for (const file of files) {
        const path = resolve(root, file.path);
        await mkdir(resolve(path, '..'), { recursive: true });
        await writeFile(path, file.content, 'utf8');
    }
    return root;
}

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('complete production report-day verifier', () => {
    it('accepts exactly one explicit CLI or environment date source', () => {
        expect(parseCliReportDate([REPORT_DATE], {})).toBe(REPORT_DATE);
        expect(parseCliReportDate(['--date', REPORT_DATE], {})).toBe(REPORT_DATE);
        expect(parseCliReportDate([], { REPORT_DATE })).toBe(REPORT_DATE);
        expect(() => parseCliReportDate(['--unknown', REPORT_DATE], {})).toThrow('Usage:');
        expect(() => parseCliReportDate([REPORT_DATE, 'extra'], {})).toThrow('Usage:');
        expect(() => parseCliReportDate(['--date'], {})).toThrow('Usage:');
        expect(() => parseCliReportDate([REPORT_DATE], { REPORT_DATE })).toThrow('Choose one report date source');
    });

    it('accepts four completed batches with one-to-one membership and exact artifacts', async () => {
        const complete = await buildThrough();
        const root = await writeArtifacts(complete.files);

        await expect(verifyCompleteReportDay({ reportDate: REPORT_DATE, repoRoot: root }))
            .resolves.toMatchObject({
                reportDate: REPORT_DATE,
                batchIds: ['morning', 'afternoon', 'night', 'lateNight'],
                itemCount: 4,
                artifacts: [
                    { path: `data/daily/${REPORT_DATE}.json` },
                    { path: `daily/${REPORT_DATE}.md` },
                    { path: `content/daily/${REPORT_DATE}.md` },
                ],
            });
    });

    it('rejects an otherwise exact report while a scheduled batch is unfinished', async () => {
        const morning = await buildThrough('morning');
        const root = await writeArtifacts(morning.files);

        await expect(verifyCompleteReportDay({ reportDate: REPORT_DATE, repoRoot: root }))
            .rejects.toThrow('unfinished batches: afternoon, night, lateNight');
    });

    it('rejects duplicate or missing one-to-one batch membership', async () => {
        const complete = await buildThrough();
        const broken = structuredClone(complete.report);
        broken.batches[1].item_ids.push(broken.batches[0].item_ids[0]);
        const root = await writeArtifacts(createDailyReportArtifacts(broken).files);

        await expect(verifyCompleteReportDay({ reportDate: REPORT_DATE, repoRoot: root }))
            .rejects.toThrow('Invalid daily report semantics');
    });

    it('rejects drift in either Markdown compatibility artifact', async () => {
        const complete = await buildThrough();
        const root = await writeArtifacts(complete.files);
        await writeFile(resolve(root, `content/daily/${REPORT_DATE}.md`), `${complete.markdown}\n`, 'utf8');

        await expect(verifyCompleteReportDay({ reportDate: REPORT_DATE, repoRoot: root }))
            .rejects.toThrow(`Artifact bytes differ: content/daily/${REPORT_DATE}.md`);
    });

    it('rejects valid but non-canonical JSON bytes', async () => {
        const complete = await buildThrough();
        const root = await writeArtifacts(complete.files);
        await writeFile(
            resolve(root, `data/daily/${REPORT_DATE}.json`),
            `${JSON.stringify(complete.report)}\n`,
            'utf8',
        );

        await expect(verifyCompleteReportDay({ reportDate: REPORT_DATE, repoRoot: root }))
            .rejects.toThrow(`Artifact bytes differ: data/daily/${REPORT_DATE}.json`);
    });
});
