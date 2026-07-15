import { describe, expect, it } from 'vitest';

import type { SiteRecord } from './siteManifest';
import { renderRss } from './siteRss';

describe('site feeds', () => {
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
