import type { APIRoute } from 'astro';

import { LEGACY_SECTIONS } from '../../lib/legacyContent';
import { loadSiteManifest, renderRss, xmlResponse } from '../../lib/siteManifest';

const sections = ['daily', ...LEGACY_SECTIONS] as const;

export function getStaticPaths() {
	return sections.map((section) => ({ params: { section } }));
}

export const GET: APIRoute = async ({ params }) => {
	const section = params.section ?? 'daily';
	const records = (await loadSiteManifest()).filter(
		(record) => record.locale === 'zh-CN' && record.section === section,
	);
	return xmlResponse(
		renderRss(records, {
			title: `Bubble's Brain · ${section}`,
			description: `${section} recent updates`,
			route: `/${section}/rss.xml`,
			locale: 'zh-CN',
		}),
	);
};
