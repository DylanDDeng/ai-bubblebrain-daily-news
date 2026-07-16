const root = document.documentElement;
const saved = localStorage.getItem('bb-theme');
root.dataset.theme = saved === 'dark' || saved === 'light' ? saved : 'light';

function syncThemeIcons(): void {
	for (const icon of document.querySelectorAll<HTMLElement>('[data-theme-icon]')) {
		icon.className = root.dataset.theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
	}
}

for (const toggle of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
	toggle.addEventListener('click', () => {
		const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
		root.dataset.theme = next;
		localStorage.setItem('bb-theme', next);
		syncThemeIcons();
	});
}
syncThemeIcons();

const menuButton = document.querySelector<HTMLButtonElement>('.mobile-nav-toggle');
const menu = document.querySelector<HTMLElement>('#rail-menu');
menuButton?.addEventListener('click', () => {
	const expanded = menuButton.getAttribute('aria-expanded') === 'true';
	menuButton.setAttribute('aria-expanded', String(!expanded));
	menu?.classList.toggle('is-open', !expanded);
});
