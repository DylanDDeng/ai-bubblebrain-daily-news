import { bootAuth, signInWithGoogle } from '../lib/auth/authStore';
import { safeRelativeNext } from '../lib/auth/redirect';

const root = document.querySelector<HTMLElement>('[data-login-page]');
const button = root?.querySelector<HTMLButtonElement>('[data-login-google]');
const status = root?.querySelector<HTMLElement>('[data-login-status]');
const locale = root?.dataset.locale === 'en' ? 'en' : 'zh-CN';
if (button) button.disabled = false;
button?.addEventListener('click', async () => {
	button.disabled = true;
	if (status) status.textContent = locale === 'en' ? 'Opening Google…' : '正在前往 Google…';
	try {
		const auth = await bootAuth();
		if (auth.status === 'recoverable_error') throw new Error('Authentication is unavailable.');
		const next = safeRelativeNext(
			new URLSearchParams(location.search).get('next'),
			locale === 'en' ? '/en/' : '/',
		);
		await signInWithGoogle(next, locale);
	} catch {
		if (status)
			status.textContent =
				locale === 'en'
					? 'Sign-in is temporarily unavailable. Please retry.'
					: '登录暂时不可用，请重试。';
		button.disabled = false;
	}
});
