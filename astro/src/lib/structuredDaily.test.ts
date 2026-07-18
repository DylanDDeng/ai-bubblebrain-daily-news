import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	dailyDataDirectory,
	formatTimelineTime,
	isDatabaseOwnedDailyDate,
	loadStructuredDailyReport,
	orderTimelineBatches,
	structuredCutoverDate,
	type StructuredDailyBatch,
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
	delete process.env.STRUCTURED_CUTOVER_DATE;
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('structured daily source ownership', () => {
	it('keeps pre-cutover dates on legacy Markdown and includes both locales after cutover', () => {
		expect(structuredCutoverDate()).toBe('2026-07-16');
		expect(isDatabaseOwnedDailyDate('2026-07-15')).toBe(false);
		expect(isDatabaseOwnedDailyDate('2026-07-16')).toBe(true);
	});

	it('honors a release-pinned cutover date and rejects malformed configuration', () => {
		process.env.STRUCTURED_CUTOVER_DATE = '2026-07-14';
		expect(isDatabaseOwnedDailyDate('2026-07-13')).toBe(false);
		expect(isDatabaseOwnedDailyDate('2026-07-14')).toBe(true);

		process.env.STRUCTURED_CUTOVER_DATE = 'July 14';
		expect(() => isDatabaseOwnedDailyDate('2026-07-14')).toThrow(
			'STRUCTURED_CUTOVER_DATE must use YYYY-MM-DD',
		);
	});
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

describe('timeline batch order', () => {
	const batch = (
		id: StructuredDailyBatch['id'],
		status: StructuredDailyBatch['status'],
	): StructuredDailyBatch => ({
		id,
		label: id,
		status,
		generated_at: status === 'completed' ? '2026-07-16T00:00:00.000Z' : null,
		item_ids: [],
	});

	it('shows completed batches newest first and keeps pending batches after them', () => {
		const batches = [
			batch('morning', 'completed'),
			batch('afternoon', 'pending'),
			batch('night', 'completed'),
			batch('lateNight', 'pending'),
		];

		expect(orderTimelineBatches(batches).map(({ id }) => id)).toEqual([
			'night',
			'morning',
			'afternoon',
			'lateNight',
		]);
		expect(batches.map(({ id }) => id)).toEqual(['morning', 'afternoon', 'night', 'lateNight']);
	});
});
