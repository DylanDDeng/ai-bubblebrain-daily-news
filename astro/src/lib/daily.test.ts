import { describe, expect, it } from 'vitest';

import { dailyPermalink, parseDailyEntryId } from './daily';

describe('daily entry identity', () => {
	it('parses a Chinese daily entry', () => {
		expect(parseDailyEntryId('2026-07-14')).toEqual({
			dateKey: '2026-07-14',
			year: '2026',
			month: '07',
			day: '14',
			locale: 'zh-CN',
		});
	});

	it('parses an English daily entry', () => {
		expect(parseDailyEntryId('2025-12-22.en')?.locale).toBe('en');
		expect(dailyPermalink('2025-12-22.en')).toBe('/en/daily/2025/12/2025-12-22/');
	});

	it('rejects malformed and impossible dates', () => {
		expect(parseDailyEntryId('202-22.en')).toBeNull();
		expect(parseDailyEntryId('2026-02-30')).toBeNull();
	});
});
