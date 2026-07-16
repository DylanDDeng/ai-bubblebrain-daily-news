(() => {
	const root = document.querySelector('[data-directory-page]');
	if (!root) return;
	const input = root.querySelector('[data-directory-query]');
	const items = Array.from(root.querySelectorAll('[data-directory-item]'));
	const empty = root.querySelector('[data-directory-empty]');
	if (!(input instanceof HTMLInputElement)) return;
	const apply = () => {
		const query = input.value.trim().toLocaleLowerCase(document.documentElement.lang || 'zh-CN');
		let visible = 0;
		for (const item of items) {
			const match = !query || (item.getAttribute('data-search') || '').includes(query);
			item.hidden = !match;
			if (match) visible += 1;
		}
		if (empty instanceof HTMLElement) empty.hidden = visible !== 0;
	};
	input.addEventListener('input', apply);
})();
