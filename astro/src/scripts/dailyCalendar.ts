/**
 * Client behaviour for the daily archive calendar (DailyArchive.astro).
 *
 * The calendar itself is server-rendered for every month and year; this
 * module only toggles visibility, moves the selection, and re-renders the
 * detail card from the embedded JSON payload. Without JavaScript the day
 * cells remain plain links to each issue.
 */

interface CalendarLabels {
	latestKicker: string;
	issueKicker: string;
	noIssueKicker: string;
	topStory: string;
	readIssue: string;
	noIssue: string;
	goLatest: string;
}

interface CalendarIssue {
	href: string;
	dateLabel: string;
	weekday: string;
	topics: string[];
	headline: string;
	meta: string | null;
}

interface CalendarPayload {
	today: string | null;
	latest: string | null;
	selected: string | null;
	initialMonth: string | null;
	initialYear: string | null;
	labels: CalendarLabels;
	months: Record<string, { title: string; stats: string }>;
	years: Record<string, { title: string; stats: string }>;
	issues: Record<string, CalendarIssue>;
}

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};
const esc = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);

const plainClick = (event: MouseEvent): boolean =>
	event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function initDailyCalendar(): void {
	const root = document.querySelector<HTMLElement>('[data-daily-calendar]');
	if (!root) return;
	const dataEl = root.querySelector('script[data-calendar-json]');
	if (!dataEl?.textContent) return;

	let data: CalendarPayload;
	try {
		data = JSON.parse(dataEl.textContent) as CalendarPayload;
	} catch {
		return;
	}

	const titleEl = root.querySelector<HTMLElement>('[data-cal-title]');
	const statsEl = root.querySelector<HTMLElement>('[data-cal-stats]');
	const monthsWrap = root.querySelector<HTMLElement>('[data-cal-months]');
	const yearsWrap = root.querySelector<HTMLElement>('[data-cal-years]');
	const detail = root.querySelector<HTMLElement>('[data-detail-card]');
	const prevBtn = root.querySelector<HTMLButtonElement>('[data-nav="prev"]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-nav="next"]');
	const todayBtn = root.querySelector<HTMLButtonElement>('[data-nav="today"]');
	const segButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-view]')];
	if (
		!titleEl ||
		!statsEl ||
		!monthsWrap ||
		!yearsWrap ||
		!detail ||
		!prevBtn ||
		!nextBtn ||
		!todayBtn
	) {
		return;
	}

	const monthKeys = Object.keys(data.months).sort();
	const yearKeys = Object.keys(data.years).sort();
	if (monthKeys.length === 0) return;

	let view: 'month' | 'year' = 'month';
	let curMonth = data.initialMonth ?? monthKeys[monthKeys.length - 1]!;
	let curYear = data.initialYear ?? yearKeys[yearKeys.length - 1] ?? curMonth.slice(0, 4);
	let selected = data.selected;
	// The server pre-renders the selected card, so the first user-triggered
	// render is the one that animates.
	let painted = true;

	const locale = root.dataset.locale === 'en' ? 'en' : 'zh-CN';
	const monthDayFmt = new Intl.DateTimeFormat(locale, {
		month: 'long',
		day: 'numeric',
		timeZone: 'Asia/Shanghai',
	});
	const weekdayFmt = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		timeZone: 'Asia/Shanghai',
	});

	function markSelected(): void {
		root!.querySelectorAll('.cell.selected').forEach((el) => el.classList.remove('selected'));
		if (view !== 'month' || !selected) return;
		monthsWrap!.querySelector(`.cell[data-date="${selected}"]`)?.classList.add('selected');
	}

	function syncChrome(): void {
		const meta = view === 'month' ? data.months[curMonth] : data.years[curYear];
		if (meta) {
			titleEl!.textContent = meta.title;
			statsEl!.textContent = meta.stats;
		}
		prevBtn!.disabled =
			view === 'month' ? curMonth === monthKeys[0] : curYear === yearKeys[0];
		nextBtn!.disabled =
			view === 'month'
				? curMonth === monthKeys[monthKeys.length - 1]
				: curYear === yearKeys[yearKeys.length - 1];
		monthsWrap!.hidden = view !== 'month';
		yearsWrap!.hidden = view !== 'year';
		monthsWrap!.querySelectorAll<HTMLElement>('[data-month]').forEach((el) => {
			el.hidden = view !== 'month' || el.dataset.month !== curMonth;
		});
		yearsWrap!.querySelectorAll<HTMLElement>('[data-year]').forEach((el) => {
			el.hidden = view !== 'year' || el.dataset.year !== curYear;
		});
		segButtons.forEach((btn) =>
			btn.setAttribute('aria-pressed', String((btn.dataset.view ?? 'month') === view)),
		);
		markSelected();
	}

	function cardHtml(dateKey: string): string {
		const issue = data.issues[dateKey];
		if (!issue) {
			const date = new Date(`${dateKey}T00:00:00+08:00`);
			return `<p class="detail-kicker">${esc(data.labels.noIssueKicker)}</p>
				<p class="detail-date">${esc(monthDayFmt.format(date))}<span class="weekday">${esc(weekdayFmt.format(date))}</span></p>
				<div class="detail-body">
					<p class="detail-empty">${esc(data.labels.noIssue)}</p>
					<button type="button" class="detail-cta" data-go-latest>${esc(data.labels.goLatest)}</button>
				</div>`;
		}
		const kicker =
			dateKey === data.latest ? data.labels.latestKicker : data.labels.issueKicker;
		const topics = issue.topics.length
			? `<ul class="detail-topics">${issue.topics.map((topic) => `<li>${esc(topic)}</li>`).join('')}</ul>`
			: '';
		const meta = issue.meta ? `<p class="detail-meta">${esc(issue.meta)}</p>` : '';
		return `<p class="detail-kicker">${esc(kicker)}</p>
			<p class="detail-date">${esc(issue.dateLabel)}<span class="weekday">${esc(issue.weekday)}</span></p>
			${topics}
			<div class="detail-body">
				<p class="detail-label">${esc(data.labels.topStory)}</p>
				<p class="detail-headline">${esc(issue.headline)}</p>
				${meta}
				<a class="detail-cta" href="${issue.href}">${esc(data.labels.readIssue)}</a>
			</div>`;
	}

	function renderDetail(dateKey: string): void {
		const paint = () => {
			detail!.innerHTML = cardHtml(dateKey);
			detail!.classList.remove('fading');
			painted = true;
		};
		if (painted) {
			detail!.classList.add('fading');
			window.setTimeout(paint, 120);
		} else {
			paint();
		}
	}

	function select(dateKey: string): void {
		selected = dateKey;
		markSelected();
		renderDetail(dateKey);
	}

	monthsWrap.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		const link = target.closest<HTMLAnchorElement>('a.cell[data-date]');
		if (link) {
			if (!plainClick(event)) return;
			event.preventDefault();
			select(link.dataset.date!);
			return;
		}
		const cell = target.closest<HTMLElement>('span.cell[data-date]');
		if (cell) select(cell.dataset.date!);
	});

	yearsWrap.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		const mini = target.closest<HTMLElement>('.mini-month[data-month]');
		if (!mini || mini.classList.contains('empty') || !mini.dataset.month) return;
		const mc = target.closest<HTMLAnchorElement>('a.mc[data-date]');
		if (mc && !plainClick(event)) return;
		if (mc) event.preventDefault();
		curMonth = mini.dataset.month;
		view = 'month';
		if (mc?.dataset.date) selected = mc.dataset.date;
		syncChrome();
		if (mc?.dataset.date) renderDetail(selected!);
	});

	segButtons.forEach((btn) =>
		btn.addEventListener('click', () => {
			const nextView = btn.dataset.view === 'year' ? 'year' : 'month';
			if (nextView === view) return;
			view = nextView;
			if (view === 'year') curYear = curMonth.slice(0, 4);
			syncChrome();
		}),
	);

	const shift = (delta: number): void => {
		if (view === 'month') {
			const index = monthKeys.indexOf(curMonth);
			if (monthKeys[index + delta]) curMonth = monthKeys[index + delta]!;
		} else {
			const index = yearKeys.indexOf(curYear);
			if (yearKeys[index + delta]) curYear = yearKeys[index + delta]!;
		}
		syncChrome();
	};
	prevBtn.addEventListener('click', () => shift(-1));
	nextBtn.addEventListener('click', () => shift(1));

	const jumpToLatest = (): void => {
		view = 'month';
		curMonth = data.initialMonth ?? curMonth;
		curYear = data.initialYear ?? curYear;
		selected = data.selected;
		syncChrome();
		if (selected) renderDetail(selected);
	};
	todayBtn.addEventListener('click', jumpToLatest);
	detail.addEventListener('click', (event) => {
		if ((event.target as HTMLElement).closest('[data-go-latest]')) jumpToLatest();
	});

	syncChrome();
}

document.addEventListener('astro:page-load', initDailyCalendar);
