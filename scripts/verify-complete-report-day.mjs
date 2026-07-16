import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { BATCH_ORDER } from '../src/daily/dedupe.js';
import { createDailyReportArtifacts } from '../src/daily/serialize.js';
import {
    validateDailyReportIdentities,
    validateDailyReportSemantics,
    validateReportFilename,
} from '../src/daily/semanticValidate.js';
import { isRealDate } from '../src/daily/time.js';

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function validateSchema(report) {
    const schema = JSON.parse(await readFile(
        resolve(defaultRepoRoot, 'schemas/daily-report.schema.json'),
        'utf8',
    ));
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(report)) {
        const details = (validate.errors || [])
            .map(error => `${error.instancePath || '/'} ${error.message}`)
            .join('; ');
        throw new Error(`Invalid daily report schema: ${details}`);
    }
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function assertCompleteBatches(report) {
    const batchIds = report.batches.map(batch => batch.id);
    if (JSON.stringify(batchIds) !== JSON.stringify(BATCH_ORDER)) {
        throw new Error(`Report batches are not the required order: ${BATCH_ORDER.join(', ')}`);
    }
    const incomplete = report.batches
        .filter(batch => batch.status !== 'completed')
        .map(batch => batch.id);
    if (incomplete.length > 0) {
        throw new Error(`Report day is incomplete; unfinished batches: ${incomplete.join(', ')}`);
    }
}

function assertOneToOneMembership(report) {
    const itemIds = report.items.map(item => item.id);
    const batchItemIds = report.batches.flatMap(batch => batch.item_ids);
    const itemSet = new Set(itemIds);
    const batchItemSet = new Set(batchItemIds);
    if (itemSet.size !== itemIds.length
        || batchItemSet.size !== batchItemIds.length
        || itemIds.length !== batchItemIds.length
        || itemIds.some(id => !batchItemSet.has(id))) {
        throw new Error('Report items and batch memberships are not one-to-one');
    }
}

export async function verifyCompleteReportDay({
    reportDate,
    repoRoot = defaultRepoRoot,
} = {}) {
    if (!isRealDate(reportDate)) {
        throw new Error('REPORT_DATE must be a real date in YYYY-MM-DD format');
    }

    const relativeJsonPath = `data/daily/${reportDate}.json`;
    const jsonPath = resolve(repoRoot, relativeJsonPath);
    const jsonBytes = await readFile(jsonPath);
    let report;
    try {
        report = JSON.parse(jsonBytes.toString('utf8'));
    } catch {
        throw new Error(`Canonical report JSON is invalid: ${relativeJsonPath}`);
    }

    validateReportFilename(report, relativeJsonPath);
    await validateSchema(report);
    validateDailyReportSemantics(report, { enforcePhase1: true });
    await validateDailyReportIdentities(report);
    assertCompleteBatches(report);
    assertOneToOneMembership(report);

    const expectedArtifacts = createDailyReportArtifacts(report).files;
    const requiredPaths = [
        `data/daily/${reportDate}.json`,
        `daily/${reportDate}.md`,
        `content/daily/${reportDate}.md`,
    ];
    const artifactPaths = expectedArtifacts.map(artifact => artifact.path);
    if (JSON.stringify(artifactPaths) !== JSON.stringify(requiredPaths)) {
        throw new Error(`Artifact contract drifted; expected exactly: ${requiredPaths.join(', ')}`);
    }
    const artifacts = [];
    for (const artifact of expectedArtifacts) {
        const actual = await readFile(resolve(repoRoot, artifact.path));
        const expected = Buffer.from(artifact.content, 'utf8');
        if (!actual.equals(expected)) {
            throw new Error(
                `Artifact bytes differ: ${artifact.path} `
                + `(actual ${sha256(actual)}, expected ${sha256(expected)})`,
            );
        }
        artifacts.push({
            path: artifact.path,
            bytes: actual.length,
            sha256: sha256(actual),
        });
    }

    return {
        reportDate,
        batchIds: [...BATCH_ORDER],
        itemCount: report.items.length,
        artifacts,
    };
}

export function parseCliReportDate(argv, env = {}) {
    const environmentDate = env.REPORT_DATE?.trim() || null;
    if (argv.length === 0) return environmentDate;
    if (environmentDate) {
        throw new Error('Choose one report date source: CLI argument or REPORT_DATE');
    }
    if (argv[0] === '--date') {
        if (argv.length !== 2 || !argv[1] || argv[1].startsWith('-')) {
            throw new Error('Usage: npm run verify:report-day -- [--date] YYYY-MM-DD');
        }
        return argv[1];
    }
    if (argv.length === 1 && !argv[0].startsWith('-')) return argv[0];
    throw new Error('Usage: npm run verify:report-day -- [--date] YYYY-MM-DD');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    const result = await verifyCompleteReportDay({
        reportDate: parseCliReportDate(process.argv.slice(2), process.env),
    });
    console.log(
        `Verified ${result.reportDate}: ${result.batchIds.length} completed batches, `
        + `${result.itemCount} items, ${result.artifacts.length} byte-exact artifacts.`,
    );
    for (const artifact of result.artifacts) {
        console.log(`${artifact.sha256}  ${artifact.path}`);
    }
}
