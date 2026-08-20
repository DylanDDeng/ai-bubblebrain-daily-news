import { describe, expect, it } from 'vitest';

import { loadLegacyContent } from './legacyContent';

const expectedRoutes = [
	'/deepseek-harness-tutorials/deepseek-harness-overview/',
	'/deepseek-harness-tutorials/deepseek-harness-getting-started/',
	'/deepseek-harness-tutorials/deepseek-harness-model-configuration/',
	'/deepseek-harness-tutorials/deepseek-harness-cli-headless/',
	'/deepseek-harness-tutorials/deepseek-harness-python-sdk/',
	'/deepseek-harness-tutorials/deepseek-harness-first-plugin/',
	'/deepseek-harness-tutorials/deepseek-harness-cc-tui-guide/',
	'/deepseek-harness-tutorials/deepseek-harness-agent-model-harness/',
	'/deepseek-harness-tutorials/deepseek-harness-better-sidebar-guide/',
];

describe('DeepSeek Harness tutorial series', () => {
	it('publishes a multi-article Chinese tutorial section', async () => {
		const entries = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'deepseek-harness-tutorials',
		);
		const articles = entries.filter((entry) => !entry.isIndex);

		expect(entries.some((entry) => entry.route === '/deepseek-harness-tutorials/')).toBe(true);
		expect(articles).toHaveLength(expectedRoutes.length);
		expect(articles.map((entry) => entry.route)).toEqual(expect.arrayContaining(expectedRoutes));
		expect(articles.every((entry) => entry.locale === 'zh-CN')).toBe(true);
	});

	it('keeps source attribution and useful tutorial structure', async () => {
		const articles = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'deepseek-harness-tutorials' && !entry.isIndex,
		);

		for (const entry of articles) {
			expect(entry.frontmatter.sourceUrl).toMatch(
				/^https:\/\/github\.com\/(deepseek-ai\/deepseek-harness|ccch1mneyyy\/dsh-TUI|omdsh-dev\/DSH-better-sidebar)$/,
			);
			expect(entry.body).toContain('## ');
			expect(entry.body.length).toBeGreaterThan(1_000);
		}
	});

	it('includes the illustrated cc-tui profile guide', async () => {
		const entry = (await loadLegacyContent()).find(
			(item) => item.route === '/deepseek-harness-tutorials/deepseek-harness-cc-tui-guide/',
		);

		expect(entry?.frontmatter.sourceUrl).toBe('https://github.com/ccch1mneyyy/dsh-TUI');
		expect(entry?.body).toContain('dsh --profile cc-tui');
		expect(entry?.body).toContain('/media/deepseek-harness-tutorials/cc-tui/splash.png');
		expect(entry?.body).toContain('/media/deepseek-harness-tutorials/cc-tui/working-line.png');
	});

	it('includes the illustrated Model and Harness Agent guide', async () => {
		const entry = (await loadLegacyContent()).find(
			(item) => item.route === '/deepseek-harness-tutorials/deepseek-harness-agent-model-harness/',
		);

		expect(entry?.body).toContain('Agent = Model + Harness');
		expect(entry?.body).toContain(
			'/media/deepseek-harness-tutorials/agent/model-harness-agent.svg',
		);
		expect(entry?.body).toContain('/media/deepseek-harness-tutorials/agent/agent-loop.svg');
		expect(entry?.body).toContain('https://arxiv.org/abs/2210.03629');
	});

	it('includes the hands-on better-sidebar workbench guide', async () => {
		const entry = (await loadLegacyContent()).find(
			(item) =>
				item.route === '/deepseek-harness-tutorials/deepseek-harness-better-sidebar-guide/',
		);

		expect(entry?.frontmatter.sourceUrl).toBe(
			'https://github.com/omdsh-dev/DSH-better-sidebar',
		);
		expect(entry?.body).toContain(
			'dsh plugin --profile web add dsh-better-sidebar@0.10.3',
		);
		expect(entry?.body).toContain('local addresses are not probed');
		expect(entry?.body).toContain(
			'/media/deepseek-harness-tutorials/better-sidebar/editor-git-diff.png',
		);
		expect(entry?.body).toContain(
			'/media/deepseek-harness-tutorials/better-sidebar/mobile-sidebar.png',
		);
	});
});
