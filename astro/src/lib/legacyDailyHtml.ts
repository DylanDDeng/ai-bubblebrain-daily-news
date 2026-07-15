const MEDIA_PLACEHOLDER_START = /\\?\[(?:图片|image|视频|video)\s*:/iu;
const ANCHOR =
	/<a\b([^>]*?)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/giu;
const TRUNCATION_MARKER = /…|%e2%80%a6|&hellip;|\.{3,}/iu;
const BARE_TRUNCATED_URL = /https?:\/\/[^\s<]*(?:…|%e2%80%a6|&hellip;|\.{3,})[^\s<]*/giu;
const TRUNCATED_ANCHOR_TAIL =
	/(<a\b[^>]*>[^<]*<\/a>)(?:\?|&amp;)?(?:…|%e2%80%a6|&hellip;|\.{3,})/giu;
const RAW_URL_LABEL = /^\s*https?:\/\//iu;
const PROSE_DELIMITER = /[，。；！？）】》、]/u;
const REPEATED_MARKDOWN_URL = /^(https?:\/\/[^\s\]]+?)(?:%5d|\])\((https?:\/\/[^\s)]+)\)$/iu;
const REPEATED_MARKDOWN_LABEL = /^(https?:\/\/[^\s\]]+?)\]\((https?:\/\/[^\s)]+)\)$/iu;
const EMPTY_REPEATED_LINK_WRAPPER = /\(\s*\[\s*\)/gu;
const BLOCK_END = /^<\/(?:p|li|div|blockquote|section|article|td|th)\b/iu;

function decodeUrlAttribute(value: string): string {
	return value.replaceAll('&amp;', '&').replaceAll('&#38;', '&').replaceAll('&#x26;', '&');
}

function isMalformedRepeatedMarkdownAnchor(href: string, labelHtml: string): boolean {
	const hrefMatch = REPEATED_MARKDOWN_URL.exec(decodeUrlAttribute(href.trim()));
	const label = decodeUrlAttribute(labelHtml.replace(/<[^>]+>/gu, '').trim());
	const labelMatch = REPEATED_MARKDOWN_LABEL.exec(label);
	return Boolean(
		hrefMatch && labelMatch && hrefMatch[1] === labelMatch[1] && hrefMatch[2] === labelMatch[2],
	);
}

function isRawUrlLabel(labelHtml: string): boolean {
	return RAW_URL_LABEL.test(labelHtml.replace(/<[^>]+>/gu, ''));
}

function isAutoLinkWithEmbeddedProse(href: string, labelHtml: string): boolean {
	if (/<[^>]+>/u.test(labelHtml)) return false;
	const label = decodeUrlAttribute(labelHtml.trim());
	if (!RAW_URL_LABEL.test(label) || !PROSE_DELIMITER.test(label)) return false;

	try {
		return new URL(decodeUrlAttribute(href.trim())).href === new URL(label).href;
	} catch {
		return false;
	}
}

function stripTruncatedAnchorTail(_match: string, anchor: string): string {
	ANCHOR.lastIndex = 0;
	const anchorMatch = ANCHOR.exec(anchor);
	if (!anchorMatch) return anchor;
	const label = anchorMatch[6] ?? '';
	return isRawUrlLabel(label) ? ' ' : anchor;
}

function preserveEmbeddedProseBeforeTruncation(match: string, anchor: string): string {
	ANCHOR.lastIndex = 0;
	const anchorMatch = ANCHOR.exec(anchor);
	if (!anchorMatch) return match;
	const href = anchorMatch[2] ?? anchorMatch[3] ?? anchorMatch[4] ?? '';
	const label = anchorMatch[6] ?? '';
	return isAutoLinkWithEmbeddedProse(href, label) ? label : match;
}

export function isSafeLegacyHref(value: string): boolean {
	const href = decodeUrlAttribute(value.trim());
	if (!href || TRUNCATION_MARKER.test(href)) return false;
	if (/\s/u.test(href)) return false;
	if (href.startsWith('#')) return true;

	try {
		const parsed = new URL(href, 'https://bubblenews.today/');
		if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') return true;
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
		const hostname = parsed.hostname;
		return (
			Boolean(hostname) &&
			(hostname.includes('.') || hostname.includes(':') || hostname === 'localhost') &&
			!TRUNCATION_MARKER.test(hostname)
		);
	} catch {
		return false;
	}
}

function isInsideTag(html: string, index: number): boolean {
	return html.lastIndexOf('<', index) > html.lastIndexOf('>', index);
}

function skipTag(html: string, start: number): number {
	let quote = '';
	for (let index = start + 1; index < html.length; index += 1) {
		const character = html[index];
		if (quote) {
			if (character === quote) quote = '';
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === '>') return index + 1;
	}
	return html.length;
}

function placeholderEnd(html: string, afterStart: number): number {
	let depth = 1;
	let firstTruncationEnd = -1;

	for (let index = afterStart; index < html.length; index += 1) {
		if (html[index] === '<') {
			if (BLOCK_END.test(html.slice(index))) return index;
			index = skipTag(html, index) - 1;
			continue;
		}
		if (html[index] === '\n' && firstTruncationEnd < 0) return index;
		if (html[index] === '[') depth += 1;
		if (html[index] === ']') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
		if (firstTruncationEnd < 0 && (html[index] === '…' || /^%e2%80%a6/iu.test(html.slice(index)))) {
			let end = index + (html[index] === '…' ? 1 : 9);
			while (end < html.length && !/[\s<]/u.test(html[end])) end += 1;
			firstTruncationEnd = end;
		}
	}

	// A malformed fragment without a block boundary must not consume the rest
	// of the document. Remove only the marker prefix when no safer end exists.
	return firstTruncationEnd >= 0 ? firstTruncationEnd : afterStart;
}

function stripMediaPlaceholders(html: string): string {
	let result = html;
	let searchFrom = 0;

	while (searchFrom < result.length) {
		const match = MEDIA_PLACEHOLDER_START.exec(result.slice(searchFrom));
		if (!match) break;
		const start = searchFrom + match.index;
		if (isInsideTag(result, start)) {
			searchFrom = start + match[0].length;
			continue;
		}
		const afterStart = start + match[0].length;
		const end = placeholderEnd(result, afterStart);
		result = `${result.slice(0, start)} ${result.slice(end)}`;
		searchFrom = start + 1;
	}

	return result;
}

function stripBareTruncatedUrls(html: string): string {
	return html
		.split(/(<[^>]+>)/gu)
		.map((part, index) => (index % 2 === 0 ? part.replace(BARE_TRUNCATED_URL, ' ') : part))
		.join('');
}

/**
 * Clean transport-only media metadata from historical daily Markdown output.
 * Invalid or upstream-truncated links are unwrapped so they cannot remain
 * clickable, while valid source links and the surrounding article text stay
 * untouched.
 */
export function sanitizeLegacyDailyHtml(html: string): string {
	const withoutMedia = stripMediaPlaceholders(html)
		.replace(TRUNCATED_ANCHOR_TAIL, preserveEmbeddedProseBeforeTruncation)
		.replace(TRUNCATED_ANCHOR_TAIL, stripTruncatedAnchorTail)
		.replace(
			ANCHOR,
			(
				fullMatch,
				_before: string,
				doubleHref: string,
				singleHref: string,
				bareHref: string,
				_after: string,
				label: string,
			) => {
				const href = doubleHref ?? singleHref ?? bareHref ?? '';
				if (isMalformedRepeatedMarkdownAnchor(href, label)) return '';
				if (isAutoLinkWithEmbeddedProse(href, label)) return label;
				if (isSafeLegacyHref(href)) return fullMatch;
				return /^\s*https?:\/\//iu.test(label.replace(/<[^>]+>/gu, '')) ? '' : label;
			},
		)
		.replace(EMPTY_REPEATED_LINK_WRAPPER, ' ');
	return stripBareTruncatedUrls(withoutMedia);
}
