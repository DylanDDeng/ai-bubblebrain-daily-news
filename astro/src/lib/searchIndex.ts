import {
	legacyEntryIsRoutable,
	loadLegacyContent,
	type LegacyLocale,
	type LegacySection,
} from './legacyContent';

export interface KnowledgeSearchItem {
	key: string;
	href: string;
	title: string;
	summary: string;
	section: LegacySection;
	section_label: string;
	date: string | null;
	tags: string[];
	search_text: string;
}

export interface KnowledgeSearchIndex {
	schema_version: 2;
	item_count: number;
	sections: LegacySection[];
	items: KnowledgeSearchItem[];
}

const sectionLabels: Record<LegacyLocale, Record<LegacySection, string>> = {
	'zh-CN': {
		about: '关于',
		'ai-tools': 'AI 工具',
		'codex-tutorials': 'Codex 教程',
		'workbuddy-tutorials': 'WorkBuddy 教程',
		curations: '研究笔记',
		highlights: '精选阅读',
		'model-evals': '模型评测',
		'my-publish': '我的文章',
		prompts: 'Prompt 库',
		'x-trending': 'X 热门内容',
	},
	en: {
		about: 'About',
		'ai-tools': 'AI tools',
		'codex-tutorials': 'Codex tutorials',
		'workbuddy-tutorials': 'WorkBuddy tutorials',
		curations: 'Research notes',
		highlights: 'Highlights',
		'model-evals': 'Model reviews',
		'my-publish': 'My writing',
		prompts: 'Prompt library',
		'x-trending': 'X trending',
	},
};

function stringTags(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
		: [];
}

interface DirectoryRecord {
	id: string;
	title?: string;
	name?: string;
	description?: string;
	company?: string;
	domain?: string;
	releaseDate?: string;
	date?: string;
	tags?: string[];
	detailUrl?: string;
}

function sortableDate(value: string | undefined): string | null {
	if (!value) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
	return null;
}

export async function buildKnowledgeSearchIndex(
	options: { locale?: LegacyLocale } = {},
): Promise<KnowledgeSearchIndex> {
	const locale = options.locale ?? 'zh-CN';
	const legacyEntries = await loadLegacyContent();
	const items = legacyEntries
		.filter(
			(entry) =>
				entry.locale === locale &&
				!entry.isIndex &&
				entry.section !== 'about' &&
				entry.section !== 'x-trending' &&
				legacyEntryIsRoutable(entry),
		)
		.map((entry): KnowledgeSearchItem => {
			const tags = stringTags(entry.frontmatter.tags);
			const sectionLabel = sectionLabels[locale][entry.section];
			return {
				key: entry.route,
				href: entry.route,
				title: entry.title,
				summary: entry.description,
				section: entry.section,
				section_label: sectionLabel,
				date: entry.date?.toISOString().slice(0, 10) ?? null,
				tags,
				search_text: [entry.title, entry.description, sectionLabel, ...tags]
					.join(' ')
					.normalize('NFKC')
					.toLocaleLowerCase(locale),
			};
		})
		.sort((left, right) => {
			const dateOrder = (right.date ?? '').localeCompare(left.date ?? '');
			return dateOrder || left.title.localeCompare(right.title, locale);
		});
	const knownRoutes = new Set(
		legacyEntries.filter(legacyEntryIsRoutable).map((entry) => entry.route),
	);
	const staticRoot = resolve(process.cwd(), '../static', locale === 'en' ? 'en' : '');
	for (const section of ['curations', 'model-evals'] as const) {
		const records = JSON.parse(
			await readFile(resolve(staticRoot, `${section}.json`), 'utf8'),
		) as DirectoryRecord[];
		for (const record of records) {
			if (record.detailUrl && knownRoutes.has(record.detailUrl)) continue;
			const title = record.title ?? record.name ?? record.id;
			const tags = stringTags(record.tags);
			const sectionLabel = sectionLabels[locale][section];
			const summary =
				record.description ?? [record.company, record.domain].filter(Boolean).join(' · ');
			items.push({
				key: `${section}:${record.id}`,
				href: `${locale === 'en' ? '/en' : ''}/${section}/`,
				title,
				summary,
				section,
				section_label: sectionLabel,
				date: sortableDate(record.date ?? record.releaseDate),
				tags,
				search_text: [title, summary, record.company, record.domain, sectionLabel, ...tags]
					.filter(Boolean)
					.join(' ')
					.normalize('NFKC')
					.toLocaleLowerCase(locale),
			});
		}
	}
	items.sort((left, right) => {
		const dateOrder = (right.date ?? '').localeCompare(left.date ?? '');
		return dateOrder || left.title.localeCompare(right.title, locale);
	});

	return {
		schema_version: 2,
		item_count: items.length,
		sections: [...new Set(items.map((item) => item.section))].sort(),
		items,
	};
}
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
