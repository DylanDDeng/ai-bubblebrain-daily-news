/**
 * Grid math behind the daily archive calendar views. Pure date utilities,
 * shared by the server-rendered markup (DailyArchive.astro) and covered by
 * unit tests; no DOM or Astro APIs involved.
 */

export const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Days in a Gregorian month; `month` is 1-based. UTC math keeps the build
 * machine's timezone out of the grid. */
export const daysInMonth = (year: number, month: number): number =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Leading blanks before the 1st of the month in a Monday-first grid. */
export const mondayFirstLead = (year: number, month: number): number =>
	(new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

export interface GridCell {
	kind: 'adjacent' | 'day';
	day: number;
	/** YYYY-MM-DD for `day` cells, null for adjacent-month filler cells. */
	dateKey: string | null;
}

/** Full Monday-first month grid: leading/trailing adjacent-month filler
 * cells included, length always a multiple of 7. */
export function buildMonthGrid(year: number, month: number): GridCell[] {
	const lead = mondayFirstLead(year, month);
	const total = daysInMonth(year, month);
	const prevTotal = daysInMonth(year, month - 1);
	const cells: GridCell[] = [];
	for (let i = lead - 1; i >= 0; i--) {
		cells.push({ kind: 'adjacent', day: prevTotal - i, dateKey: null });
	}
	for (let day = 1; day <= total; day++) {
		cells.push({ kind: 'day', day, dateKey: `${year}-${pad2(month)}-${pad2(day)}` });
	}
	const trailing = (7 - (cells.length % 7)) % 7;
	for (let day = 1; day <= trailing; day++) {
		cells.push({ kind: 'adjacent', day, dateKey: null });
	}
	return cells;
}

/** Normalizes item counts to a 0–1 heat value. `null` (unknown count) maps
 * to 0; when every count is unknown the scale is uniformly 0. */
export function heatScale(counts: (number | null)[]): (count: number | null) => number {
	let peak = 0;
	for (const count of counts) {
		if (count !== null && count > peak) peak = count;
	}
	return (count) => (count === null || peak <= 0 ? 0 : count / peak);
}

/** Longest run of consecutive calendar days in a list of YYYY-MM-DD keys
 * (any order, duplicates tolerated). */
export function longestIssueStreak(dateKeys: string[]): number {
	let best = 0;
	let streak = 0;
	let previous: string | null = null;
	for (const key of [...dateKeys].sort()) {
		if (key === previous) continue;
		if (previous !== null) {
			const expected = new Date(Date.parse(`${previous}T00:00:00Z`) + 86_400_000)
				.toISOString()
				.slice(0, 10);
			streak = key === expected ? streak + 1 : 1;
		} else {
			streak = 1;
		}
		if (streak > best) best = streak;
		previous = key;
	}
	return best;
}
