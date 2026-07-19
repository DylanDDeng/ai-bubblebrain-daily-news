import { completeOAuthCallback } from '../lib/auth/authStore';
import { safeRelativeNext } from '../lib/auth/redirect';

function initAuthCallback(): void {
	const root = document.querySelector<HTMLElement>('[data-auth-callback]');
	if (!root || root.dataset.bound === 'true') return;
	root.dataset.bound = 'true';
	const title = root.querySelector<HTMLElement>('[data-callback-title]');
	const status = root.querySelector<HTMLElement>('[data-callback-status]');
	const retry = root.querySelector<HTMLAnchorElement>('[data-callback-retry]');
	const home = root.querySelector<HTMLAnchorElement>('[data-callback-home]');
	const params = new URLSearchParams(location.search);
	const code = params.get('code');
	const oauthError = params.get('error_description') ?? params.get('error');
	let storedNext: string | null = null;
	let storedLocale: string | null = null;
	try {
		storedNext = sessionStorage.getItem('bb-auth-next');
		storedLocale = sessionStorage.getItem('bb-auth-locale');
	} catch {
		// The callback can safely fall back home when storage is unavailable.
	}
	const locale = storedLocale === 'en' || root.dataset.locale === 'en' ? 'en' : 'zh-CN';
	const isEnglish = locale === 'en';
	if (isEnglish) {
		if (title) title.textContent = 'Completing sign-in';
		if (status) status.textContent = 'Verifying this Google sign-in…';
		if (retry) {
			retry.textContent = 'Try sign-in again';
			retry.href = '/en/login/';
		}
		if (home) {
			home.textContent = 'Return home';
			home.href = '/en/';
		}
	}
	const next = safeRelativeNext(params.get('next') ?? storedNext, isEnglish ? '/en/' : '/');
	void (async () => {
		try {
			if (oauthError || !code) throw new Error('oauth_callback_failed');
			await completeOAuthCallback(code);
			history.replaceState({}, '', '/auth/callback/');
			try {
				sessionStorage.removeItem('bb-auth-next');
				sessionStorage.removeItem('bb-auth-locale');
			} catch {
				// Storage cleanup is best effort.
			}
			if (title) title.textContent = isEnglish ? 'Sign-in complete' : '登录完成';
			if (status)
				status.textContent = isEnglish ? 'Returning to the previous page…' : '正在返回之前的页面…';
			location.replace(next);
		} catch {
			if (title) title.textContent = isEnglish ? 'Sign-in was not completed' : '登录没有完成';
			if (status)
				status.textContent = isEnglish
					? 'The secure sign-in could not be completed. Please try again.'
					: '安全登录未能完成，请重新登录。';
			if (retry) retry.hidden = false;
		}
	})();
}

document.addEventListener('astro:page-load', initAuthCallback);
initAuthCallback();
