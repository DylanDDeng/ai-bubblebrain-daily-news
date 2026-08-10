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
	'/highlights/2026-08-09-minimax-h3-ama/',
	'/en/highlights/2026-08-09-minimax-h3-ama/',
];

function highlightRecords(entries: LegacyContentEntry[]) {
	return entries.filter((entry) => entry.section === 'highlights' && !entry.isIndex);
}

describe('unified highlights content', () => {
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
