import type { KnowledgeSearchIndex, KnowledgeSearchItem } from '../lib/searchIndex';

export function normalizeCommandQuery(value: string): string {
	return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function scoreCommandItem(item: KnowledgeSearchItem, query: string): number {
	const title = normalizeCommandQuery(item.title);
	const section = normalizeCommandQuery(item.section_label);
	const searchText = normalizeCommandQuery(item.search_text);
	if (title === query) return 100;
	if (title.startsWith(query)) return 80;
	if (title.includes(query)) return 60;
	if (section.includes(query)) return 40;
	if (searchText.includes(query)) return 20;
	return 0;
}

export function commandSearchMatches(
	items: KnowledgeSearchItem[],
	query: string,
	limit = 7,
): KnowledgeSearchItem[] {
	const normalized = normalizeCommandQuery(query);
	if (!normalized) return items.slice(0, limit);
	return items
		.map((item, index) => ({ item, index, score: scoreCommandItem(item, normalized) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, limit)
		.map(({ item }) => item);
}

const cachedIndexes = new Map<string, Promise<KnowledgeSearchIndex>>();
let cleanupCommandSearch: (() => void) | null = null;

function createResultRow(item: KnowledgeSearchItem, index: number): HTMLAnchorElement {
	const row = document.createElement('a');
	row.className = 'command-search-result';
	row.href = item.href;
	row.setAttribute('role', 'option');
	row.setAttribute('aria-selected', 'false');

	const number = document.createElement('span');
	number.className = 'command-search-result-index';
	number.textContent = String(index + 1).padStart(2, '0');

	const body = document.createElement('span');
	body.className = 'command-search-result-body';
	const section = document.createElement('span');
	section.className = 'command-search-result-section';
	section.textContent = item.section_label;
	const title = document.createElement('strong');
	title.className = 'command-search-result-title';
	title.textContent = item.title;
	body.append(section, title);
	if (item.summary) {
		const summary = document.createElement('span');
		summary.className = 'command-search-result-summary';
		summary.textContent = item.summary;
		body.append(summary);
	}

	const date = document.createElement('time');
	date.className = 'command-search-result-date';
	date.textContent = item.date?.slice(0, 7) ?? '—';
	if (item.date) date.dateTime = item.date;
	row.append(number, body, date);
	return row;
}

function initCommandSearch(): void {
	cleanupCommandSearch?.();
	const dialog = document.querySelector<HTMLDialogElement>('[data-command-search]');
	if (!dialog) return;
	const triggers = [
		...document.querySelectorAll<HTMLAnchorElement>('[data-command-search-trigger]'),
	];
	const input = dialog.querySelector<HTMLInputElement>('[data-command-search-input]');
	const form = dialog.querySelector<HTMLFormElement>('[data-command-search-form]');
	const results = dialog.querySelector<HTMLElement>('[data-command-search-results]');
	const state = dialog.querySelector<HTMLElement>('[data-command-search-state]');
	const close = dialog.querySelector<HTMLButtonElement>('[data-command-search-close]');
	const controller = new AbortController();
	const { signal } = controller;
	let index: KnowledgeSearchIndex | null = null;
	let activeIndex = -1;
	let restoreFocus: HTMLElement | null = null;

	const labels =
		dialog.dataset.locale === 'en'
			? {
					recent: 'Recently added',
					results: 'Search results',
					empty: 'No matching knowledge found.',
					error: 'The quick search is unavailable. Open the full search page instead.',
				}
			: {
					recent: '最近收录',
					results: '搜索结果',
					empty: '没有找到匹配的知识内容。',
					error: '快捷搜索暂时不可用，请打开完整搜索页。',
				};

	const resultRows = () => [
		...(results?.querySelectorAll<HTMLAnchorElement>('[role="option"]') ?? []),
	];
	const setActive = (next: number) => {
		const rows = resultRows();
		if (rows.length === 0 || next < 0) {
			activeIndex = -1;
			rows.forEach((row) => {
				row.classList.remove('is-active');
				row.setAttribute('aria-selected', 'false');
			});
			return;
		}
		activeIndex = (next + rows.length) % rows.length;
		rows.forEach((row, rowIndex) => {
			const active = rowIndex === activeIndex;
			row.classList.toggle('is-active', active);
			row.setAttribute('aria-selected', String(active));
		});
		rows[activeIndex]?.scrollIntoView({ block: 'nearest' });
	};

	const render = () => {
		if (!index || !input || !results || !state) return;
		const matches = commandSearchMatches(index.items, input.value);
		results.replaceChildren(...matches.map(createResultRow));
		state.querySelector('span')!.textContent = input.value.trim() ? labels.results : labels.recent;
		state.querySelector('p')!.textContent = matches.length === 0 ? labels.empty : '';
		state.hidden = matches.length > 0 && input.value.trim().length > 0;
		setActive(input.value.trim() && matches.length > 0 ? 0 : -1);
	};

	const load = async () => {
		if (index) return index;
		const indexUrl = dialog.dataset.indexUrl;
		if (!indexUrl) throw new Error('Missing command search index URL');
		let request = cachedIndexes.get(indexUrl);
		if (!request) {
			request = fetch(indexUrl, { headers: { Accept: 'application/json' } }).then((response) => {
				if (!response.ok) throw new Error(`Search index returned ${response.status}`);
				return response.json() as Promise<KnowledgeSearchIndex>;
			});
			cachedIndexes.set(indexUrl, request);
		}
		index = await request;
		render();
		return index;
	};

	const open = (trigger?: HTMLElement) => {
		restoreFocus =
			trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		if (!dialog.open) dialog.showModal();
		input?.focus();
		void load().catch(() => {
			if (!state) return;
			state.hidden = false;
			state.querySelector('span')!.textContent = labels.results;
			state.querySelector('p')!.textContent = labels.error;
		});
	};

	for (const trigger of triggers) {
		trigger.addEventListener(
			'click',
			(event) => {
				if (typeof dialog.showModal !== 'function') return;
				event.preventDefault();
				open(trigger);
			},
			{ signal },
		);
	}

	document.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Escape' && dialog.open) {
				event.preventDefault();
				dialog.close();
				return;
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
				event.preventDefault();
				if (dialog.open) dialog.close();
				else open();
			}
		},
		{ signal },
	);

	input?.addEventListener('input', render, { signal });
	input?.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setActive(activeIndex + 1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				setActive(activeIndex - 1);
			} else if (event.key === 'Enter' && activeIndex >= 0) {
				event.preventDefault();
				resultRows()[activeIndex]?.click();
			}
		},
		{ signal },
	);

	form?.addEventListener(
		'submit',
		(event) => {
			event.preventDefault();
			const target = new URL(dialog.dataset.searchHref ?? '/search/', window.location.origin);
			if (input?.value.trim()) target.searchParams.set('q', input.value.trim());
			window.location.assign(`${target.pathname}${target.search}`);
		},
		{ signal },
	);

	close?.addEventListener('click', () => dialog.close(), { signal });
	dialog.addEventListener(
		'click',
		(event) => {
			if (event.target !== dialog) return;
			const bounds = dialog.getBoundingClientRect();
			const inside =
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom;
			if (!inside) dialog.close();
		},
		{ signal },
	);
	dialog.addEventListener(
		'close',
		() => {
			activeIndex = -1;
			restoreFocus?.focus();
		},
		{ signal },
	);

	cleanupCommandSearch = () => controller.abort();
}

if (typeof document !== 'undefined') {
	document.addEventListener('astro:page-load', initCommandSearch);
	initCommandSearch();
}
