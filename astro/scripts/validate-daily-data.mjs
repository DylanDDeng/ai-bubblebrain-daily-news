import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
	validateDailyReportIdentities,
	validateDailyReportSemantics,
	validateReportFilename,
} from '../../src/daily/semanticValidate.js';

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
	const productionFile = file.startsWith(productionDataDir);
	let semanticError = null;
	let filenameError = null;
	let compatibilityError = null;
	if (schemaValid) {
		try {
			validateDailyReportSemantics(report, { enforcePhase1: true });
			await validateDailyReportIdentities(report);
		} catch (error) {
			semanticError = error;
		}
		if (productionFile) {
			try {
				validateReportFilename(report, file);
			} catch (error) {
				filenameError = error;
			}
			for (const markdownPath of [
				resolve(repoRoot, 'content/daily', `${report.date}.md`),
				resolve(repoRoot, 'daily', `${report.date}.md`),
			]) {
				try {
					await access(markdownPath);
				} catch {
					compatibilityError = new Error(
						`Structured report is missing compatibility Markdown: ${markdownPath}`,
					);
					break;
				}
			}
		}
	}

	if (!schemaValid || semanticError || filenameError || compatibilityError) {
		failed = true;
		console.error(`Invalid daily report: ${file}`);
		if (!schemaValid) console.error(validate.errors);
		if (semanticError) console.error(semanticError.message);
		if (filenameError) console.error(filenameError.message);
		if (compatibilityError) console.error(compatibilityError.message);
	} else {
		console.log(`Valid daily report: ${file}`);
	}
}

if (productionFiles.length === 0) {
	console.log('No production daily JSON exists yet; validated the contract fixture only.');
}

if (failed) process.exitCode = 1;
