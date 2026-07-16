import {
	bootAuth,
	authSnapshot,
	signInWithGoogle,
	signOut,
	subscribeAuth,
	type AuthState,
} from '../lib/auth/authStore';

function text(element: Element | null, value: string): void {
	if (element) element.textContent = value;
}

function localeCopy(locale: 'zh-CN' | 'en') {
	return locale === 'en'
		? {
				account: 'Account',
				login: 'Sign in',
				ready: 'Signed in',
				anonymous: 'Not signed in',
				loading: 'Checking session…',
				error: 'Account unavailable',
				serviceError: 'Account service is temporarily unavailable. Please retry.',
				profileError: 'Your profile is not ready yet. Please retry.',
			}
		: {
				account: '账户',
				login: '登录',
				ready: '已登录',
				anonymous: '尚未登录',
				loading: '正在检查登录状态…',
				error: '账户暂不可用',
				serviceError: '账户服务暂时不可用，请重试。',
				profileError: '账户资料尚未准备完成，请重试。',
			};
}

function render(root: HTMLElement, state: AuthState): void {
	const locale = root.dataset.locale === 'en' ? 'en' : 'zh-CN';
	const copy = localeCopy(locale);
	const trigger = root.querySelector<HTMLButtonElement>('[data-auth-trigger]');
	const login = root.querySelector<HTMLButtonElement>('[data-auth-login]');
	const logout = root.querySelector<HTMLButtonElement>('[data-auth-signout]');
	const retry = root.querySelector<HTMLButtonElement>('[data-auth-retry]');
	const label = root.querySelector('[data-auth-label]');
	const detail = root.querySelector('[data-auth-detail]');
	const avatar = root.querySelector('[data-auth-avatar]');
	if (trigger)
		trigger.ariaBusy = String(
			['booting', 'redirecting', 'authenticated', 'provisioning_profile', 'signing_out'].includes(
				state.status,
			),
		);
	if (login) login.hidden = state.status !== 'anonymous';
	if (logout) logout.hidden = state.status !== 'ready';
	if (retry) retry.hidden = state.status !== 'recoverable_error';

	if (state.status === 'ready') {
		const name = state.profile?.display_name ?? state.user?.email ?? copy.ready;
		text(label, name);
		text(detail, state.user?.email ?? copy.ready);
		text(avatar, name.trim().slice(0, 1).toLocaleUpperCase(locale));
	} else if (state.status === 'anonymous') {
		text(label, copy.login);
		text(detail, copy.anonymous);
		text(avatar, '○');
	} else if (state.status === 'recoverable_error') {
		text(label, copy.error);
		text(detail, state.error?.includes('Profile') ? copy.profileError : copy.serviceError);
		text(avatar, '!');
	} else {
		text(label, copy.account);
		text(detail, copy.loading);
		text(avatar, '·');
	}
}

for (const root of document.querySelectorAll<HTMLElement>('[data-auth-controls]')) {
	if (root.dataset.bound === 'true') continue;
	root.dataset.bound = 'true';
	const locale = root.dataset.locale === 'en' ? 'en' : 'zh-CN';
	const trigger = root.querySelector<HTMLButtonElement>('[data-auth-trigger]');
	const panel = root.querySelector<HTMLElement>('[data-auth-panel]');
	const close = (): void => {
		if (!trigger || !panel) return;
		trigger.ariaExpanded = 'false';
		panel.hidden = true;
	};
	if (trigger) trigger.disabled = false;
	trigger?.addEventListener('click', () => {
		if (!panel) return;
		const open = panel.hidden;
		panel.hidden = !open;
		trigger.ariaExpanded = String(open);
		if (open && authSnapshot().status === 'booting') void bootAuth();
	});
	root.querySelector('[data-auth-login]')?.addEventListener('click', () => {
		void signInWithGoogle(`${location.pathname}${location.search}${location.hash}`, locale).catch(
			() => undefined,
		);
	});
	root
		.querySelector('[data-auth-signout]')
		?.addEventListener('click', () => void signOut().catch(() => undefined));
	root.querySelector('[data-auth-retry]')?.addEventListener('click', () => void bootAuth());
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && panel && !panel.hidden) {
			close();
			trigger?.focus();
		}
	});
	document.addEventListener('click', (event) => {
		if (event.target instanceof Node && !root.contains(event.target)) close();
	});
	subscribeAuth((state) => render(root, state));
}

const scheduleBoot = (): void => void bootAuth();
if ('requestIdleCallback' in window) {
	window.requestIdleCallback(scheduleBoot, { timeout: 1500 });
} else {
	globalThis.setTimeout(scheduleBoot, 500);
}
