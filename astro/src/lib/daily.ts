import type { CollectionEntry } from 'astro:content';

export type DailyLocale = 'zh-CN' | 'en';

export interface DailyEntryIdentity {
	dateKey: string;
	year: string;
	month: string;
	day: string;
	locale: DailyLocale;
}

const DAILY_ENTRY_ID = /^(\d{4})-(\d{2})-(\d{2})(?:\.(en))?$/;

export function parseDailyEntryId(id: string): DailyEntryIdentity | null {
	const match = DAILY_ENTRY_ID.exec(id);
	if (!match) return null;

	const [, year, month, day, languageSuffix] = match;
	const timestamp = Date.parse(`${year}-${month}-${day}T00:00:00Z`);
	if (Number.isNaN(timestamp)) return null;

	const parsed = new Date(timestamp);
	if (
		parsed.getUTCFullYear() !== Number(year) ||
		parsed.getUTCMonth() + 1 !== Number(month) ||
		parsed.getUTCDate() !== Number(day)
	) {
		return null;
	}

	return {
		dateKey: `${year}-${month}-${day}`,
		year,
		month,
		day,
		locale: languageSuffix === 'en' ? 'en' : 'zh-CN',
	};
}

export function dailyPermalink(id: string): string | null {
	const identity = parseDailyEntryId(id);
	if (!identity) return null;
	const prefix = identity.locale === 'en' ? '/en' : '';
	return `${prefix}/daily/${identity.year}/${identity.month}/${identity.dateKey}/`;
}

export function filterDailyEntries(
	entries: CollectionEntry<'daily'>[],
	locale: DailyLocale,
): CollectionEntry<'daily'>[] {
	return entries
		.filter((entry) => !entry.data.draft && parseDailyEntryId(entry.id)?.locale === locale)
		.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function formatDailyDate(date: Date, locale: DailyLocale): string {
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'Asia/Shanghai',
	}).format(date);
}

// Anchors a YYYY-MM-DD key to midnight in the site's display timezone so
// weekday/month-day labels never drift with the build machine's timezone.
export function dailyDateFromKey(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00+08:00`);
}

export function formatDailyWeekday(
	date: Date,
	locale: DailyLocale,
	style: 'long' | 'short' = 'long',
): string {
	return new Intl.DateTimeFormat(locale, {
		weekday: style,
		timeZone: 'Asia/Shanghai',
	}).format(date);
}
