import type { APIRoute } from 'astro';

import { loadSiteManifest, renderRss, xmlResponse } from '../../lib/siteManifest';

export const prerender = true;

export const GET: APIRoute = async () =>
	xmlResponse(
		renderRss(
			(await loadSiteManifest()).filter((record) => record.locale === 'en'),
			{
				title: "Bubble's Brain",
				description: 'Recent personal AI knowledge base updates',
				route: '/en/rss.xml',
				locale: 'en',
			},
		),
	);
