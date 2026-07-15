import type { APIRoute } from 'astro';

import { loadSiteManifest, renderSitemapUrlset, xmlResponse } from '../../lib/siteManifest';

export const prerender = true;
export const GET: APIRoute = async () =>
	xmlResponse(
		renderSitemapUrlset((await loadSiteManifest()).filter((record) => record.locale === 'en')),
	);
