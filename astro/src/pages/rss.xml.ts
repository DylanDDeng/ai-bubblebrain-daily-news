import type { APIRoute } from 'astro';

import { loadSiteManifest, renderRss, xmlResponse } from '../lib/siteManifest';

export const prerender = true;

export const GET: APIRoute = async () =>
	xmlResponse(
		renderRss(
			(await loadSiteManifest()).filter((record) => record.locale === 'zh-CN'),
			{
				title: "Bubble's Brain",
				description: '个人 AI 知识库最近更新',
				route: '/rss.xml',
				locale: 'zh-CN',
			},
		),
	);
