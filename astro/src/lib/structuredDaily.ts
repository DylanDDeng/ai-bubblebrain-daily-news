import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { sanitizeSummaryText } from '../../../src/daily/summary.js';
import {
	validateDailyReportIdentities,
	validateDailyReportSemantics,
	validateReportFilename,
} from '../../../src/daily/semanticValidate.js';
import { validateDailyReportSchemaForAstro } from './dailySchema';

export type DailyBatchId = 'morning' | 'afternoon' | 'night' | 'lateNight';
export type DailyContentType = 'news' | 'project' | 'paper' | 'socialMedia';

export interface StructuredDailyItem {
	id: string;
	event_id: string;
	source_type: string;
	content_type: DailyContentType;
	title: string;
	canonical_url: string | null;
	published_at: string | null;
	published_date: string | null;
	ingested_at: string;
	time_precision: 'exact' | 'date_only' | 'inferred';
	batch: DailyBatchId;
	summary: string;
	category: string;
	topic_ids: string[];
	entity_ids: string[];
	featured: boolean;
	score: number | null;
	reason: string | null;
	source: {
		name: string;
		homepage: string | null;
	};
}

export interface StructuredDailyBatch {
	id: DailyBatchId;
	label: string;
	status: 'pending' | 'completed';
	generated_at: string | null;
	item_ids: string[];
}

export interface StructuredDailyReport {
	schema_version: 1;
	identity_version: 1;
	dedupe_version: 1;
	taxonomy_version: 1;
	classifier_version: 1;
	date: string;
	timezone: 'Asia/Shanghai';
	generated_at: string;
	overview: { text: string; kind: string };
	batches: StructuredDailyBatch[];
	items: StructuredDailyItem[];
}

export function orderTimelineBatches(
	batches: readonly StructuredDailyBatch[],
): StructuredDailyBatch[] {
	const completed: StructuredDailyBatch[] = [];
	const pending: StructuredDailyBatch[] = [];

	for (const batch of batches) {
		if (batch.status === 'completed') completed.push(batch);
		else pending.push(batch);
	}

	return [...completed.reverse(), ...pending];
}

const reportCache = new Map<string, Promise<StructuredDailyReport | null>>();
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_STRUCTURED_CUTOVER_DATE = '2026-07-16';

export function structuredCutoverDate(value = process.env.STRUCTURED_CUTOVER_DATE): string {
	const cutoverDate = value?.trim() || DEFAULT_STRUCTURED_CUTOVER_DATE;
	if (!dateKeyPattern.test(cutoverDate)) {
		throw new Error('STRUCTURED_CUTOVER_DATE must use YYYY-MM-DD');
	}
	return cutoverDate;
}

export function isDatabaseOwnedDailyDate(
	dateKey: string,
	cutoverDate = structuredCutoverDate(),
): boolean {
	if (!dateKeyPattern.test(dateKey)) throw new Error(`Invalid structured daily date: ${dateKey}`);
	if (!dateKeyPattern.test(cutoverDate)) {
		throw new Error('STRUCTURED_CUTOVER_DATE must use YYYY-MM-DD');
	}
	return dateKey >= cutoverDate;
}

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

export function cleanTimelineSummary(value: string): string {
	return sanitizeSummaryText(value);
}

// HH:MM wall-clock label for report/batch timestamps in the site's timezone.
export function formatDailyTime(iso: string, locale: 'zh-CN' | 'en'): string {
	return new Intl.DateTimeFormat(locale, {
		timeZone: 'Asia/Shanghai',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(new Date(iso));
}

export function formatTimelineTime(
	item: StructuredDailyItem,
	locale: 'zh-CN' | 'en',
	reportDate: string,
): string {
	if (!item.published_at) {
		return item.time_precision === 'date_only' && item.published_date
			? item.published_date.slice(5)
			: '—';
	}
	const time = new Intl.DateTimeFormat(locale, {
		timeZone: 'Asia/Shanghai',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(new Date(item.published_at));
	return item.published_date && item.published_date !== reportDate
		? `${item.published_date.slice(5)} ${time}`
		: time;
}
