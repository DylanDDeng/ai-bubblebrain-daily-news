import { describe, expect, it } from 'vitest';

import { safeRelativeNext } from './redirect';

describe('safeRelativeNext', () => {
	it('keeps safe relative paths, queries, and fragments', () => {
		expect(safeRelativeNext('/daily/2026/07/2026-07-16/?q=ai#discussion')).toBe(
			'/daily/2026/07/2026-07-16/?q=ai#discussion',
		);
	});

	it.each([
		'https://evil.example/',
		'//evil.example/',
		'/\\evil',
		'/%2fevil.example',
		'/%5cevil',
		'/safe%0d%0aLocation:evil',
	])('rejects unsafe next value %s', (value) => {
		expect(safeRelativeNext(value, '/fallback/')).toBe('/fallback/');
	});
});
