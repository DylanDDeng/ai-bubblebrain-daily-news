import { describe, expect, it } from 'vitest';

import { legacyEntryIsRoutable, loadLegacyContent, type LegacyContentEntry } from './legacyContent';

const expectedArticleRoutes = [
	'/highlights/2025-11-10-best-practices-prompt-engineering/',
	'/highlights/2025-11-14-gpt-5.1-prompt-guide/',
	'/highlights/2025-11-15-claude-skills-explained/',
	'/highlights/2025-11-15-vibe-coding/',
	'/highlights/2025-11-16-claude-skills-example/',
	'/highlights/2025-11-18-how-three-startups-use-claudecode/',
	'/highlights/2026-07-15-lets-build-claude-code-harness-step-by-step/',
	'/en/highlights/2026-07-15-lets-build-claude-code-harness-step-by-step/',
	'/highlights/2026-07-24-why-software-factories-fail/',
	'/en/highlights/2026-07-24-why-software-factories-fail/',
	'/highlights/2026-07-25-claude-design/',
	'/en/highlights/2026-07-25-claude-design/',
	'/highlights/2026-07-26-cloud-rendering/',
	'/en/highlights/2026-07-26-cloud-rendering/',
	'/highlights/2026-07-27-prompt-caching-in-agents/',
	'/en/highlights/2026-07-27-prompt-caching-in-agents/',
	'/highlights/2026-07-28-why-software-factories-fail-benchmarking-new-frontier/',
	'/en/highlights/2026-07-28-why-software-factories-fail-benchmarking-new-frontier/',
	'/highlights/2026-07-28-we-rewrote-our-agent-durable-object-pi-agents-sdk-code-mode/',
	'/en/highlights/2026-07-28-we-rewrote-our-agent-durable-object-pi-agents-sdk-code-mode/',
	'/highlights/2026-07-29-templates-variables/',
	'/en/highlights/2026-07-29-templates-variables/',
	'/highlights/2026-07-30-the-session-you-cannot-take-with-you/',
	'/en/highlights/2026-07-30-the-session-you-cannot-take-with-you/',
	'/highlights/2026-07-30-ai-basics-cli-harness-skills-html-github/',
	'/en/highlights/2026-07-30-ai-basics-cli-harness-skills-html-github/',
	'/highlights/2026-08-09-minimax-h3-ama/',
	'/en/highlights/2026-08-09-minimax-h3-ama/',
	'/highlights/2026-08-10-inside-the-harness-pi/',
	'/en/highlights/2026-08-10-inside-the-harness-pi/',
	'/highlights/2026-08-07-how-to-keep-thinking/',
	'/en/highlights/2026-08-07-how-to-keep-thinking/',
	'/highlights/2026-08-11-compression-is-prediction/',
	'/highlights/2026-08-20-hot-take-llm-can-jump/',
	'/en/highlights/2026-08-20-hot-take-llm-can-jump/',
];

function highlightRecords(entries: LegacyContentEntry[]) {
	return entries.filter((entry) => entry.section === 'highlights' && !entry.isIndex);
}

describe('unified highlights content', () => {
	it('keeps the Compression is prediction interpretation grounded and linked', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'compression-is-prediction',
		);

		expect(records).toHaveLength(1);
		expect(records[0]?.locale).toBe('zh-CN');
		expect(records[0]?.body.match(/^## /gm)).toHaveLength(7);
		expect(records[0]?.body.match(/https:\/\/ngrok\.com\/blog\/compression-is-prediction/g)).toHaveLength(2);
		expect(records[0]?.body).toContain('0.3876953125');
		expect(records[0]?.body).toContain('GPT-2');
		expect(records[0]?.body).toContain('https://arxiv.org/abs/2309.10668');
	});

	it('keeps the How to keep thinking article complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'how-to-keep-thinking',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(3);
			expect(entry.body).toContain('https://www.youtube.com/watch?v=f84n5oFoZBc');
			expect(entry.body).toContain('[^3]');
		}
	});

	it('keeps the Inside the Harness article complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'inside-the-harness-pi',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(7);
			expect(entry.body).toContain('25,635');
			expect(entry.body).toContain('pi-extensions');
			expect(entry.body).toContain('bosun');
		}
	});

	it('keeps the AI basics article bilingual with all source media', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'ai-basics-cli-harness-skills-html-github',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(
				entry.body.match(/\/media\/highlights\/ai-basics-cli-harness-skills-html-github\//g),
			).toHaveLength(12);
			expect(entry.body).toContain('npx skills add heygen-com/hyperframes --full-depth');
		}
	});

	it('keeps the LLM can jump argument complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'hot-take-llm-can-jump',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(6);
			expect(entry.body).toContain('https://arxiv.org/pdf/2111.00333');
			expect(entry.body).toContain('https://aclanthology.org/2025.emnlp-main.490/');
			expect(entry.body).toContain('Machine Studying');
		}
	});

	it('preserves every migrated Chinese and English record in Markdown', async () => {
		const records = highlightRecords(await loadLegacyContent());
		const chinese = records.filter((entry) => entry.locale === 'zh-CN');
		const english = records.filter((entry) => entry.locale === 'en');

		expect(chinese.length).toBeGreaterThanOrEqual(35);
		expect(english.length).toBeGreaterThanOrEqual(24);

		const identities = records.map(
			(entry) => `${entry.locale}:${String(entry.frontmatter.externalId)}`,
		);
		expect(new Set(identities).size).toBe(identities.length);

		for (const entry of records) {
			expect(['article', 'bookmark']).toContain(entry.frontmatter.kind);
			expect(entry.title).not.toBe('');
			expect(entry.frontmatter.sourceUrl).toMatch(/^https:\/\//);
			expect(entry.frontmatter.tags).toBeInstanceOf(Array);
		}
	});

	it('keeps article URLs routable and bookmark-only records out of the site manifest', async () => {
		const records = highlightRecords(await loadLegacyContent());
		const routableRoutes = new Set(
			records.filter(legacyEntryIsRoutable).map((entry) => entry.route),
		);

		for (const route of expectedArticleRoutes) expect(routableRoutes).toContain(route);
		for (const entry of records.filter((candidate) => candidate.frontmatter.kind === 'bookmark')) {
			expect(legacyEntryIsRoutable(entry)).toBe(false);
		}
	});

	it('retains full Markdown bodies for every local article', async () => {
		const articles = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.kind === 'article',
		);

		expect(articles.length).toBeGreaterThanOrEqual(expectedArticleRoutes.length);
		for (const article of articles) expect(article.body.trim()).not.toBe('');
	});
});
