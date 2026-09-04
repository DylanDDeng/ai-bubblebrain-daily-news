import { describe, expect, it } from 'vitest';

import { designBrands } from '../data/designBrands';
import { vibeCodingSkillMeta } from '../data/vibeCodingSkills';
import { getVibeCodingConcepts } from '../data/vibeCodingTerms';
import { highlightArchiveFor } from './highlightsArchive';
import { buildKnowledgeSearchIndex, knowledgeReadingCount } from './searchIndex';

describe('knowledge search index', () => {
	it('indexes durable knowledge content instead of daily reports', async () => {
		const index = await buildKnowledgeSearchIndex({ locale: 'zh-CN' });

		expect(index.schema_version).toBe(3);
		expect(index.item_count).toBeGreaterThan(0);
		expect(index.sections).toContain('highlights');
		expect(index.sections).toContain('codex-tutorials');
		expect(index.sections).toContain('pi-agent-tutorials');
		expect(index.sections).toContain('newbie-tutorials');
		expect(index.sections).toContain('workbuddy-tutorials');
		expect(index.sections).toContain('vibe-coding-terms');
		expect(index.sections).toContain('vibe-coding-skills');
		expect(index.sections).toContain('vibe-coding-design');
		expect(index.sections).toContain('about');
		expect(index.sections).toContain('x-trending');
		expect(index.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					href: '/codex-tutorials/codex-app-beginner-guide/',
					section_label: 'Codex 教程',
				}),
				expect.objectContaining({
					href: '/codex-tutorials/codex-mobile-chatgpt-guide/',
					section_label: 'Codex 教程',
				}),
				expect.objectContaining({
					href: '/codex-tutorials/codex-app-practical-tips/',
					section_label: 'Codex 教程',
				}),
				expect.objectContaining({
					href: '/newbie-tutorials/why-llms-hallucinate/',
					section_label: '新手村',
				}),
				expect.objectContaining({
					href: '/pi-agent-tutorials/pi-agent-overview/',
					section_label: 'Pi Agent 教程',
				}),
				expect.objectContaining({
					href: '/pi-agent-tutorials/pi-agent-tool-system/',
					section_label: 'Pi Agent 教程',
				}),
				expect.objectContaining({
					href: '/workbuddy-tutorials/workbuddy-beginner-guide/',
					section_label: 'WorkBuddy 教程',
				}),
				expect.objectContaining({
					href: '/workbuddy-tutorials/workbuddy-mobile-workflow-guide/',
					section_label: 'WorkBuddy 教程',
				}),
				expect.objectContaining({
					href: '/workbuddy-tutorials/workbuddy-advanced-workflow-guide/',
					section_label: 'WorkBuddy 教程',
				}),
				expect.objectContaining({
					href: '/workbuddy-tutorials/workbuddy-hunyuan3-workflow-guide/',
					section_label: 'WorkBuddy 教程',
				}),
				expect.objectContaining({
					href: '/vibe-coding/terms/token/',
					section_label: 'Vibe Coding 术语',
				}),
				expect.objectContaining({
					href: '/vibe-coding/skills/improve-ui/',
					section_label: 'Vibe Coding Skills',
				}),
				expect.objectContaining({
					href: '/vibe-coding/design/linear/',
					section_label: 'Vibe Coding Design',
				}),
			]),
		);
		expect(index.items.filter((item) => item.section === 'vibe-coding-terms')).toHaveLength(
			getVibeCodingConcepts().length,
		);
		expect(index.items.filter((item) => item.section === 'vibe-coding-skills')).toHaveLength(
			Object.keys(vibeCodingSkillMeta).length,
		);
		expect(index.items.filter((item) => item.section === 'vibe-coding-design')).toHaveLength(
			designBrands.length,
		);
		expect(index.items.every((item) => !item.href.startsWith('/daily/'))).toBe(true);
		expect(index.items.every((item) => !item.href.startsWith('/changelog/'))).toBe(true);
		expect(index.items.every((item) => item.section !== 'ai-tools')).toBe(true);
		expect(index.items.every((item) => item.section !== 'curations')).toBe(true);
		expect(index.items.every((item) => item.section !== 'model-evals')).toBe(true);
		expect(index.items.every((item) => item.section !== 'my-publish')).toBe(true);
		expect(index.items.every((item) => item.section !== 'prompts')).toBe(true);
		expect(index.items.every((item) => item.section !== 'deepseek-harness-tutorials')).toBe(true);
		expect(index.items.every((item) => item.search_text.length > 0)).toBe(true);
		expect(index.items.every((item) => item.section_label.length > 0)).toBe(true);
	});

	it('keeps locale-specific routes and deterministic ordering', async () => {
		const first = await buildKnowledgeSearchIndex({ locale: 'en' });
		const second = await buildKnowledgeSearchIndex({ locale: 'en' });

		expect(first).toEqual(second);
		expect(first.items.every((item) => item.external || item.href.startsWith('/en/'))).toBe(true);
		for (let index = 1; index < first.items.length; index += 1) {
			expect((first.items[index - 1].date ?? '') >= (first.items[index].date ?? '')).toBe(true);
		}
	});

	it('indexes external Highlight picks and keeps the homepage reading total scoped', async () => {
		const index = await buildKnowledgeSearchIndex({ locale: 'zh-CN' });
		const { items: highlights } = await highlightArchiveFor('zh-CN');
		const searchableHighlights = index.items.filter((item) => item.section === 'highlights');
		const tutorialItems = index.items.filter((item) => item.section.endsWith('-tutorials'));

		expect(searchableHighlights).toHaveLength(highlights.length);
		expect(searchableHighlights.some((item) => item.external)).toBe(true);
		expect(knowledgeReadingCount(index)).toBe(tutorialItems.length + highlights.length);
	});
});
