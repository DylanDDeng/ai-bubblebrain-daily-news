import { getCollection, type CollectionEntry } from 'astro:content';

import {
	loadLegacyContent,
	type LegacyContentEntry,
	type LegacyLocale,
} from './legacyContent';

function normalizeRoute(parts: string[]): string {
	return `/${parts.filter(Boolean).join('/')}/`;
}

export function routeForLegacyMarkdown(entry: CollectionEntry<'legacy'>): string {
	const parts = entry.id.split('/');
	const section = parts.shift() ?? '';
	let baseName = parts.pop() ?? '';
	const locale: LegacyLocale = baseName.endsWith('.en') ? 'en' : 'zh-CN';
	if (locale === 'en') baseName = baseName.slice(0, -3);
	const isIndex = baseName === '_index';
	const slug = !isIndex && entry.data.slug?.trim() ? entry.data.slug.trim() : baseName;
	return normalizeRoute([
		locale === 'en' ? 'en' : '',
		section,
		...parts,
		...(isIndex ? [] : [slug.toLocaleLowerCase('en-US')]),
	]);
}

export interface LegacyRouteProps {
	record: LegacyContentEntry;
	markdownId: string | null;
}

export async function legacyStaticPaths(locale: LegacyLocale) {
	const [records, markdownEntries] = await Promise.all([
		loadLegacyContent(),
		getCollection('legacy', ({ data }) => !data.draft),
	]);
	const markdownByRoute = new Map(
		markdownEntries.map((entry) => [routeForLegacyMarkdown(entry), entry.id]),
	);

	return records
		.filter((record) => record.locale === locale)
		.map((record) => {
			const segments = record.route.split('/').filter(Boolean);
			if (locale === 'en') segments.shift();
			const section = segments.shift() ?? record.section;
			return {
				params: {
					section,
					slug: segments.length > 0 ? segments.join('/') : undefined,
				},
				props: {
					record,
					markdownId: markdownByRoute.get(record.route) ?? null,
				} satisfies LegacyRouteProps,
			};
		});
}
