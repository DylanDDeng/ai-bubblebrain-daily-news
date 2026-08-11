import { legacyEntryIsRoutable, loadLegacyContent } from './legacyContent';

export { renderRss } from './siteRss';

export interface SiteRecord {
	route: string;
	title: string;
	description: string;
	locale: 'zh-CN' | 'en';
	section: string;
	lastmod: Date | null;
	alternateRoute: string | null;
}

const SITE = 'https://bubblenews.today';

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function canonical(route: string): string {
	return new URL(route, SITE).href;
}

export async function loadSiteManifest(): Promise<SiteRecord[]> {
	const legacyEntries = await loadLegacyContent();
	const records: Omit<SiteRecord, 'alternateRoute'>[] = [
		{
			route: '/',
			title: "Bubble's Brain",
			description: '精选、可检索、可复用的个人 AI 知识库',
			locale: 'zh-CN',
			section: 'home',
			lastmod: null,
		},
		{
			route: '/en/',
			title: "Bubble's Brain",
			description: 'A curated, searchable, reusable personal AI knowledge base',
			locale: 'en',
			section: 'home',
			lastmod: null,
		},
		{
			route: '/search/',
			title: '知识搜索',
			description: '搜索 Codex、WorkBuddy 教程与知识文章',
			locale: 'zh-CN',
			section: 'knowledge',
			lastmod: null,
		},
	];

	for (const entry of legacyEntries) {
		if (!legacyEntryIsRoutable(entry)) continue;
		records.push({
			route: entry.route,
			title: entry.title,
			description: entry.description,
			locale: entry.locale,
			section: entry.section,
			lastmod: entry.date,
		});
	}

	const byRoute = new Map<string, Omit<SiteRecord, 'alternateRoute'>>();
	for (const record of records) {
		if (byRoute.has(record.route))
			throw new Error(`Duplicate site manifest route: ${record.route}`);
		byRoute.set(record.route, record);
	}

	return [...byRoute.values()]
		.map((record) => {
			const alternateRoute =
				record.locale === 'en' ? record.route.replace(/^\/en/, '') : `/en${record.route}`;
			return { ...record, alternateRoute: byRoute.has(alternateRoute) ? alternateRoute : null };
		})
		.sort((a, b) => a.route.localeCompare(b.route));
}

export function renderSitemapUrlset(records: SiteRecord[]): string {
	const rows = records.map((record) => {
		const alternates = [
			record,
			...(record.alternateRoute ? [{ ...record, route: record.alternateRoute }] : []),
		]
			.map((alternate) => {
				const locale = alternate.route.startsWith('/en/') ? 'en' : 'zh-CN';
				return `<xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(canonical(alternate.route))}"/>`;
			})
			.join('');
		const lastmod = record.lastmod ? `<lastmod>${record.lastmod.toISOString()}</lastmod>` : '';
		return `<url><loc>${escapeXml(canonical(record.route))}</loc>${lastmod}${alternates}</url>`;
	});
	return `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${rows.join('')}</urlset>\n`;
}

export function renderSitemapIndex(): string {
	return `<?xml version="1.0" encoding="utf-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE}/zh-cn/sitemap.xml</loc></sitemap><sitemap><loc>${SITE}/en/sitemap.xml</loc></sitemap></sitemapindex>\n`;
}

export function xmlResponse(body: string): Response {
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
