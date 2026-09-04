import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLegacyContent } from './legacyContent';

const chapters = [
	{
		route: '/newbie-tutorials/why-llms-hallucinate/',
		weight: 1,
		visuals: [
			'hallucination-next-token.svg',
			'hallucination-memory-vs-database.svg',
			'hallucination-risk-map.svg',
		],
		labs: ['next-token', 'exam', 'risk'],
		phrases: ['猜下一个词', 'https://arxiv.org/abs/2509.04664'],
	},
	{
		route: '/newbie-tutorials/how-llms-are-trained/',
		weight: 4,
		visuals: ['train-loop.svg', 'train-rlhf.svg', 'train-pipeline.svg'],
		labs: ['fill', 'basevs', 'rank'],
		phrases: [
			'Pretraining',
			'SFT',
			'RLHF',
			'奖励模型',
			'填空题',
			'/newbie-tutorials/why-llms-hallucinate/',
		],
	},
	{
		route: '/newbie-tutorials/why-ai-forgets/',
		weight: 3,
		visuals: ['ctx-desk.svg', 'ctx-lost-middle.svg', 'ctx-compaction.svg'],
		labs: ['desk', 'compact', 'risk'],
		phrases: [
			'上下文窗口',
			'/vibe-coding/terms/context-window/',
			'/newbie-tutorials/why-llms-hallucinate/',
		],
	},
	{
		route: '/newbie-tutorials/what-is-a-knowledge-base/',
		weight: 2,
		visuals: ['kb-pipeline.svg', 'kb-chunks-and-embeddings.svg', 'kb-failure-points.svg'],
		labs: ['retrieve', 'search', 'risk'],
		phrases: ['RAG', '/newbie-tutorials/why-llms-hallucinate/', '/vibe-coding/terms/rag/'],
	},
];

describe('Newbie Village tutorial series', () => {
	it('publishes an index and every chapter in weight order', async () => {
		const entries = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'newbie-tutorials',
		);
		const articles = entries.filter((entry) => !entry.isIndex);

		expect(entries.some((entry) => entry.route === '/newbie-tutorials/')).toBe(true);
		expect(articles).toHaveLength(chapters.length);
		expect(articles.every((entry) => entry.locale === 'zh-CN')).toBe(true);
		for (const chapter of chapters) {
			const article = articles.find((entry) => entry.route === chapter.route);
			expect(article?.frontmatter.weight).toBe(chapter.weight);
		}
	});

	it('keeps every chapter substantial, cross-linked and beginner-facing', async () => {
		const all = await loadLegacyContent();
		for (const chapter of chapters) {
			const article = all.find((entry) => entry.route === chapter.route);
			expect(article?.body).toContain('## ');
			expect(article?.body.length).toBeGreaterThan(3_000);
			for (const phrase of chapter.phrases) expect(article?.body).toContain(phrase);
		}
	});

	it('ships every diagram and hands-on lab each chapter references', async () => {
		const all = await loadLegacyContent();
		for (const chapter of chapters) {
			const body = all.find((entry) => entry.route === chapter.route)?.body ?? '';
			for (const visual of chapter.visuals) {
				expect(body).toContain(`/media/newbie-tutorials/${visual}`);
				await expect(
					access(resolve(process.cwd(), `../static/media/newbie-tutorials/${visual}`)),
				).resolves.toBeUndefined();
			}
			for (const lab of chapter.labs) expect(body).toContain(`data-nb-lab="${lab}"`);
		}
	});
});
