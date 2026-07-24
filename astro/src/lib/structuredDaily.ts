import { sanitizeSummaryText } from '../../../src/daily/summary.js';
import { compactEditorialTitle } from './textUtils';

export type DailyBatchId = 'morning' | 'afternoon' | 'night' | 'lateNight';
export type DailyContentType = 'news' | 'project' | 'paper' | 'socialMedia';

// Display-level taxonomy: socialMedia merges into news (X posts are largely news
// content), so the site only distinguishes news / project / paper.
export type DailyDisplayContentType = 'news' | 'project' | 'paper';

export function displayContentType(
	item: Pick<StructuredDailyItem, 'content_type'>,
): DailyDisplayContentType {
	return item.content_type === 'socialMedia' ? 'news' : item.content_type;
}

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

const itemPublishedTimestamp = (item: StructuredDailyItem): number =>
	Date.parse(item.published_at ?? item.published_date ?? item.ingested_at) || 0;

export function homepageFeedItems(
	items: readonly StructuredDailyItem[],
	batches: readonly StructuredDailyBatch[],
	limit = 8,
): StructuredDailyItem[] {
	const completedBatchRank = new Map(
		orderTimelineBatches(batches)
			.filter((batch) => batch.status === 'completed')
			.map((batch, index) => [batch.id, index]),
	);

	return items
		.filter((item) => completedBatchRank.has(item.batch))
		.sort((a, b) => {
			const batchOrder = completedBatchRank.get(a.batch)! - completedBatchRank.get(b.batch)!;
			return batchOrder || itemPublishedTimestamp(b) - itemPublishedTimestamp(a);
		})
		.slice(0, Math.max(0, Math.trunc(limit)));
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_STRUCTURED_CUTOVER_DATE = '2026-07-16';

declare const __STRUCTURED_CUTOVER_DATE__: string;

// process.env is honored where it exists (Node builds, tests) so the cutover
// can be overridden at runtime; the Workers runtime has no process.env, so SSR
// falls back to the build-time injected global.
function envCutoverDate(): string | undefined {
	const fromProcess =
		typeof process !== 'undefined' ? process.env?.STRUCTURED_CUTOVER_DATE : undefined;
	if (fromProcess && fromProcess.trim()) return fromProcess;
	if (typeof __STRUCTURED_CUTOVER_DATE__ === 'string' && __STRUCTURED_CUTOVER_DATE__) {
		return __STRUCTURED_CUTOVER_DATE__;
	}
	return undefined;
}

export function structuredCutoverDate(value = envCutoverDate()): string {
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

export function cleanTimelineSummary(value: string): string {
	return sanitizeSummaryText(value);
}

export function timelineSourceDisplay(item: StructuredDailyItem): {
	name: string;
	isX: boolean;
} {
	const rawName = cleanTimelineSummary(item.source.name);
	const sourceType = item.source_type.trim().toLocaleLowerCase('en');
	let canonicalHost = '';
	try {
		canonicalHost = item.canonical_url
			? new URL(item.canonical_url).hostname.toLocaleLowerCase('en')
			: '';
	} catch {
		// Invalid source URLs are handled by the report validator; keep display rendering fail-safe.
	}

	const isX =
		/^twitter(?:[_-].*)?$/i.test(sourceType) ||
		/^twitter[-\s:]/i.test(rawName) ||
		canonicalHost === 'x.com' ||
		canonicalHost.endsWith('.x.com') ||
		canonicalHost === 'twitter.com' ||
		canonicalHost.endsWith('.twitter.com');
	if (!isX) return { name: rawName || item.source_type, isX: false };

	return {
		name: rawName.replace(/^twitter[-\s:]*/i, '').trim() || 'X',
		isX: true,
	};
}

export function timelineDisplayText(item: StructuredDailyItem): { title: string; summary: string } {
	const rawTitle = cleanTimelineSummary(item.title);
	const rawSummary = cleanTimelineSummary(item.summary);
	if (item.content_type !== 'socialMedia') return { title: rawTitle, summary: rawSummary };

	return {
		title: compactEditorialTitle(rawTitle, rawSummary),
		summary: '',
	};
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
