import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { renderCloudflareRedirects, taxonomyRedirectLines } from './redirectManifest';

const taxonomy = JSON.parse(
	await readFile(new URL('../../../data/knowledge/taxonomy.json', import.meta.url), 'utf8'),
);

describe('Cloudflare taxonomy redirects', () => {
	it('generates deterministic permanent redirects for every slug alias', () => {
		const lines = taxonomyRedirectLines(taxonomy);
		expect(lines).toContain('/topics/foundation-models/ /topics/models/ 301');
		expect(lines).toContain('/entities/deepmind/ /entities/google-deepmind/ 301');
		expect(lines).not.toContain('/topics/models/ /topics/models/ 301');
		expect(lines).toEqual([...lines].sort());
		expect(new Set(lines).size).toBe(lines.length);
	});

	it('redirects merged canonical and alias routes to the active target', () => {
		const evolved = structuredClone(taxonomy);
		const old = evolved.entities.find((entry: { id: string }) => entry.id === 'entity_xai');
		old.status = 'merged';
		old.redirect_to_id = 'entity_openai';

		expect(taxonomyRedirectLines(evolved)).toEqual(
			expect.arrayContaining([
				'/entities/xai/ /entities/openai/ 301',
				'/entities/x-ai/ /entities/openai/ 301',
			]),
		);
		expect(renderCloudflareRedirects(evolved)).toMatch(/^# Generated/m);
	});

	it('keeps legacy feed and malformed daily URLs as permanent redirects', () => {
		const redirects = renderCloudflareRedirects(taxonomy);
		expect(redirects).toContain('/index.xml /rss.xml 301');
		expect(redirects).toContain('/en/index.xml /en/rss.xml 301');
		expect(redirects).toContain('/en/daily/2025/12/202-22/ /en/daily/2025/12/2025-12-22/ 301');
	});
});
