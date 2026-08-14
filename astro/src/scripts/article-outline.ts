let cleanupOutline = () => {};

function setupArticleTables(): void {
	const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');

	for (const table of document.querySelectorAll<HTMLTableElement>('.article-content table')) {
		if (table.parentElement?.classList.contains('article-table-scroll')) continue;

		const wrapper = document.createElement('div');
		wrapper.className = 'article-table-scroll';
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'region');
		wrapper.setAttribute(
			'aria-label',
			isEnglish ? 'Scrollable article table' : '可横向滚动的文章表格',
		);

		table.before(wrapper);
		wrapper.append(table);
	}
}

function setupArticleOutline(): void {
	cleanupOutline();

	const outline = document.querySelector<HTMLElement>('[data-article-outline]');
	if (!outline) return;

	const links = [...outline.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
	const entries = links
		.map((link) => {
			const id = decodeURIComponent(link.hash.slice(1));
			const heading = document.getElementById(id);
			return heading ? { link, heading } : null;
		})
		.filter((entry): entry is { link: HTMLAnchorElement; heading: HTMLElement } => entry !== null);

	if (entries.length === 0) return;

	let frame = 0;
	const update = () => {
		frame = 0;
		const readingLine = window.scrollY + Math.min(180, window.innerHeight * 0.24);
		let active = entries[0];
		for (const entry of entries) {
			if (entry.heading.offsetTop > readingLine) break;
			active = entry;
		}
		for (const entry of entries) {
			const isActive = entry === active;
			entry.link.classList.toggle('is-active', isActive);
			if (isActive) entry.link.setAttribute('aria-current', 'location');
			else entry.link.removeAttribute('aria-current');
		}
	};
	const scheduleUpdate = () => {
		if (frame === 0) frame = window.requestAnimationFrame(update);
	};

	for (const entry of entries) entry.link.addEventListener('click', scheduleUpdate);
	window.addEventListener('scroll', scheduleUpdate, { passive: true });
	window.addEventListener('resize', scheduleUpdate, { passive: true });
	update();

	cleanupOutline = () => {
		if (frame !== 0) window.cancelAnimationFrame(frame);
		for (const entry of entries) entry.link.removeEventListener('click', scheduleUpdate);
		window.removeEventListener('scroll', scheduleUpdate);
		window.removeEventListener('resize', scheduleUpdate);
	};
}

document.addEventListener('astro:page-load', setupArticleOutline);
document.addEventListener('astro:page-load', setupArticleTables);
setupArticleOutline();
setupArticleTables();
