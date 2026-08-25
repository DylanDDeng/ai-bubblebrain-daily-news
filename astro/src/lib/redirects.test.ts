import { describe, expect, it } from 'vitest';

import type { LegacyContentEntry } from './legacyContent';
import { legacyRedirectLines, renderCloudflareRedirects } from './redirectManifest';

const entry = {
	id: 'example.md',
	route: '/highlights/example/',
	section: 'highlights',
	locale: 'zh-CN',
	title: 'Example',
	description: '',
	date: null,
	draft: false,
	aliases: ['/highlights/legacy-example/'],
	isIndex: false,
	sourcePath: '/content/highlights/example.md',
	body: '',
	frontmatter: { kind: 'article' },
} satisfies LegacyContentEntry;

const hiddenToolEntry = {
	route: '/ai-tools/image-compress/',
	section: 'ai-tools',
	aliases: ['/tools/image-compress/'],
} as LegacyContentEntry;

const hiddenCurationEntry = {
	route: '/curations/amo-bench/',
	section: 'curations',
	aliases: ['/curations/amo-gemini/'],
} as LegacyContentEntry;

describe('Cloudflare redirects', () => {
	it('keeps content aliases and feed compatibility redirects', () => {
		expect(legacyRedirectLines([entry])).toEqual([
			'/highlights/legacy-example/ /highlights/example/ 301',
		]);
		const redirects = renderCloudflareRedirects([entry]);
		expect(redirects).toContain('/index.xml /rss.xml 301');
		expect(redirects).toContain('/en/index.xml /en/rss.xml 301');
		expect(redirects).toContain(
			'/vibe-coding/terms/context/ /vibe-coding/terms/context-window/ 301',
		);
		expect(redirects).not.toContain('/daily/');
	});

	it('does not publish aliases for hidden sections', () => {
		expect(legacyRedirectLines([entry, hiddenToolEntry, hiddenCurationEntry])).toEqual([
			'/highlights/legacy-example/ /highlights/example/ 301',
		]);
	});
});
