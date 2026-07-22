import { describe, expect, it } from 'vitest';

import {
	buildMonthGrid,
	daysInMonth,
	heatScale,
	longestIssueStreak,
	mondayFirstLead,
} from './dailyCalendar';

describe('daysInMonth', () => {
	it('handles 31/30/28/29-day months', () => {
		expect(daysInMonth(2026, 7)).toBe(31);
		expect(daysInMonth(2026, 6)).toBe(30);
		expect(daysInMonth(2026, 2)).toBe(28);
		expect(daysInMonth(2024, 2)).toBe(29);
	});
});

describe('mondayFirstLead', () => {
	it('is timezone-independent weekday math', () => {
		// 2026-07-01 is a Wednesday → two leading blanks (Mon, Tue).
		expect(mondayFirstLead(2026, 7)).toBe(2);
		// 2026-06-01 is a Monday → no leading blanks.
		expect(mondayFirstLead(2026, 6)).toBe(0);
		// 2026-02-01 is a Sunday → six leading blanks.
		expect(mondayFirstLead(2026, 2)).toBe(6);
	});
});

describe('buildMonthGrid', () => {
	it('produces full weeks with adjacent-month fillers', () => {
		const cells = buildMonthGrid(2026, 7);
		expect(cells.length % 7).toBe(0);
		expect(cells.length).toBe(35);
		expect(cells[0]).toEqual({ kind: 'adjacent', day: 29, dateKey: null });
		expect(cells[1]).toEqual({ kind: 'adjacent', day: 30, dateKey: null });
		expect(cells[2]).toEqual({ kind: 'day', day: 1, dateKey: '2026-07-01' });
		expect(cells.at(-1)).toEqual({ kind: 'adjacent', day: 2, dateKey: null });
	});

	it('covers every day of the month exactly once', () => {
		const days = buildMonthGrid(2026, 2)
			.filter((cell) => cell.kind === 'day')
			.map((cell) => cell.day);
		expect(days).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
	});
});

describe('heatScale', () => {
	it('normalizes against the peak count', () => {
		const scale = heatScale([65, 295, null]);
		expect(scale(295)).toBe(1);
		expect(scale(65)).toBeCloseTo(65 / 295);
		expect(scale(null)).toBe(0);
	});

	it('degrades to zero when every count is unknown', () => {
		const scale = heatScale([null, null]);
		expect(scale(null)).toBe(0);
	});
});

describe('longestIssueStreak', () => {
	it('counts consecutive calendar days across month boundaries', () => {
		expect(
			longestIssueStreak(['2026-07-01', '2026-06-29', '2026-06-30', '2026-07-15']),
		).toBe(3);
	});

	it('resets after a gap and tolerates duplicates', () => {
		expect(
			longestIssueStreak(['2026-07-02', '2026-07-01', '2026-07-01', '2026-07-04', '2026-07-05']),
		).toBe(2);
	});

	it('handles empty input', () => {
		expect(longestIssueStreak([])).toBe(0);
	});
});
