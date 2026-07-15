import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const schemaPath = resolve(repoRoot, 'schemas/daily-report.schema.json');
const productionDataDir = resolve(repoRoot, 'data/daily');
const fixturePath = resolve(scriptDir, '../tests/fixtures/daily-report.valid.json');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const productionFiles = (await readdir(productionDataDir))
	.filter((name) => name.endsWith('.json'))
	.map((name) => resolve(productionDataDir, name));
const files = [fixturePath, ...productionFiles];

let failed = false;

for (const file of files) {
	const report = JSON.parse(await readFile(file, 'utf8'));
	const schemaValid = validate(report);
	const itemIds = new Set(report.items.map((item) => item.id));
	const duplicateItemIds = report.items.length !== itemIds.size;
	const unknownBatchItemIds = report.batches
		.flatMap((batch) => batch.item_ids)
		.filter((id) => !itemIds.has(id));
	const productionFile = file.startsWith(productionDataDir);
	const expectedDate = productionFile ? file.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1] : report.date;
	const filenameMatchesDate = expectedDate === report.date;

	if (!schemaValid || duplicateItemIds || unknownBatchItemIds.length > 0 || !filenameMatchesDate) {
		failed = true;
		console.error(`Invalid daily report: ${file}`);
		if (!schemaValid) console.error(validate.errors);
		if (duplicateItemIds) console.error('Duplicate item ids detected.');
		if (unknownBatchItemIds.length > 0) {
			console.error(`Unknown batch item ids: ${unknownBatchItemIds.join(', ')}`);
		}
		if (!filenameMatchesDate) console.error('Report date does not match its filename.');
	} else {
		console.log(`Valid daily report: ${file}`);
	}
}

if (productionFiles.length === 0) {
	console.log('No production daily JSON exists yet; validated the contract fixture only.');
}

if (failed) process.exitCode = 1;
