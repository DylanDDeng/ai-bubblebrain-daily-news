import { access, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import sharp from 'sharp';

import { responsiveVariantPath, responsiveWidths } from '../src/lib/articleFigures';

const astroRoot = resolve(import.meta.dirname, '..');
const contentRoot = resolve(astroRoot, '../content');
const staticRoot = resolve(astroRoot, '../static');
const outputRoot = resolve(staticRoot, '_responsive');
const rasterExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);

async function filesUnder(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = resolve(directory, entry.name);
			return entry.isDirectory() ? filesUnder(path) : [path];
		}),
	);
	return nested.flat();
}

function localImageReferences(markdown: string): string[] {
	const references = new Set<string>();
	const patterns = [
		/!\[[^\]]*\]\(<?(\/[^\s)>]+\.(?:avif|jpe?g|png|webp))(?:[?#][^\s)>]*)?>?(?:\s+["'][^"']*["'])?\)/gi,
		/<img\b[^>]*\bsrc=["'](\/[^"']+\.(?:avif|jpe?g|png|webp))(?:[?#][^"']*)?["'][^>]*>/gi,
	];
	for (const pattern of patterns) {
		for (const match of markdown.matchAll(pattern)) if (match[1]) references.add(match[1]);
	}
	return [...references];
}

async function isCurrent(outputPath: string, sourceMtime: number): Promise<boolean> {
	try {
		const output = await stat(outputPath);
		return output.size > 0 && output.mtimeMs >= sourceMtime;
	} catch {
		return false;
	}
}

async function generateFor(publicPath: string): Promise<{ generated: number; skipped: number }> {
	const sourcePath = resolve(staticRoot, `.${publicPath}`);
	if (!rasterExtensions.has(extname(sourcePath).toLowerCase())) return { generated: 0, skipped: 0 };
	try {
		await access(sourcePath);
	} catch {
		return { generated: 0, skipped: 0 };
	}

	const [metadata, sourceStats] = await Promise.all([
		sharp(sourcePath).metadata(),
		stat(sourcePath),
	]);
	if (!metadata.width) return { generated: 0, skipped: 0 };

	let generated = 0;
	let skipped = 0;
	for (const width of responsiveWidths(metadata.width)) {
		for (const format of ['avif', 'webp'] as const) {
			const outputPath = resolve(
				staticRoot,
				`.${responsiveVariantPath(publicPath, width, format)}`,
			);
			if (await isCurrent(outputPath, sourceStats.mtimeMs)) {
				skipped += 1;
				continue;
			}
			await mkdir(resolve(outputPath, '..'), { recursive: true });
			const pipeline = sharp(sourcePath).rotate().resize({ width, withoutEnlargement: true });
			if (format === 'avif') await pipeline.avif({ quality: 55, effort: 4 }).toFile(outputPath);
			else await pipeline.webp({ quality: 82, smartSubsample: true }).toFile(outputPath);
			generated += 1;
		}
	}
	return { generated, skipped };
}

async function main() {
	const markdownFiles = (await filesUnder(contentRoot)).filter((path) => path.endsWith('.md'));
	const referenced = new Set<string>();
	for (const file of markdownFiles) {
		const markdown = await readFile(file, 'utf8');
		for (const reference of localImageReferences(markdown)) referenced.add(reference);
	}

	await mkdir(outputRoot, { recursive: true });
	const queue = [...referenced];
	const totals = { generated: 0, skipped: 0 };
	const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
		for (;;) {
			const publicPath = queue.shift();
			if (!publicPath) return;
			const result = await generateFor(publicPath);
			totals.generated += result.generated;
			totals.skipped += result.skipped;
		}
	});
	await Promise.all(workers);
	console.log(
		`Responsive images: ${referenced.size} referenced, ${totals.generated} generated, ${totals.skipped} current.`,
	);
}

await main();
