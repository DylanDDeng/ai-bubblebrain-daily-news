const setupVibeCodingPatternPager = () => {
	document.querySelectorAll('[data-pattern-pager]').forEach((root) => {
		if (root.dataset.pagerMounted === 'true') return;
		root.dataset.pagerMounted = 'true';

		const pages = Array.from(root.querySelectorAll('.vibe-pattern-page'));
		if (pages.length < 2) return;

		const prevBtn = root.querySelector('.vibe-pager-prev');
		const nextBtn = root.querySelector('.vibe-pager-next');
		const nameEl = root.querySelector('.vibe-pager-name');
		const countEl = root.querySelector('.vibe-pager-count');
		const ownerSection = root.closest('.vibe-term-category');
		let index = Math.max(0, pages.findIndex((page) => !page.hidden));
		let currentAnimation = null;

		const prefersReducedMotion = () =>
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const pad = (value) => String(value).padStart(2, '0');

		// 方向感知的滑入动画：下一页从右进，上一页从左进
		const animateIn = (direction) => {
			const target = pages[index];
			if (currentAnimation) currentAnimation.cancel();
			if (prefersReducedMotion() || typeof target.animate !== 'function') return;
			currentAnimation = target.animate(
				[
					{ opacity: 0, transform: `translateX(${direction === 'forward' ? 28 : -28}px)` },
					{ opacity: 1, transform: 'translateX(0)' },
				],
				{
					duration: 320,
					easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
				},
			);
		};

		const render = (direction) => {
			pages.forEach((page, i) => {
				page.hidden = i !== index;
			});
			const name = pages[index].dataset.pageName || '';
			if (nameEl) nameEl.textContent = name;
			if (countEl) countEl.textContent = `${pad(index + 1)} / ${pad(pages.length)}`;
			if (prevBtn instanceof HTMLButtonElement) prevBtn.disabled = index === 0;
			if (nextBtn instanceof HTMLButtonElement) nextBtn.disabled = index === pages.length - 1;
			animateIn(direction);
		};

		const goTo = (nextIndex, direction) => {
			const clamped = Math.min(pages.length - 1, Math.max(0, nextIndex));
			if (clamped === index) return;
			index = clamped;
			render(direction);
		};

		prevBtn?.addEventListener('click', () => goTo(index - 1, 'backward'));
		nextBtn?.addEventListener('click', () => goTo(index + 1, 'forward'));

		// 深链兼容：URL hash 指向当前分类里的某个术语时，自动翻到它所在的一页
		const gotoTermInHash = () => {
			const rawHash = location.hash.slice(1);
			if (!rawHash) return;
			let hash;
			try {
				hash = decodeURIComponent(rawHash);
			} catch {
				return;
			}
			if (!ownerSection || ownerSection.hidden) return;
			const target = pages.findIndex((page) => {
				try {
					return page.querySelector(`#${CSS.escape(hash)}`) !== null;
				} catch {
					return false;
				}
			});
			if (target < 0 || target === index) return;
			goTo(target, target > index ? 'forward' : 'backward');
		};
		window.addEventListener('hashchange', () => window.setTimeout(gotoTermInHash, 0));
		gotoTermInHash();

		// 图鉴区可见时支持键盘 ← → 翻页；焦点在输入控件时不抢占
		document.addEventListener('keydown', (event) => {
			if (!ownerSection || ownerSection.hidden) return;
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			const active = document.activeElement;
			if (
				active instanceof HTMLElement &&
				(active.tagName === 'INPUT' ||
					active.tagName === 'TEXTAREA' ||
					active.tagName === 'SELECT' ||
					active.isContentEditable)
			) {
				return;
			}
			if (event.key === 'ArrowRight') goTo(index + 1, 'forward');
			else goTo(index - 1, 'backward');
		});

		render('forward');
	});
};

setupVibeCodingPatternPager();
document.addEventListener('astro:page-load', setupVibeCodingPatternPager);
document.addEventListener('astro:after-swap', setupVibeCodingPatternPager);
