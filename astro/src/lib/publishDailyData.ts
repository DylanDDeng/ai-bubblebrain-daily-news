import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const dateFilenamePattern = /^(\d{4}-\d{2}-\d{2})\.json$/;

export async function publishDailyData(options: {
	sourceDirectory: string;
	outputDirectory: string;
}): Promise<string[]> {
	const sourceDirectory = resolve(options.sourceDirectory);
	const outputDirectory = resolve(options.outputDirectory);
	const names = await readdir(sourceDirectory);
	const jsonNames = names.filter((name) => name.endsWith('.json')).sort();

	for (const name of jsonNames) {
		if (!dateFilenamePattern.test(name)) {
			throw new Error(`Invalid structured daily filename: ${name}`);
		}
	}

	await rm(outputDirectory, { recursive: true, force: true });
	if (jsonNames.length === 0) return [];
	await mkdir(outputDirectory, { recursive: true });

	for (const name of jsonNames) {
		const sourcePath = resolve(sourceDirectory, name);
		const outputPath = resolve(outputDirectory, name);
		const source = await readFile(sourcePath);
		const report = JSON.parse(source.toString('utf8')) as { date?: unknown };
		const expectedDate = dateFilenamePattern.exec(name)![1];
		if (report.date !== expectedDate) {
			throw new Error(`Structured daily date does not match its filename: ${name}`);
		}
		await copyFile(sourcePath, outputPath);
		const output = await readFile(outputPath);
		if (!source.equals(output)) {
			throw new Error(`Structured daily JSON changed while publishing: ${name}`);
		}
	}

	return jsonNames;
}
