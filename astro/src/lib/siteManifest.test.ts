import { describe, expect, it } from 'vitest';

import { loadSiteManifest, type SiteRecord } from './siteManifest';
import { renderRss } from './siteRss';

describe('site feeds', () => {
	it('publishes the Vibe Coding terms route', async () => {
		const records = await loadSiteManifest();

		expect(records).toContainEqual(
			expect.objectContaining({
				route: '/vibe-coding/terms/',
				title: 'Vibe Coding 术语',
				section: 'vibe-coding',
			}),
		);
		expect(records).toContainEqual(
			expect.objectContaining({
				route: '/vibe-coding/terms/frontend/',
				title: '前端（Frontend）',
				section: 'vibe-coding',
			}),
		);
	});

	it('publishes the Vibe Coding design routes', async () => {
		const records = await loadSiteManifest();

		expect(records).toContainEqual(
			expect.objectContaining({
				route: '/vibe-coding/design/',
				title: 'Design 设计理念库',
				section: 'vibe-coding',
			}),
		);
		expect(records).toContainEqual(
			expect.objectContaining({
				route: '/vibe-coding/design/stripe/',
				section: 'vibe-coding',
			}),
		);
	});

	it('keeps every dated compatibility record instead of silently truncating the feed', () => {
		const records: SiteRecord[] = Array.from({ length: 150 }, (_, index) => ({
			route: `/daily/2026/01/item-${index}/`,
			title: `Item ${index}`,
			description: `Description ${index}`,
			locale: 'zh-CN',
			section: 'daily',
			lastmod: new Date(Date.UTC(2026, 0, index + 1)),
			alternateRoute: null,
		}));

		const rss = renderRss(records, {
			title: 'All updates',
			description: 'Compatibility feed',
			route: '/rss.xml',
			locale: 'zh-CN',
		});

		expect(rss.match(/<item>/g)).toHaveLength(150);
		expect(rss).toContain('/daily/2026/01/item-0/');
		expect(rss).toContain('/daily/2026/01/item-149/');
	});
});
