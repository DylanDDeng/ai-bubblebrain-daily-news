import { sanitizeSummaryText } from '../../../src/daily/summary.js';

const MAX_HEADLINE_LENGTH = 48;
const MAX_SOURCE_HEADLINE_LENGTH = 480;
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/giu;
const TRAILING_SOCIAL_BOILERPLATE =
	/\s+submitted by\s+\/u\/[^\s]+(?:\s+\[link\])?(?:\s+\[comments\])?\s*$/iu;

export function cleanEditorialText(value: string): string {
	return sanitizeSummaryText(
		String(value || '')
			.normalize('NFC')
			.replace(/<[^>]*>/g, ' ')
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.replace(URL_PATTERN, ' ')
			.replace(TRAILING_SOCIAL_BOILERPLATE, ' ')
			.replace(/\s+/g, ' ')
			.trim(),
	);
}

function codePoints(value: string): string[] {
	return Array.from(value);
}

function trimSocialPrefix(value: string): string {
	return value
		.replace(/^RT\s+[^:：]{1,80}[:：]\s*/iu, '')
		.replace(/^Re\s+/iu, '')
		.trim();
}

function compactLatinText(value: string, maxLength: number): string {
	const clipped = codePoints(value).slice(0, maxLength + 1).join('');
	if (codePoints(value).length <= maxLength) return value;
	const boundary = clipped.lastIndexOf(' ');
	return (
		boundary >= Math.floor(maxLength * 0.65)
			? clipped.slice(0, boundary)
			: clipped.slice(0, maxLength)
	)
		.replace(/[,:，：;；\s]+$/u, '')
		.trim();
}

function sourceTextForHeadline(title: string, summary: string): string {
	const rawTitle = cleanEditorialText(title);
	const attribution = rawTitle.match(/^RT\s+([^:：]{1,80})[:：]/iu)?.[1]?.trim();
	const cleanedTitle = trimSocialPrefix(rawTitle);
	let cleanedSummary = trimSocialPrefix(cleanEditorialText(summary));
	const attributionPrefix = attribution ? `RT ${attribution} ` : '';
	if (
		attributionPrefix &&
		cleanedSummary.toLocaleLowerCase().startsWith(attributionPrefix.toLocaleLowerCase())
	) {
		cleanedSummary = cleanedSummary.slice(attributionPrefix.length).trim();
	}
	const titleStem = cleanedTitle.replace(/[.…]{1,3}$/u, '').trim();
	if (
		cleanedSummary &&
		(!cleanedTitle || /[.…]{1,3}$/u.test(cleanedTitle) || cleanedSummary.startsWith(titleStem))
	) {
		return cleanedSummary;
	}
	return cleanedTitle || cleanedSummary;
}

export function compactEditorialTitle(title: string, summary = ''): string {
	const source = sourceTextForHeadline(title, summary);
	const points = codePoints(source);
	if (points.length <= MAX_HEADLINE_LENGTH) return source;

	const mostlyLatin = (source.match(/[\u0020-\u024f]/gu)?.length || 0) / points.length > 0.72;
	if (mostlyLatin) return compactLatinText(source, 72);
	if (points.length <= MAX_SOURCE_HEADLINE_LENGTH) return source;

	const window = points.slice(0, MAX_SOURCE_HEADLINE_LENGTH + 1).join('');
	const sentenceBoundaries = [...window.matchAll(/[。！？!?]/gu)]
		.map((match) => match.index! + match[0].length)
		.filter((index) => index >= 14);
	if (sentenceBoundaries.length > 0) {
		return window.slice(0, sentenceBoundaries.at(-1)).trim();
	}
	return points
		.slice(0, MAX_SOURCE_HEADLINE_LENGTH)
		.join('')
		.replace(/[，,：:；;\s]+$/u, '')
		.trim();
}
