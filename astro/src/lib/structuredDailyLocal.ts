import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	validateDailyReportIdentities,
	validateDailyReportSemantics,
	validateReportFilename,
} from '../../../src/daily/semanticValidate.js';
import { validateDailyReportSchemaForAstro } from './dailySchema';
import type { StructuredDailyReport } from './structuredDaily';

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const reportCache = new Map<string, Promise<StructuredDailyReport | null>>();

export function dailyDataDirectory(directory?: string): string {
	if (directory) return resolve(directory);
	if (process.env.DAILY_DATA_DIR) return resolve(process.env.DAILY_DATA_DIR);
	return resolve(process.cwd(), '..', 'data', 'daily');
}

async function readStructuredReport(
	dateKey: string,
	directory?: string,
): Promise<StructuredDailyReport | null> {
	if (!dateKeyPattern.test(dateKey)) throw new Error(`Invalid structured daily date: ${dateKey}`);
	const path = resolve(dailyDataDirectory(directory), `${dateKey}.json`);
	let source: string;
	try {
		source = await readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}

	const report: unknown = JSON.parse(source);
	await validateDailyReportSchemaForAstro(report);
	validateDailyReportSemantics(report, { enforcePhase1: true });
	await validateDailyReportIdentities(report);
	validateReportFilename(report, path);
	return report as StructuredDailyReport;
}

export function loadStructuredDailyReport(
	dateKey: string,
	options: { directory?: string } = {},
): Promise<StructuredDailyReport | null> {
	const directory = dailyDataDirectory(options.directory);
	const cacheKey = `${directory}\0${dateKey}`;
	if (!reportCache.has(cacheKey)) {
		reportCache.set(cacheKey, readStructuredReport(dateKey, directory));
	}
	return reportCache.get(cacheKey)!;
}
