import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDailyArtifacts } from '../../../src/daily/buildArtifacts.js';
import { buildKnowledgeSearchIndex } from './searchIndex';

const fixturePath = resolve(import.meta.dirname, '../../tests/fixtures/daily-report.valid.json');
const temporaryRoots: string[] = [];

async function fixture(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>;
}

async function dailyDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'bubble-search-'));
	temporaryRoots.push(root);
	const directory = join(root, 'data', 'daily');
	await mkdir(directory, { recursive: true });
	return directory;
}

async function reportForDate(date: string): Promise<Record<string, unknown>> {
	const build = buildDailyArtifacts as unknown as (
		input: Record<string, unknown>,
	) => Promise<{ report: Record<string, unknown> }>;
	const result = await build({
		rawItems: [
			{
				provider: 'aibase',
				id: `source-${date}`,
				title: `AI news for ${date}`,
				url: `https://example.com/ai-news/${date}`,
				source: 'Example News',
				published_date: `${date}T14:20:00+08:00`,
				description: 'A concise summary.',
			},
		],
		reportDate: date,
		structuredStartDate: date,
		batch: 'morning',
		runAt: `${date}T07:00:00.000Z`,
		producer: { version: 'search-index-test', commitSha: 'a'.repeat(40) },
	});
	return result.report;
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('knowledge search index', () => {
	it('returns an empty deterministic index when structured reports are absent', async () => {
		const directory = await dailyDirectory();
		await expect(
			buildKnowledgeSearchIndex({ directory, siteReleaseId: null }),
		).resolves.toEqual({
			schema_version: 1,
			taxonomy_version: 1,
			site_release_id: null,
			item_count: 0,
			report_dates: [],
			items: [],
		});
	});

	it('embeds the immutable release identity without resolving current', async () => {
		const directory = await dailyDirectory();
		const releaseId = '11111111-1111-4111-8111-111111111111';
		await expect(
			buildKnowledgeSearchIndex({ directory, siteReleaseId: releaseId }),
		).resolves.toMatchObject({ site_release_id: releaseId });
		await expect(
			buildKnowledgeSearchIndex({ directory, siteReleaseId: 'latest' }),
		).rejects.toThrow('Invalid site release identity');
	});

	it('indexes individual news items across reports with stable daily anchors', async () => {
		const directory = await dailyDirectory();
		const first = await reportForDate('2026-07-14');
		const second = await reportForDate('2026-07-15');
		await writeFile(join(directory, '2026-07-14.json'), JSON.stringify(first));
		await writeFile(join(directory, '2026-07-15.json'), JSON.stringify(second));

		const index = await buildKnowledgeSearchIndex({ directory });
		expect(index.item_count).toBe(2);
		expect(index.report_dates).toEqual(['2026-07-15', '2026-07-14']);
		expect(index.items.map((item) => item.date)).toEqual(['2026-07-15', '2026-07-14']);
		expect(index.items[0]).toMatchObject({
			key: expect.stringMatching(/^2026-07-15:n_[a-f0-9]{64}$/),
			href: expect.stringMatching(/^\/daily\/2026\/07\/2026-07-15\/#news-n_[a-f0-9]{64}$/),
			topic_ids: ['topic_other'],
			entity_ids: [],
		});
		expect(index.items[0].search_text).toContain('example news');
	});

	it('never includes more than the seven newest report days', async () => {
		const directory = await dailyDirectory();
		for (let day = 1; day <= 8; day += 1) {
			const date = `2026-07-${String(day).padStart(2, '0')}`;
			await writeFile(join(directory, `${date}.json`), JSON.stringify(await reportForDate(date)));
		}
		const index = await buildKnowledgeSearchIndex({ directory });
		expect(index.report_dates).toHaveLength(7);
		expect(index.report_dates).toEqual([
			'2026-07-08',
			'2026-07-07',
			'2026-07-06',
			'2026-07-05',
			'2026-07-04',
			'2026-07-03',
			'2026-07-02',
		]);
	});

	it('fails closed when any discovered report is invalid', async () => {
		const directory = await dailyDirectory();
		const invalid = await fixture();
		invalid.taxonomy_version = 2;
		await writeFile(join(directory, '2026-07-14.json'), JSON.stringify(invalid));
		await expect(buildKnowledgeSearchIndex({ directory })).rejects.toThrow(
			'Invalid daily report schema',
		);
	});
});
