import { describe, expect, it } from 'vitest';

import { commentThreadId } from './threadId';

describe('commentThreadId', () => {
	it('keeps a Chinese canonical route byte-for-byte', () => {
		expect(commentThreadId({ route: '/daily/2025/12/2025-12-30/', locale: 'zh-CN' })).toBe(
			'page:/daily/2025/12/2025-12-30/',
		);
	});

	it('shares the Chinese thread with an English translation', () => {
		expect(
			commentThreadId({
				route: '/en/daily/2025/12/2025-12-30/',
				locale: 'en',
				chineseAlternateRoute: '/daily/2025/12/2025-12-30/',
			}),
		).toBe('page:/daily/2025/12/2025-12-30/');
	});

	it('uses the current English route when no Chinese alternate exists', () => {
		expect(commentThreadId({ route: '/en/notes/example/', locale: 'en' })).toBe(
			'page:/en/notes/example/',
		);
	});

	it.each(['/missing-trailing-slash', 'relative/', '/bad\\route/'])(
		'rejects invalid route %s',
		(route) => {
			expect(() => commentThreadId({ route, locale: 'zh-CN' })).toThrow();
		},
	);
});
