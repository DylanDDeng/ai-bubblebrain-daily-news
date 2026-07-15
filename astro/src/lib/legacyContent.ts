import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import matter from 'gray-matter';

export const LEGACY_SECTIONS = [
	'about',
	'ai-tools',
	'curations',
	'highlights',
	'model-evals',
	'my-publish',
	'prompts',
	'x-trending',
] as const;

export type LegacySection = (typeof LEGACY_SECTIONS)[number];
export type LegacyLocale = 'zh-CN' | 'en';

export interface LegacyContentEntry {
	id: string;
	section: LegacySection;
	locale: LegacyLocale;
	route: string;
	title: string;
	description: string;
	date: Date | null;
	draft: boolean;
	aliases: string[];
	isIndex: boolean;
}

const repoRoot = resolve(process.cwd(), '..');
const contentRoot = resolve(repoRoot, 'content');

function normalizeRoute(pathname: string): string {
	return `/${pathname.split('/').filter(Boolean).join('/')}/`;
}

function parseDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function titleFromSlug(slug: string): string {
	return slug
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(' ');
}

function normalizeAliases(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter((alias): alias is string => typeof alias === 'string').map(normalizeRoute),
		),
	];
}

async function walk(directory: string): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else if (/\.(?:md|html)$/i.test(entry.name)) files.push(path);
	}
	return files;
}

function routeForSource(
	section: LegacySection,
	segments: string[],
	baseName: string,
	locale: LegacyLocale,
	frontmatter: Record<string, unknown>,
): { route: string; isIndex: boolean } {
	const isIndex = baseName === '_index';
	const slug =
		!isIndex && typeof frontmatter.slug === 'string' && frontmatter.slug.trim()
			? frontmatter.slug.trim()
			: baseName;
	const routeSegments = [locale === 'en' ? 'en' : '', section, ...segments];
	if (!isIndex) routeSegments.push(slug.toLocaleLowerCase('en-US'));
	return { route: normalizeRoute(routeSegments.join('/')), isIndex };
}

export async function loadLegacyContent(): Promise<LegacyContentEntry[]> {
	const entries: LegacyContentEntry[] = [];

	for (const section of LEGACY_SECTIONS) {
		const sectionRoot = resolve(contentRoot, section);
		for (const sourcePath of await walk(sectionRoot)) {
			const sourceRelative = relative(sectionRoot, sourcePath).replaceAll('\\', '/');
			const extension = extname(sourceRelative).toLocaleLowerCase('en-US');
			const withoutExtension = sourceRelative.slice(0, -extension.length);
			const locale: LegacyLocale = withoutExtension.endsWith('.en') ? 'en' : 'zh-CN';
			const localizedPath = locale === 'en' ? withoutExtension.slice(0, -3) : withoutExtension;
			const parts = localizedPath.split('/');
			const baseName = parts.pop() ?? '';
			const source = await readFile(sourcePath, 'utf8');
			const parsed = matter(source);
			const frontmatter = parsed.data as Record<string, unknown>;
			const { route, isIndex } = routeForSource(section, parts, baseName, locale, frontmatter);
			const title =
				typeof frontmatter.title === 'string' && frontmatter.title.trim()
					? frontmatter.title.trim()
					: isIndex
						? titleFromSlug(parts.at(-1) ?? section)
						: titleFromSlug(baseName);

			entries.push({
				id: sourceRelative,
				section,
				locale,
				route,
				title,
				description:
					typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '',
				date: parseDate(frontmatter.date),
				draft: frontmatter.draft === true,
				aliases: normalizeAliases(frontmatter.aliases),
				isIndex,
			});
		}
	}

	const published = entries.filter((entry) => !entry.draft);
	const routes = new Set<string>();
	for (const entry of published) {
		if (routes.has(entry.route)) throw new Error(`Duplicate legacy route: ${entry.route}`);
		routes.add(entry.route);
	}
	return published.sort((a, b) => a.route.localeCompare(b.route));
}

export function legacyChildren(
	entry: LegacyContentEntry,
	entries: LegacyContentEntry[],
): LegacyContentEntry[] {
	if (!entry.isIndex) return [];
	const depth = entry.route.split('/').filter(Boolean).length;
	return entries
		.filter((candidate) => {
			if (candidate.route === entry.route || candidate.locale !== entry.locale) return false;
			if (!candidate.route.startsWith(entry.route)) return false;
			return candidate.route.split('/').filter(Boolean).length === depth + 1;
		})
		.sort((a, b) => {
			const dateOrder = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
			return dateOrder || a.title.localeCompare(b.title, entry.locale);
		});
}

export function legacyAlternate(
	entry: LegacyContentEntry,
	entries: LegacyContentEntry[],
): LegacyContentEntry | null {
	const counterpart =
		entry.locale === 'en' ? entry.route.replace(/^\/en/, '') : `/en${entry.route}`;
	return entries.find((candidate) => candidate.route === counterpart) ?? null;
}
