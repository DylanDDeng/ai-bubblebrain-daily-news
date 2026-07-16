import { afterEach, describe, expect, it, vi } from 'vitest';

import { callbackUrl, safeRelativeNext } from './redirect';

afterEach(() => vi.unstubAllGlobals());

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

	it('uses the single production-allowlisted callback', () => {
		vi.stubGlobal('window', { location: { origin: 'https://bubblenews.today' } });
		expect(callbackUrl()).toBe('https://bubblenews.today/auth/callback/');
	});
});
