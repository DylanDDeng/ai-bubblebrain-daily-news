import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const astroRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const taxonomyPath = resolve(astroRoot, '..', 'data', 'knowledge', 'taxonomy.json');

export function taxonomyRedirectLines(taxonomy) {
	const lines = [];
	const sources = new Set();
	for (const [kind, records] of [
		['topics', taxonomy.topics],
		['entities', taxonomy.entities],
	]) {
		const byId = new Map(records.map((record) => [record.id, record]));
		for (const record of records) {
			const canonical = record.status === 'merged' ? byId.get(record.redirect_to_id) : record;
			if (!canonical) throw new Error(`Missing taxonomy redirect target: ${record.id}`);
			for (const slug of [record.slug, ...record.slug_aliases]) {
				if (record.status !== 'merged' && slug === record.slug) continue;
				const source = `/${kind}/${slug}/`;
				if (sources.has(source)) throw new Error(`Duplicate redirect source: ${source}`);
				sources.add(source);
				lines.push(`${source} /${kind}/${canonical.slug}/ 301`);
			}
		}
	}
	return lines.sort();
}

export function renderCloudflareRedirects(taxonomy) {
	return [
		'# Generated from data/knowledge/taxonomy.json. Do not edit by hand.',
		...taxonomyRedirectLines(taxonomy),
		'',
	].join('\n');
}

async function main() {
	const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
	const outputPath = resolve(astroRoot, 'dist', '_redirects');
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, renderCloudflareRedirects(taxonomy));
	console.log(`Generated Cloudflare redirects: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
