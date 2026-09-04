import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import matter from 'gray-matter';

import { designBrands } from '../data/designBrands';
import {
	vibeCodingSkillCategories,
	vibeCodingSkillMeta,
} from '../data/vibeCodingSkills';
import { getVibeCodingConcepts } from '../data/vibeCodingTerms';
import {
	legacyEntryIsRoutable,
	loadLegacyContent,
	type LegacyLocale,
	type LegacySection,
} from './legacyContent';

export type KnowledgeSearchSection =
	| LegacySection
	| 'vibe-coding-terms'
	| 'vibe-coding-skills'
	| 'vibe-coding-design';

export interface KnowledgeSearchItem {
	key: string;
	href: string;
	title: string;
	summary: string;
	section: KnowledgeSearchSection;
	section_label: string;
	date: string | null;
	tags: string[];
	external: boolean;
	search_text: string;
}

export interface KnowledgeSearchIndex {
	schema_version: 3;
	item_count: number;
	sections: KnowledgeSearchSection[];
	items: KnowledgeSearchItem[];
}

const READING_SECTIONS = new Set<KnowledgeSearchSection>([
	'codex-tutorials',
	'pi-agent-tutorials',
	'newbie-tutorials',
	'workbuddy-tutorials',
	'highlights',
]);

/** Count the visible reading archive without the non-article knowledge libraries. */
export function knowledgeReadingCount(index: KnowledgeSearchIndex): number {
	return index.items.filter((item) => READING_SECTIONS.has(item.section)).length;
}

const sectionLabels: Record<LegacyLocale, Record<LegacySection, string>> = {
	'zh-CN': {
		about: '关于',
		'ai-tools': 'AI 工具',
		'codex-tutorials': 'Codex 教程',
		'deepseek-harness-tutorials': 'DeepSeek Harness 教程',
		'pi-agent-tutorials': 'Pi Agent 教程',
		'newbie-tutorials': '新手村',
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
		'deepseek-harness-tutorials': 'DeepSeek Harness tutorials',
		'pi-agent-tutorials': 'Pi Agent tutorials',
		'newbie-tutorials': 'Newbie Village',
		'workbuddy-tutorials': 'WorkBuddy tutorials',
		curations: 'Research notes',
		highlights: 'Highlights',
		'model-evals': 'Model reviews',
		'my-publish': 'My writing',
		prompts: 'Prompt library',
		'x-trending': 'X trending',
	},
};

const knowledgeSectionLabels: Record<
	LegacyLocale,
	Record<'vibe-coding-terms' | 'vibe-coding-skills' | 'vibe-coding-design', string>
> = {
	'zh-CN': {
		'vibe-coding-terms': 'Vibe Coding 术语',
		'vibe-coding-skills': 'Vibe Coding Skills',
		'vibe-coding-design': 'Vibe Coding Design',
	},
	en: {
		'vibe-coding-terms': 'Vibe Coding terms',
		'vibe-coding-skills': 'Vibe Coding Skills',
		'vibe-coding-design': 'Vibe Coding Design',
	},
};

const sectionOrder: KnowledgeSearchSection[] = [
	'newbie-tutorials',
	'codex-tutorials',
	'pi-agent-tutorials',
	'workbuddy-tutorials',
	'highlights',
	'vibe-coding-terms',
	'vibe-coding-skills',
	'vibe-coding-design',
	'about',
	'x-trending',
];

const searchableLegacySections = new Set<LegacySection>([
	'about',
	'codex-tutorials',
	'pi-agent-tutorials',
	'newbie-tutorials',
	'workbuddy-tutorials',
	'highlights',
	'x-trending',
]);

const skillsRoot = resolve(process.cwd(), '../content/skills');

function stringTags(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
		: [];
}

function normalizedSearchText(locale: LegacyLocale, values: unknown[]): string {
	return values
		.flatMap((value) => (Array.isArray(value) ? value : [value]))
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.join(' ')
		.normalize('NFKC')
		.toLocaleLowerCase(locale);
}

function searchableLegacyEntry(
	entry: Awaited<ReturnType<typeof loadLegacyContent>>[number],
	locale: LegacyLocale,
): boolean {
	if (entry.locale !== locale || !searchableLegacySections.has(entry.section)) return false;
	if (entry.isIndex) return entry.section === 'about' || entry.section === 'x-trending';
	if (entry.section === 'highlights') {
		return (
			legacyEntryIsRoutable(entry) ||
			(entry.frontmatter.kind === 'bookmark' && typeof entry.frontmatter.sourceUrl === 'string')
		);
	}
	return legacyEntryIsRoutable(entry);
}

