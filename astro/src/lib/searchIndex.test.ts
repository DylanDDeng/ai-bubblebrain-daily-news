import { describe, expect, it } from 'vitest';

import { buildKnowledgeSearchIndex } from './searchIndex';

describe('knowledge search index', () => {
	it('indexes durable knowledge content instead of daily reports', async () => {
		const index = await buildKnowledgeSearchIndex({ locale: 'zh-CN' });

		expect(index.schema_version).toBe(2);
		expect(index.item_count).toBeGreaterThan(0);
		expect(index.sections).toContain('highlights');
		expect(index.sections).toContain('codex-tutorials');
		expect(index.sections).toContain('workbuddy-tutorials');
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
					href: '/workbuddy-tutorials/workbuddy-beginner-guide/',
					section_label: 'WorkBuddy 教程',
				}),
				expect.objectContaining({
					href: '/workbuddy-tutorials/workbuddy-mobile-workflow-guide/',
					section_label: 'WorkBuddy 教程',
				}),
			]),
		);
		expect(index.items.every((item) => !item.href.startsWith('/daily/'))).toBe(true);
		expect(index.items.every((item) => item.section !== 'x-trending')).toBe(true);
		expect(index.items.every((item) => item.section !== 'ai-tools')).toBe(true);
		expect(index.items.every((item) => item.section !== 'my-publish')).toBe(true);
		expect(index.items.every((item) => item.section !== 'prompts')).toBe(true);
		expect(index.items.every((item) => item.search_text.length > 0)).toBe(true);
		expect(index.items.every((item) => item.section_label.length > 0)).toBe(true);
	});

	it('keeps locale-specific routes and deterministic ordering', async () => {
		const first = await buildKnowledgeSearchIndex({ locale: 'en' });
		const second = await buildKnowledgeSearchIndex({ locale: 'en' });

		expect(first).toEqual(second);
		expect(first.items.every((item) => item.href.startsWith('/en/'))).toBe(true);
		for (let index = 1; index < first.items.length; index += 1) {
			expect((first.items[index - 1].date ?? '') >= (first.items[index].date ?? '')).toBe(true);
		}
	});
});
