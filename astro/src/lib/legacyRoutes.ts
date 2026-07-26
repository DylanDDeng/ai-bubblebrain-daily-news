import { getCollection, type CollectionEntry } from 'astro:content';

import {
	legacyEntryIsRoutable,
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

export function routeForHighlightMarkdown(entry: CollectionEntry<'highlights'>): string {
	let baseName = entry.id;
	const locale: LegacyLocale = baseName.endsWith('.en') ? 'en' : 'zh-CN';
	if (locale === 'en') baseName = baseName.slice(0, -3);
	return normalizeRoute([
		locale === 'en' ? 'en' : '',
		'highlights',
		baseName.toLocaleLowerCase('en-US'),
	]);
}

export interface LegacyRouteProps {
	record: LegacyContentEntry;
	markdownId: string | null;
	markdownCollection: 'legacy' | 'highlights' | null;
}

export async function legacyStaticPaths(locale: LegacyLocale) {
	const [records, legacyEntries, highlightEntries] = await Promise.all([
		loadLegacyContent(),
		getCollection('legacy', ({ data }) => !data.draft),
		getCollection('highlights', ({ data }) => !data.draft && data.kind === 'article'),
	]);
	const markdownByRoute = new Map<string, { id: string; collection: 'legacy' | 'highlights' }>([
		...legacyEntries.map(
			(entry) =>
				[routeForLegacyMarkdown(entry), { id: entry.id, collection: 'legacy' as const }] as const,
		),
		...highlightEntries.map(
			(entry) =>
				[
					routeForHighlightMarkdown(entry),
					{ id: entry.id, collection: 'highlights' as const },
				] as const,
		),
	]);

	return records
		.filter((record) => record.locale === locale && legacyEntryIsRoutable(record))
		.map((record) => {
			const segments = record.route.split('/').filter(Boolean);
			if (locale === 'en') segments.shift();
			const section = segments.shift() ?? record.section;
			const markdown = markdownByRoute.get(record.route) ?? null;
			return {
				params: {
					section,
					slug: segments.length > 0 ? segments.join('/') : undefined,
				},
				props: {
					record,
					markdownId: markdown?.id ?? null,
					markdownCollection: markdown?.collection ?? null,
				} satisfies LegacyRouteProps,
			};
		});
}
