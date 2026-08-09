import { describe, expect, it } from 'vitest';

import type { LegacyContentEntry } from './legacyContent';
import { legacyRedirectLines, renderCloudflareRedirects } from './redirectManifest';

const entry = {
	route: '/curations/amo-bench/',
	section: 'curations',
	aliases: ['/curations/amo-gemini/'],
} as LegacyContentEntry;

const hiddenToolEntry = {
	route: '/ai-tools/image-compress/',
	section: 'ai-tools',
	aliases: ['/tools/image-compress/'],
} as LegacyContentEntry;

describe('Cloudflare redirects', () => {
	it('keeps content aliases and feed compatibility redirects', () => {
		expect(legacyRedirectLines([entry])).toEqual([
			'/curations/amo-gemini/ /curations/amo-bench/ 301',
		]);
		const redirects = renderCloudflareRedirects([entry]);
		expect(redirects).toContain('/index.xml /rss.xml 301');
		expect(redirects).toContain('/en/index.xml /en/rss.xml 301');
		expect(redirects).not.toContain('/daily/');
	});

	it('does not publish aliases for temporarily hidden sections', () => {
		expect(legacyRedirectLines([entry, hiddenToolEntry])).toEqual([
			'/curations/amo-gemini/ /curations/amo-bench/ 301',
		]);
	});
});
