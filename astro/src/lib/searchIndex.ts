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
	return {
		schema_version: 2,
		item_count: items.length,
		sections: [...new Set(items.map((item) => item.section))].sort(),
		items,
	};
}
