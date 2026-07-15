import type { LegacyContentEntry } from './legacyContent';
import type { TaxonomyRecord } from './knowledge';

interface TaxonomyRegistry {
	topics: TaxonomyRecord[];
	entities: TaxonomyRecord[];
}

export function taxonomyRedirectLines(taxonomy: TaxonomyRegistry): string[] {
	const lines: string[] = [];
	const sources = new Set<string>();
	for (const [kind, records] of [
		['topics', taxonomy.topics],
		['entities', taxonomy.entities],
	] as const) {
		const byId = new Map(records.map((record) => [record.id, record]));
		for (const record of records) {
			const canonical = record.status === 'merged' ? byId.get(record.redirect_to_id ?? '') : record;
			if (!canonical) throw new Error(`Missing taxonomy redirect target: ${record.id}`);
			for (const slug of [record.slug, ...record.slug_aliases]) {
				if (record.status !== 'merged' && slug === record.slug) continue;
				const source = `/${kind}/${slug}/`;
				if (sources.has(source)) throw new Error(`Duplicate redirect source: ${source}`);
				sources.add(source);
				lines.push(`${source} /${kind}/${canonical.slug}/ 301`);
			}
		}
	}
	return lines.sort();
}

export function legacyRedirectLines(entries: LegacyContentEntry[]): string[] {
	return entries
		.flatMap((entry) => entry.aliases.map((alias) => `${alias} ${entry.route} 301`))
		.sort();
}

export function renderCloudflareRedirects(
	taxonomy: TaxonomyRegistry,
	entries: LegacyContentEntry[] = [],
): string {
	const lines = [
		...taxonomyRedirectLines(taxonomy),
		...legacyRedirectLines(entries),
		'/en/index.xml /en/rss.xml 301',
		'/en/daily/2025/12/202-22/ /en/daily/2025/12/2025-12-22/ 301',
		'/index.xml /rss.xml 301',
		'/zh-cn/ / 301',
	];
	const sources = new Set<string>();
	for (const line of lines) {
		const [source] = line.split(' ');
		if (sources.has(source)) throw new Error(`Duplicate redirect source: ${source}`);
		sources.add(source);
	}
	return [
		'# Generated from versioned content contracts. Do not edit by hand.',
		...lines.sort(),
		'',
	].join('\n');
}
