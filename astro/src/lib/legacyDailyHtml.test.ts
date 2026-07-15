import { describe, expect, it } from 'vitest';

import { isSafeLegacyHref, sanitizeLegacyDailyHtml } from './legacyDailyHtml';

describe('legacy daily HTML sanitization', () => {
	it('removes complete image metadata without dropping the surrounding summary', () => {
		const html =
			'<li>摘要前文 [图片: image.png <a href="https://img.example/a.png">https://img.example/a.png</a>] 摘要后文</li>';

		expect(sanitizeLegacyDailyHtml(html)).toBe('<li>摘要前文   摘要后文</li>');
	});

	it('drops an upstream-truncated image marker through the current block boundary', () => {
		const html =
			'<li>摘要前文 [图片: openai <a href="https://pic.chinaz%E2%80%A6%E2%80%A6">https://pic.chinaz……</a></li><li>下一条</li>';

		const result = sanitizeLegacyDailyHtml(html);
		expect(result).toBe('<li>摘要前文  </li><li>下一条</li>');
		expect(result).not.toContain('href=');
	});

	it('removes nested image and video transport metadata', () => {
		const html =
			'<li>前文 [图片: [P] preview [P] <a href="https://img.example/a.png">image</a>] 中段 [视频: <a href="https://video.example/a.mp4">video</a>] 后文</li>';
		expect(sanitizeLegacyDailyHtml(html)).toBe('<li>前文   中段   后文</li>');
	});

	it('never removes the following block after an unclosed marker', () => {
		const html = '<li>前文 [视频: https://video.example/truncated……</li><li>下一条 sentinel</li>';
		const result = sanitizeLegacyDailyHtml(html);
		expect(result).toContain('<li>下一条 sentinel</li>');
		expect(result).not.toContain('[视频:');
		expect(result).not.toContain('video.example');
	});

	it('removes bare truncated URLs without deleting adjacent prose', () => {
		const html = '<p>前文 https://preview.example/a?token=abc…… 后文</p>';
		expect(sanitizeLegacyDailyHtml(html)).toBe('<p>前文   后文</p>');
	});

	it('removes a truncation tail left outside an auto-linked URL', () => {
		const html =
			'<p>前文 <a href="https://x.com/example/status/123">https://x.com/example/status/123</a>?… 后文 <a href="https://ggemu">https://ggemu</a>…</p>';
		const result = sanitizeLegacyDailyHtml(html);
		expect(result).toContain(
			'<a href="https://x.com/example/status/123">https://x.com/example/status/123</a>',
		);
		expect(result).not.toContain('?…');
		expect(result).not.toContain('https://ggemu');
	});

	it('unwraps invalid links outside image metadata and preserves valid links', () => {
		const html =
			'<p><a href="https://%E2%80%A6%E2%80%A6">截断链接</a> <a href="https://example.com/a?x=1&amp;y=2">有效链接</a></p>';

		const result = sanitizeLegacyDailyHtml(html);
		expect(result).toContain('截断链接');
		expect(result).not.toContain('https://%E2%80%A6');
		expect(result).toContain('href="https://example.com/a?x=1&amp;y=2"');
	});

	it('handles single-quoted and unquoted href attributes', () => {
		const html =
			"<p><a href='javascript:alert(1)'>危险</a> <a href=https://bad.example/……>截断</a> <a href=../daily/>相对链接</a></p>";
		const result = sanitizeLegacyDailyHtml(html);
		expect(result).toContain('危险');
		expect(result).toContain('截断');
		expect(result).not.toContain('javascript:');
		expect(result).not.toContain('bad.example');
		expect(result).toContain('<a href=../daily/>相对链接</a>');
	});

	it('removes an upstream URL duplicated as an escaped Markdown link', () => {
		const html =
			'<p>前文 ([ <a href="https://example.com/story%5D(https://example.com/story)">https://example.com/story](https://example.com/story)</a> ) 后文</p>';
		expect(sanitizeLegacyDailyHtml(html)).toBe('<p>前文   后文</p>');
	});

	it('removes mismatched duplicated Markdown URLs instead of choosing a target', () => {
		const html =
			'<p><a href="https://first.example/story%5D(https://second.example/target)">https://first.example/story](https://second.example/target)</a></p>';
		expect(sanitizeLegacyDailyHtml(html)).toBe('<p></p>');
	});

	it('removes a malformed repeated Markdown anchor whose first URL has a query', () => {
		const html =
			'<p><a href="https://first.example/story?x=1%5D(https://second.example/target)">https://first.example/story?x=1](https://second.example/target)</a></p>';
		expect(sanitizeLegacyDailyHtml(html)).toBe('<p></p>');
	});

	it('preserves a legitimate encoded query when the anchor label is ordinary text', () => {
		const html =
			'<p><a href="https://example.com/redirect?value=%5D(https://other.example)">合法跳转</a></p>';
		expect(sanitizeLegacyDailyHtml(html)).toBe(html);
	});

	it.each([
		['https://example.com/story', true],
		['https://ggemu', false],
		['/daily/', true],
		['../daily/', true],
		['mailto:hello@example.com', true],
		['javascript:alert(1)', false],
		['https://upload.chinaz……', false],
		['https://%E2%80%A6%E2%80%A6', false],
		['https://example.com/story%5D(https://example.com/story)', true],
		['https://example.com/redirect?value=%5D(https://other.example)', true],
		['not a URL', false],
	])('classifies %s', (href, expected) => {
		expect(isSafeLegacyHref(href)).toBe(expected);
	});
});
