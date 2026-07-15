import taxonomyData from '../../../data/knowledge/taxonomy.json';

export type KnowledgeLocale = 'zh-CN' | 'en';
export type TaxonomyStatus = 'active' | 'deprecated' | 'merged';

export interface TaxonomyRecord {
	id: string;
	slug: string;
	slug_aliases: string[];
	labels: { zh: string; en: string };
	aliases: string[];
	keywords: string[];
	status: TaxonomyStatus;
	redirect_to_id: string | null;
}

export interface TopicRecord extends TaxonomyRecord {
	category: string;
}

export interface EntityRecord extends TaxonomyRecord {
	entity_type: 'organization' | 'person' | 'product' | 'model' | 'project';
}

export type TaxonomyKind = 'topic' | 'entity';

export interface TaxonomyRoute<T extends TaxonomyRecord> {
	slug: string;
	record: T;
	canonical: T;
	isAlias: boolean;
	redirect: boolean;
}

export const knowledgeTaxonomy = taxonomyData as {
	schema_version: 1;
	classifier_version: 1;
	topics: TopicRecord[];
	entities: EntityRecord[];
};

export const topicsById = new Map(knowledgeTaxonomy.topics.map((topic) => [topic.id, topic]));
export const entitiesById = new Map(
	knowledgeTaxonomy.entities.map((entity) => [entity.id, entity]),
);

export function taxonomyLabel(record: TaxonomyRecord, locale: KnowledgeLocale): string {
	return locale === 'en' ? record.labels.en : record.labels.zh;
}

export function canonicalTaxonomyRecord<T extends TaxonomyRecord>(
	record: T,
	registry: Map<string, T>,
): T {
	if (record.status !== 'merged' || !record.redirect_to_id) return record;
	const target = registry.get(record.redirect_to_id);
	if (!target || target.status !== 'active')
		throw new Error(`Invalid taxonomy redirect: ${record.id}`);
	return target;
}

export function canonicalTaxonomyId<T extends TaxonomyRecord>(
	id: string,
	registry: Map<string, T>,
): string {
	const record = registry.get(id);
	if (!record) throw new Error(`Unknown taxonomy ID: ${id}`);
	return canonicalTaxonomyRecord(record, registry).id;
}

export function canonicalizeTaxonomyIds<T extends TaxonomyRecord>(
	ids: string[],
	records: T[],
	registry: Map<string, T>,
): string[] {
	const canonicalIds = new Set(ids.map((id) => canonicalTaxonomyId(id, registry)));
	return records.filter((record) => canonicalIds.has(record.id)).map((record) => record.id);
}

export function taxonomyRoutePath(kind: TaxonomyKind, slug: string): string {
	return `/${kind === 'topic' ? 'topics' : 'entities'}/${slug}/`;
}

export function taxonomyRoutes<T extends TaxonomyRecord>(
	records: T[],
	registry: Map<string, T>,
): TaxonomyRoute<T>[] {
	const claimedSlugs = new Set<string>();
	const routes: TaxonomyRoute<T>[] = [];
	for (const record of records) {
		const canonical = canonicalTaxonomyRecord(record, registry);
		for (const slug of [record.slug, ...record.slug_aliases]) {
			if (claimedSlugs.has(slug)) throw new Error(`Duplicate taxonomy route slug: ${slug}`);
			claimedSlugs.add(slug);
			const isAlias = slug !== record.slug;
			routes.push({
				slug,
				record,
				canonical,
				isAlias,
				redirect: isAlias || record.status === 'merged',
			});
		}
	}
	return routes;
}

export function activeTaxonomyRecords<T extends TaxonomyRecord>(records: T[]): T[] {
	return records.filter((record) => record.status === 'active');
}