async function buildSkillItems(locale: LegacyLocale): Promise<KnowledgeSearchItem[]> {
	if (locale !== 'zh-CN') return [];
	const categoryLabels = new Map(
		vibeCodingSkillCategories.map((category) => [category.id, category.label]),
	);
	const files = (await readdir(skillsRoot)).filter((file) => extname(file) === '.md').sort();
	return Promise.all(
		files.map(async (file): Promise<KnowledgeSearchItem> => {
			const id = basename(file, '.md');
			const parsed = matter(await readFile(resolve(skillsRoot, file), 'utf8'));
			const name = typeof parsed.data.name === 'string' ? parsed.data.name : id;
			const author = typeof parsed.data.author === 'string' ? parsed.data.author : '';
			const category =
				typeof parsed.data.category === 'string' ? parsed.data.category : 'uncategorized';
			const categoryLabel = categoryLabels.get(category) ?? category;
			const meta = vibeCodingSkillMeta[id];
			const title = meta ? `${meta.chineseName}（${name}）` : name;
			const section = 'vibe-coding-skills' as const;
			const sectionLabel = knowledgeSectionLabels[locale][section];
			const tags = ['Agent Skill', categoryLabel, author].filter(Boolean);
			return {
				key: `/vibe-coding/skills/${id}/`,
				href: `/vibe-coding/skills/${id}/`,
				title,
				summary: meta?.description ?? '',
				section,
				section_label: sectionLabel,
				date: null,
				tags,
				external: false,
				search_text: normalizedSearchText(locale, [
					title,
					name,
					meta?.description,
					sectionLabel,
					categoryLabel,
					author,
				]),
			};
		}),
	);
}

function buildVibeCodingItems(locale: LegacyLocale): KnowledgeSearchItem[] {
	if (locale !== 'zh-CN') return [];
	const termSection = 'vibe-coding-terms' as const;
	const termSectionLabel = knowledgeSectionLabels[locale][termSection];
	const terms = getVibeCodingConcepts().map((concept): KnowledgeSearchItem => {
		const title =
			concept.name === concept.chineseName
				? concept.chineseName
				: `${concept.chineseName}（${concept.name}）`;
		const tags = [concept.categoryLabel, concept.group].filter(
			(value): value is string => Boolean(value),
		);
		return {
			key: `/vibe-coding/terms/${concept.id}/`,
			href: `/vibe-coding/terms/${concept.id}/`,
			title,
			summary: concept.description,
			section: termSection,
			section_label: termSectionLabel,
			date: null,
			tags,
			external: false,
			search_text: normalizedSearchText(locale, [
				title,
				concept.name,
				concept.chineseName,
				concept.description,
				concept.categoryLabel,
				concept.group,
				termSectionLabel,
			]),
		};
	});

	const designSection = 'vibe-coding-design' as const;
	const designSectionLabel = knowledgeSectionLabels[locale][designSection];
	const designs = designBrands.map((brand): KnowledgeSearchItem => {
		const title = `${brand.name} 的设计语言`;
		const tags = [brand.category, 'DESIGN.md', '设计系统'];
		return {
			key: `/vibe-coding/design/${brand.id}/`,
			href: `/vibe-coding/design/${brand.id}/`,
			title,
			summary: brand.tagline,
			section: designSection,
			section_label: designSectionLabel,
			date: null,
			tags,
			external: false,
			search_text: normalizedSearchText(locale, [
				title,
				brand.heroTitle,
				brand.tagline,
				brand.lede,
				brand.philosophy,
				brand.dos,
				brand.donts,
				brand.colors.flatMap((color) => [color.name, color.hex, color.role]),
				designSectionLabel,
				tags,
			]),
		};
	});
	return [...terms, ...designs];
}

export async function buildKnowledgeSearchIndex(
	options: { locale?: LegacyLocale } = {},
): Promise<KnowledgeSearchIndex> {
	const locale = options.locale ?? 'zh-CN';
	const legacyEntries = await loadLegacyContent();
	const legacyItems = legacyEntries
		.filter((entry) => searchableLegacyEntry(entry, locale))
		.map((entry): KnowledgeSearchItem => {
			const tags = stringTags(entry.frontmatter.tags);
			const sectionLabel = sectionLabels[locale][entry.section];
			const sourceUrl =
				typeof entry.frontmatter.sourceUrl === 'string' ? entry.frontmatter.sourceUrl : null;
			const external = entry.section === 'highlights' && entry.frontmatter.kind === 'bookmark';
			return {
				key: entry.route,
				href: external && sourceUrl ? sourceUrl : entry.route,
				title: entry.title,
				summary: entry.description,
				section: entry.section,
				section_label: sectionLabel,
				date: entry.date?.toISOString().slice(0, 10) ?? null,
				tags,
				external,
				search_text: normalizedSearchText(locale, [
					entry.title,
					entry.description,
					sectionLabel,
					tags,
				]),
			};
		});
	const items = [...legacyItems, ...buildVibeCodingItems(locale), ...(await buildSkillItems(locale))]
		.sort((left, right) => {
			const dateOrder = (right.date ?? '').localeCompare(left.date ?? '');
			return dateOrder || left.title.localeCompare(right.title, locale);
		});
	const includedSections = new Set(items.map((item) => item.section));
	return {
		schema_version: 3,
		item_count: items.length,
		sections: sectionOrder.filter((section) => includedSections.has(section)),
		items,
	};
}
