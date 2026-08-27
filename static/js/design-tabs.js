const setupDesignTabs = () => {
	const root = document.querySelector('[data-design-index]');
	if (!root || root.dataset.tabsMounted === 'true') return;

	root.dataset.tabsMounted = 'true';
	const sections = Array.from(root.querySelectorAll('.design-index-grid'));
	const chips = Array.from(root.querySelectorAll('.design-group-nav a'));
	const ids = sections.map((section) => section.id);

	const apply = () => {
		const hash = decodeURIComponent(location.hash.slice(1));
		const target = ids.includes(hash) ? hash : ids[0];

		for (const section of sections) section.hidden = section.id !== target;
		for (const chip of chips) {
			chip.classList.toggle('is-active', chip.getAttribute('href') === `#${target}`);
		}
	};

	window.__designTabsApply = apply;
	apply();
	for (const chip of chips) {
		chip.addEventListener('click', () => {
			window.setTimeout(() => window.__designTabsApply?.(), 0);
		});
	}
};

setupDesignTabs();
document.addEventListener('astro:page-load', setupDesignTabs);
document.addEventListener('astro:after-swap', setupDesignTabs);

if (window.__designTabsGlobalBound !== true) {
	window.__designTabsGlobalBound = true;
	const applyDesignTabs = () => {
		window.setTimeout(() => window.__designTabsApply?.(), 0);
	};
	window.addEventListener('hashchange', applyDesignTabs);
	window.addEventListener('popstate', applyDesignTabs);
}
