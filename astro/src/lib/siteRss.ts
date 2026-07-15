import type { SiteRecord } from './siteManifest';

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

export function renderRss(
	records: SiteRecord[],
	options: { title: string; description: string; route: string; locale: 'zh-CN' | 'en' },
): string {
	const items = records
		.filter((record) => record.lastmod)
		.sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
		.map((record) => {
			const url = canonical(record.route);
			return `<item><title>${escapeXml(record.title)}</title><link>${escapeXml(url)}</link><guid>${escapeXml(url)}</guid><pubDate>${record.lastmod?.toUTCString()}</pubDate><description>${escapeXml(record.description)}</description></item>`;
		})
		.join('');
	const self = canonical(options.route);
	return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(options.title)}</title><link>${escapeXml(canonical(options.route.replace(/rss\.xml$/, '')))}</link><description>${escapeXml(options.description)}</description><language>${options.locale}</language><atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>\n`;
}
