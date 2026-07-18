import { readdir } from 'node:fs/promises';

import {
	canonicalTaxonomyRecord,
	canonicalizeTaxonomyIds,
	entitiesById,
	knowledgeTaxonomy,
	taxonomyLabel,
	topicsById,
	type KnowledgeLocale,
	type TaxonomyRecord,
} from './knowledge';
import {
	dailyDataDirectory,
	loadStructuredDailyReport,
	type StructuredDailyItem,
} from './structuredDaily';

export interface KnowledgeSearchItem {
	key: string;
	id: string;
	date: string;
	href: string;
	title: string;
	summary: string;
	source_name: string;
	source_type: string;
	content_type: StructuredDailyItem['content_type'];
	category: string;
	published_at: string | null;
	published_date: string | null;
	topic_ids: string[];
	entity_ids: string[];
	search_text: string;
}

export interface KnowledgeSearchIndex {
	schema_version: 1;
	taxonomy_version: 1;
	site_release_id: string | null;
	item_count: number;
	report_dates: string[];
	items: KnowledgeSearchItem[];
}

const STATIC_SEARCH_MAX_REPORT_DAYS = 7;
const STATIC_SEARCH_MAX_BYTES = 8 * 1024 * 1024;

function itemHref(date: string, id: string): string {
	const [year, month] = date.split('-');
	return `/daily/${year}/${month}/${date}/#news-${id}`;
}

function searchText(item: StructuredDailyItem, locale: KnowledgeLocale): string {
	const topicTerms = item.topic_ids.flatMap((id) => {
		const topic = topicsById.get(id);
		if (!topic) return [];
		const canonical = canonicalTaxonomyRecord(topic, topicsById);
		return taxonomySearchTerms([topic, canonical], locale);
	});
	const entityTerms = item.entity_ids.flatMap((id) => {
		const entity = entitiesById.get(id);
		if (!entity) return [];
		const canonical = canonicalTaxonomyRecord(entity, entitiesById);
		return taxonomySearchTerms([entity, canonical], locale);
	});
	return [
		item.title,
		item.summary,
		item.source.name,
		item.source_type,
		item.content_type,
		item.category,
		...topicTerms,
		...entityTerms,
	]
		.join(' ')
		.normalize('NFKC')
		.toLocaleLowerCase(locale);
}

function taxonomySearchTerms(records: TaxonomyRecord[], locale: KnowledgeLocale): string[] {
	return [
		...new Set(
			records.flatMap((record) => [
				taxonomyLabel(record, locale),
				...record.aliases,
				...record.keywords,
			]),
		),
	];
}

function compareSearchItems(left: KnowledgeSearchItem, right: KnowledgeSearchItem): number {
	if (left.date !== right.date) return right.date.localeCompare(left.date);
	const leftTime = left.published_at ?? left.published_date ?? '';
	const rightTime = right.published_at ?? right.published_date ?? '';
	return rightTime.localeCompare(leftTime) || left.id.localeCompare(right.id);
}

export async function buildKnowledgeSearchIndex(
	options: {
		directory?: string;
		locale?: KnowledgeLocale;
		siteReleaseId?: string | null;
	} = {},
): Promise<KnowledgeSearchIndex> {
	const directory = dailyDataDirectory(options.directory);
	const locale = options.locale ?? 'zh-CN';
	const siteReleaseId = options.siteReleaseId ?? process.env.CONTENT_RELEASE_ID ?? null;
	if (
		siteReleaseId !== null &&
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			siteReleaseId,
		)
	) {
		throw new Error('Invalid site release identity for search index');
	}
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = [];
		else throw error;
	}
	const availableReportDates = names
		.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
		.map((name) => name.slice(0, -5))
		.sort((left, right) => right.localeCompare(left));
	const reportDates = availableReportDates.slice(0, STATIC_SEARCH_MAX_REPORT_DAYS);
	const items: KnowledgeSearchItem[] = [];
	for (const date of reportDates) {
		const report = await loadStructuredDailyReport(date, { directory });
		if (!report) throw new Error(`Structured daily report disappeared: ${date}`);
		items.push(
			...report.items.map((item) => ({
				key: `${report.date}:${item.id}`,
				id: item.id,
				date: report.date,
				href: itemHref(report.date, item.id),
				title: item.title,
				summary: item.summary,
				source_name: item.source.name,
				source_type: item.source_type,
				content_type: item.content_type,
				category: item.category,
				published_at: item.published_at,
				published_date: item.published_date,
				topic_ids: canonicalizeTaxonomyIds(item.topic_ids, knowledgeTaxonomy.topics, topicsById),
				entity_ids: canonicalizeTaxonomyIds(
					item.entity_ids,
					knowledgeTaxonomy.entities,
					entitiesById,
				),
				search_text: searchText(item, locale),
			})),
		);
	}
	items.sort(compareSearchItems);
	const result: KnowledgeSearchIndex = {
		schema_version: 1,
		taxonomy_version: 1,
		site_release_id: siteReleaseId,
		item_count: items.length,
		report_dates: reportDates,
		items,
	};
	const encoder = new TextEncoder();
	while (
		result.items.length > 0 &&
		encoder.encode(JSON.stringify(result)).byteLength > STATIC_SEARCH_MAX_BYTES
	) {
		result.items.pop();
	}
	result.item_count = result.items.length;
	result.report_dates = [...new Set(result.items.map((item) => item.date))];
	return result;
}
