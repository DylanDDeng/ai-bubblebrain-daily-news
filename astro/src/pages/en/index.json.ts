import type { APIRoute } from 'astro';

import { buildKnowledgeSearchIndex } from '../../lib/searchIndex';

export const prerender = true;

export const GET: APIRoute = async () =>
	new Response(`${JSON.stringify(await buildKnowledgeSearchIndex({ locale: 'en' }))}\n`, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
