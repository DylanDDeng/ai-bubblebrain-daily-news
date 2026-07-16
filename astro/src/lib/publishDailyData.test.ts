import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { publishDailyData } from './publishDailyData';

const temporaryRoots: string[] = [];

async function directories(): Promise<{ sourceDirectory: string; outputDirectory: string }> {
	const root = await mkdtemp(join(tmpdir(), 'bubble-publish-daily-'));
	temporaryRoots.push(root);
	const sourceDirectory = join(root, 'source');
	const outputDirectory = join(root, 'dist', 'data', 'daily');
	await mkdir(sourceDirectory, { recursive: true });
	return { sourceDirectory, outputDirectory };
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('daily JSON publisher', () => {
	it('copies canonical reports without changing a byte', async () => {
		const paths = await directories();
		const source = '{\n  "date": "2026-07-16",\n  "value": "原始字节"\n}\n';
		await writeFile(join(paths.sourceDirectory, '.gitkeep'), '');
		await writeFile(join(paths.sourceDirectory, '2026-07-16.json'), source);

		await expect(publishDailyData(paths)).resolves.toEqual(['2026-07-16.json']);
		await expect(readFile(join(paths.outputDirectory, '2026-07-16.json'), 'utf8')).resolves.toBe(
			source,
		);
	});

	it('fails closed for malformed filenames and date mismatches', async () => {
		const invalidName = await directories();
		await writeFile(join(invalidName.sourceDirectory, 'latest.json'), '{}');
		await expect(publishDailyData(invalidName)).rejects.toThrow(
			'Invalid structured daily filename',
		);

		const invalidDate = await directories();
		await writeFile(join(invalidDate.sourceDirectory, '2026-07-16.json'), '{"date":"2026-07-15"}');
		await expect(publishDailyData(invalidDate)).rejects.toThrow(
			'Structured daily date does not match',
		);
	});
});
