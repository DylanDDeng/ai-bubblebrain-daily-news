import { legacyEntryIsRoutable, type LegacyContentEntry } from './legacyContent';

export function legacyRedirectLines(entries: LegacyContentEntry[]): string[] {
	return entries
		.filter(legacyEntryIsRoutable)
		.flatMap((entry) => entry.aliases.map((alias) => `${alias} ${entry.route} 301`))
		.sort();
}

export function renderCloudflareRedirects(entries: LegacyContentEntry[] = []): string {
	const lines = [
		...legacyRedirectLines(entries),
		'/en/index.xml /en/rss.xml 301',
		'/index.xml /rss.xml 301',
		'/vibe-coding/terms/context/ /vibe-coding/terms/context-window/ 301',
		'/zh-cn/ / 301',
	];
	const sources = new Set<string>();
	for (const line of lines) {
		const [source] = line.split(' ');
		if (sources.has(source)) throw new Error(`Duplicate redirect source: ${source}`);
		sources.add(source);
	}
	return [
		'# Generated from versioned content contracts. Do not edit by hand.',
		...lines.sort(),
		'',
	].join('\n');
}
