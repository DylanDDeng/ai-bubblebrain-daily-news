import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	dailyDataDirectory,
	formatTimelineTime,
	loadStructuredDailyReport,
	type StructuredDailyItem,
} from './structuredDaily';

const fixturePath = resolve(import.meta.dirname, '../../tests/fixtures/daily-report.valid.json');
const temporaryRoots: string[] = [];

async function dataDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'bubble-daily-'));
	temporaryRoots.push(root);
	const directory = join(root, 'data', 'daily');
	await mkdir(directory, { recursive: true });
	process.env.DAILY_DATA_DIR = directory;
	return directory;
}

async function fixture(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>;
}

afterEach(async () => {
	delete process.env.DAILY_DATA_DIR;
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('structured daily report loader', () => {
	it('resolves the canonical repository data directory independently of module bundling', () => {
		expect(dailyDataDirectory()).toBe(resolve(process.cwd(), '..', 'data', 'daily'));
	});

	it('loads a valid report and returns null when the date is absent', async () => {
		const directory = await dataDirectory();
		await writeFile(join(directory, '2026-07-14.json'), JSON.stringify(await fixture()));
		await expect(loadStructuredDailyReport('2026-07-14')).resolves.toMatchObject({
			date: '2026-07-14',
		});
		await expect(loadStructuredDailyReport('2026-07-13')).resolves.toBeNull();
	});

	it('fails closed for malformed JSON and schema drift', async () => {
		const malformedDirectory = await dataDirectory();
		await writeFile(join(malformedDirectory, '2026-07-14.json'), '{bad json');
		await expect(loadStructuredDailyReport('2026-07-14')).rejects.toBeInstanceOf(SyntaxError);

		const invalidDirectory = await dataDirectory();
		const report = await fixture();
		report.timezone = 'UTC';
		await writeFile(join(invalidDirectory, '2026-07-14.json'), JSON.stringify(report));
		await expect(loadStructuredDailyReport('2026-07-14')).rejects.toThrow(
			'Invalid daily report schema',
		);
	});

	it('rejects a valid report stored under the wrong filename', async () => {
		const directory = await dataDirectory();
		await writeFile(join(directory, '2026-07-13.json'), JSON.stringify(await fixture()));
		await expect(loadStructuredDailyReport('2026-07-13')).rejects.toThrow(
			'filename does not match',
		);
	});
});

describe('timeline time labels', () => {
	const item = {
		published_at: '2026-07-14T06:20:00.000Z',
		published_date: '2026-07-14',
		time_precision: 'exact',
	} as StructuredDailyItem;

	it('shows a date prefix for sources published before the report date', () => {
		expect(formatTimelineTime(item, 'zh-CN', '2026-07-15')).toBe('07-14 14:20');
		expect(formatTimelineTime(item, 'zh-CN', '2026-07-14')).toBe('14:20');
	});

	it('never fabricates an exact time for date-only or inferred sources', () => {
		expect(
			formatTimelineTime(
				{ ...item, published_at: null, time_precision: 'date_only' },
				'zh-CN',
				'2026-07-14',
			),
		).toBe('07-14');
		expect(
			formatTimelineTime(
				{ ...item, published_at: null, published_date: null, time_precision: 'inferred' },
				'en',
				'2026-07-14',
			),
		).toBe('—');
	});
});
