import type { LegacyContentEntry, LegacyLocale } from './legacyContent';
import { legacyChildren, loadLegacyContent } from './legacyContent';

export interface HighlightArchiveItem {
	id: string;
	title: string;
	description?: string;
	thumb?: string;
	tags?: string[];
	originalUrl?: string;
	detailUrl?: string;
	date?: string;
}

export interface HighlightMonthGroup {
	key: string;
	label: string;
	items: HighlightArchiveItem[];
}

export interface HighlightYear {
	year: string;
	count: number;
}

const EN_MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

export function highlightItemsFor(children: LegacyContentEntry[]): HighlightArchiveItem[] {
	return children
		.map((child) => {
			const kind = child.frontmatter.kind === 'article' ? 'article' : 'bookmark';
			return {
				id:
					typeof child.frontmatter.externalId === 'string'
						? child.frontmatter.externalId
						: child.id,
				title: child.title,
				description: child.description,
				thumb: typeof child.frontmatter.cover === 'string' ? child.frontmatter.cover : undefined,
				tags: Array.isArray(child.frontmatter.tags)
					? child.frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
					: [],
				originalUrl:
					typeof child.frontmatter.sourceUrl === 'string' ? child.frontmatter.sourceUrl : undefined,
				detailUrl: kind === 'article' ? child.route : undefined,
				date: child.date?.toISOString().slice(0, 10),
			};
		})
		.sort((left, right) => (right.date ?? '').localeCompare(left.date ?? ''));
}

export function highlightMonthLabel(key: string, locale: LegacyLocale): string {
	if (!key) return locale === 'en' ? 'Undated' : '未标日期';
	const [year, month] = key.split('-');
	return locale === 'en'
		? `${EN_MONTHS[Number(month) - 1]} ${year}`
		: `${year} 年 ${Number(month)} 月`;
}

export function highlightMonthGroups(
	items: HighlightArchiveItem[],
	locale: LegacyLocale,
): HighlightMonthGroup[] {
	return items.reduce<HighlightMonthGroup[]>((groups, item) => {
		const key = item.date?.slice(0, 7) ?? '';
		const group = groups.find((candidate) => candidate.key === key);
		if (group) group.items.push(item);
		else groups.push({ key, label: highlightMonthLabel(key, locale), items: [item] });
		return groups;
	}, []);
}

/** Years with dated entries, newest first. */
export function highlightYears(items: HighlightArchiveItem[]): HighlightYear[] {
	const counts = new Map<string, number>();
	for (const item of items) {
		const year = item.date?.slice(0, 4);
		if (year) counts.set(year, (counts.get(year) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([year, count]) => ({ year, count }))
		.sort((a, b) => b.year.localeCompare(a.year));
}

export async function highlightArchiveFor(locale: LegacyLocale) {
	const records = await loadLegacyContent();
	const index = records.find(
		(entry) => entry.section === 'highlights' && entry.isIndex && entry.locale === locale,
	);
	const items = index ? highlightItemsFor(legacyChildren(index, records)) : [];
	return { items, years: highlightYears(items) };
}
