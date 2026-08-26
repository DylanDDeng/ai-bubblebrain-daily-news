import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLegacyContent } from './legacyContent';

const expectedRoutes = [
	'/pi-agent-tutorials/pi-agent-overview/',
	'/pi-agent-tutorials/pi-agent-compaction/',
	'/pi-agent-tutorials/pi-agent-session-storage/',
	'/pi-agent-tutorials/pi-agent-context-engineering/',
	'/pi-agent-tutorials/pi-agent-tool-system/',
];

const expectedVisuals = [
	'pi-agent-loop.svg',
	'pi-agent-turn-steps.svg',
	'pi-four-layers.svg',
	'pi-compaction-flow.svg',
	'pi-session-jsonl.svg',
	'pi-context-assembly.svg',
	'pi-tool-guards.svg',
	'pi-tool-dispatch.svg',
];

describe('Pi Agent tutorial series', () => {
	it('publishes a five-part source-reading path and an index', async () => {
		const entries = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'pi-agent-tutorials',
		);
		const articles = entries.filter((entry) => !entry.isIndex);

		expect(entries.some((entry) => entry.route === '/pi-agent-tutorials/')).toBe(true);
		expect(articles).toHaveLength(expectedRoutes.length);
		expect(articles.map((entry) => entry.route)).toEqual(expect.arrayContaining(expectedRoutes));
		expect(articles.every((entry) => entry.locale === 'zh-CN')).toBe(true);
	});

	it('keeps every chapter source-grounded and substantial', async () => {
		const articles = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'pi-agent-tutorials' && !entry.isIndex,
		);

		for (const entry of articles) {
			expect(entry.frontmatter.sourceUrl).toBe('https://github.com/earendil-works/pi');
			expect(entry.body).toContain('## ');
			expect(entry.body.length).toBeGreaterThan(1_500);
		}
		const overview = articles.find(
			(entry) => entry.route === '/pi-agent-tutorials/pi-agent-overview/',
		);
		expect(overview?.body).toContain('dcd4619');
		expect(overview?.body).toContain('packages/agent/src/agent-loop.ts');
	});

	it('ships a responsive animated SVG for each chapter', async () => {
		const articles = (await loadLegacyContent()).filter(
			(entry) => entry.section === 'pi-agent-tutorials' && !entry.isIndex,
		);
		const combinedBody = articles.map((entry) => entry.body).join('\n');

		for (const visual of expectedVisuals) {
			expect(combinedBody).toContain(`/media/pi-agent-tutorials/${visual}`);
			await expect(
				access(resolve(process.cwd(), `../static/media/pi-agent-tutorials/${visual}`)),
			).resolves.toBeUndefined();
		}
	});
});
