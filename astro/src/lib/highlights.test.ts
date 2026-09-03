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
	'/highlights/2026-08-21-what-is-reasoning/',
	'/en/highlights/2026-08-21-what-is-reasoning/',
	'/highlights/2026-08-25-ai-engineering-skills-map-building-deploying-ai-applications/',
	'/highlights/2026-08-25-build-a-long-running-agent-open-source-harness/',
	'/en/highlights/2026-08-25-build-a-long-running-agent-open-source-harness/',
	'/highlights/2026-08-27-what-it-takes-for-coding-agents-to-complete-large-software-tasks/',
	'/en/highlights/2026-08-27-what-it-takes-for-coding-agents-to-complete-large-software-tasks/',
	'/highlights/2026-09-02-prompting-claude-fable-5-1/',
	'/en/highlights/2026-09-02-prompting-claude-fable-5-1/',
	'/highlights/2026-09-02-the-anatomy-of-effective-commerce-agents/',
	'/en/highlights/2026-09-02-the-anatomy-of-effective-commerce-agents/',
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

		const chinese = records.find((entry) => entry.locale === 'zh-CN');
		expect(chinese?.body).not.toMatch(/\*\*[^*\n]+[。！？，；：]\*\*[^\s]/u);
	});

	it('keeps the What Is Reasoning article complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'what-is-reasoning',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(3);
			expect(entry.body).toContain('https://arxiv.org/html/2608.09867v1');
			expect(entry.body).toContain('<|channel|>analysis<|message|>');
			expect(entry.body).toContain('https://github.com/antirez/ds4');
			expect(entry.body).toContain('mitsuhiko/0904a3d89741e8e3bcca1ca93ea076de');
			expect(entry.body).toContain(
				'/media/highlights/what-is-reasoning/gpt-5.6-terra-spell-check.png',
			);
		}
	});

	it('keeps the AI Engineering Skills Map article complete and source-linked', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) =>
				entry.frontmatter.externalId ===
				'ai-engineering-skills-map-building-deploying-ai-applications',
		);

		expect(records).toHaveLength(1);
		expect(records[0]?.locale).toBe('zh-CN');
		expect(records[0]?.body.match(/^## /gm)).toHaveLength(8);
		expect(records[0]?.body).toContain('https://x.com/AndrewYNg/status/2090840747738374568');
		expect(records[0]?.body).toContain('LLM-as-a-judge');
		expect(records[0]?.body).toContain('Computer Use Agent');
	});

	it('keeps the long-running Agent Harness article complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) =>
				entry.frontmatter.externalId === 'build-a-long-running-agent-open-source-harness',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(11);
			expect(entry.body.match(/https:\/\/pbs\.twimg\.com\/media\//g)).toHaveLength(4);
			expect(entry.body).toContain('npx @truefoundry/trueforge');
			expect(entry.body).toContain('https://github.com/truefoundry/trueforge');
			expect(entry.body).toContain(
				'https://github.com/Sumanth077/Hands-On-AI-Engineering/tree/main/ai_agents/trueforge_web_research_briefer',
			);
		}
	});

	it('keeps the Coding Agent completion study complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) =>
				entry.frontmatter.externalId ===
				'what-it-takes-for-coding-agents-to-complete-large-software-tasks',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(11);
			expect(entry.body.match(/https:\/\/pbs\.twimg\.com\/media\//g)).toHaveLength(9);
			expect(entry.body).toContain('https://github.com/Factory-AI/pb-gdal-fable');
			expect(entry.body).toContain('https://programbench.com/');
			expect(entry.body).toContain('115,000');
			expect(entry.body).toMatch(/90(?:%| percent)/);
			expect(entry.body).toContain('pb-1.2.0');
		}
	});

	it('keeps the Claude Fable 5.1 prompting guide complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'prompting-claude-fable-5-1',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(18);
			expect(entry.body).toContain('thinking-display-updates-2026-08-18');
			expect(entry.body).toContain('mid-conversation-system-clear-at-2026-08-21');
			expect(entry.body).toContain('prefix_mismatch_behavior');
			expect(entry.body).toContain('First privately list what you need next');
			expect(entry.body).toContain('Please remove all mannered prose.');
			expect(entry.body).toContain('The number of tokens used to edit files');
		}

		const chinese = records.find((entry) => entry.locale === 'zh-CN');
		expect(chinese?.body).toContain(
			'[Anthropic 官方文档](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1)',
		);
		expect(chinese?.body).not.toContain('[English version]');
		expect(chinese?.body).not.toContain('不是');
		expect(chinese?.body).not.toContain('而是');
	});

	it('keeps the commerce agents guide complete in both languages', async () => {
		const records = highlightRecords(await loadLegacyContent()).filter(
			(entry) => entry.frontmatter.externalId === 'the-anatomy-of-effective-commerce-agents',
		);

		expect(records).toHaveLength(2);
		for (const entry of records) {
			expect(entry.body.match(/^## /gm)).toHaveLength(12);
			expect(
				entry.body.match(/https:\/\/claude\.com\/blog\/the-anatomy-of-effective-commerce-agents/g),
			).toHaveLength(1);
			expect(entry.body).toMatch(/90%?[–-]99%/);
			expect(entry.body).toContain('13%');
			expect(entry.body).toContain('50–100');
			expect(entry.body).toContain('eager_input_streaming');
			expect(entry.body).toContain('anthropics/commerce-agents');
			expect(entry.body).toContain('Matthew Koen');
			expect(entry.body).toContain('Ali Shazal');
		}

		const chinese = records.find((entry) => entry.locale === 'zh-CN');
		expect(chinese?.body).toContain(
			'[Anthropic 官方原文](https://claude.com/blog/the-anatomy-of-effective-commerce-agents)',
		);
		expect(chinese?.body).not.toMatch(/不是|而是|并非|而非|不像|不仅/u);
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
