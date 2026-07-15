import type { APIRoute } from 'astro';

import { loadSiteManifest, renderRss, xmlResponse } from '../../../../lib/siteManifest';

export function getStaticPaths() {
	return ['2025', '2026'].map((year) => ({ params: { year } }));
}

export const GET: APIRoute = async ({ params }) => {
	const year = params.year ?? '2026';
	const prefix = `/en/model-evals/${year}/`;
	const records = (await loadSiteManifest()).filter(
		(record) => record.locale === 'en' && record.route.startsWith(prefix),
	);
	return xmlResponse(
		renderRss(records, {
			title: `Bubble's Brain · Model evals ${year}`,
			description: `${year} model evaluation updates`,
			route: `${prefix}rss.xml`,
			locale: 'en',
		}),
	);
};
