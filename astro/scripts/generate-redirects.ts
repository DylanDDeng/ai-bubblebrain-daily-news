import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { knowledgeTaxonomy } from '../src/lib/knowledge';
import { loadLegacyContent } from '../src/lib/legacyContent';
import { renderCloudflareRedirects } from '../src/lib/redirectManifest';

const outputPath = resolve(process.cwd(), 'dist', 'client', '_redirects');
await mkdir(resolve(process.cwd(), 'dist', 'client'), { recursive: true });
await writeFile(
	outputPath,
	renderCloudflareRedirects(knowledgeTaxonomy, await loadLegacyContent()),
	'utf8',
);
console.log(`Generated Cloudflare redirects: ${outputPath}`);
