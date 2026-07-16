import {
	authSnapshot,
	bootAuth,
	signInWithGoogle,
	subscribeAuth,
	type AuthState,
} from '../lib/auth/authStore';
import {
	createPageComment,
	deletePageComment,
	loadPageComments,
	type PageComment,
} from '../lib/comments/api';
import { browserCommunityConfig } from '../lib/community/config';

interface TurnstileApi {
	render(container: HTMLElement, options: Record<string, unknown>): string;
	reset(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

let turnstilePromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	if (turnstilePromise) return turnstilePromise;
	turnstilePromise = new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		script.async = true;
		script.defer = true;
		script.onload = () =>
			window.turnstile
				? resolve(window.turnstile)
				: reject(new Error('Turnstile did not initialize.'));
		script.onerror = () => reject(new Error('Human verification could not be loaded.'));
		document.head.append(script);
	});
	return turnstilePromise;
}

function copy(locale: string) {
	return locale === 'en'
		? {
				loading: 'Loading discussion…',
				empty: 'No discussion yet. Start with a useful question or addition.',
				error: 'Discussion could not be loaded.',
				login: 'Sign in to join this discussion.',
				unavailable: 'Comment writing is not open yet.',
				reply: 'Reply',
				remove: 'Delete',
				replying: 'Replying to',
				posting: 'Publishing…',
				published: 'Comment published.',
				failed: 'Your draft was kept. Please try again.',
			}
		: {
				loading: '正在加载讨论…',
				empty: '还没有讨论。可以从一个有价值的问题或补充开始。',
				error: '讨论加载失败。',
				login: '登录后参与这篇文章的讨论。',
				unavailable: '评论写入暂未开放。',
				reply: '回复',
				remove: '删除',
				replying: '正在回复',
				posting: '正在发布…',
				published: '评论已发布。',
				failed: '发送失败，草稿已保留，请重试。',
			};
}

function text(node: Element | null, value: string): void {
	if (node) node.textContent = value;
}

function safeAvatar(url: string | null): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' ? parsed.toString() : null;
	} catch {
		return null;
	}
}

for (const root of document.querySelectorAll<HTMLElement>('[data-discussion]')) {
	if (root.dataset.bound === 'true') continue;
	root.dataset.bound = 'true';
	const locale = root.dataset.locale ?? 'zh-CN';
	const labels = copy(locale);
	const threadId = root.dataset.threadId ?? '';
	const list = root.querySelector<HTMLOListElement>('[data-discussion-list]');
	const status = root.querySelector<HTMLElement>('[data-discussion-status]');
	const count = root.querySelector<HTMLElement>('[data-discussion-count]');
	const retry = root.querySelector<HTMLButtonElement>('[data-discussion-retry]');
	const authNote = root.querySelector<HTMLElement>('[data-discussion-auth-note]');
	const form = root.querySelector<HTMLFormElement>('[data-discussion-form]');
	const textarea = form?.elements.namedItem('content') as HTMLTextAreaElement | null;
	const typeSelect = form?.elements.namedItem('type') as HTMLSelectElement | null;
	const charCount = root.querySelector('[data-character-count]');
	const replyContext = root.querySelector<HTMLElement>('[data-reply-context]');
	const replyLabel = root.querySelector('[data-reply-label]');
	let comments: PageComment[] = [];
	let loaded = false;
	let parentId: string | null = null;
	let turnstileToken = '';
	let turnstileWidget: string | null = null;

	function setState(next: string, message: string, isError = false): void {
		root.dataset.state = next;
		text(status, message);
		if (status) status.setAttribute('role', isError ? 'alert' : 'status');
		if (retry) retry.hidden = next !== 'load_error';
	}

	function setReply(comment: PageComment | null): void {
		parentId = comment?.id ?? null;
		if (replyContext) replyContext.hidden = !comment;
		if (typeSelect) typeSelect.disabled = Boolean(comment);
		text(replyLabel, comment ? `${labels.replying} ${comment.display_name ?? ''}` : '');
		textarea?.focus();
	}

	function render(): void {
		if (!list) return;
		list.replaceChildren();
		const roots = comments
			.filter((item) => !item.parent_id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		for (const comment of roots) {
			const item = document.createElement('li');
			const article = document.createElement('article');
			article.id = `comment-${comment.id}`;
			article.tabIndex = -1;
			const header = document.createElement('header');
			const identity = document.createElement('div');
			const avatarUrl = safeAvatar(comment.avatar_url);
			if (avatarUrl) {
				const image = document.createElement('img');
				image.src = avatarUrl;
				image.alt = '';
				image.referrerPolicy = 'no-referrer';
				identity.append(image);
			} else {
				const fallback = document.createElement('span');
				fallback.className = 'discussion-avatar';
				fallback.textContent = (comment.display_name ?? '?').slice(0, 1).toLocaleUpperCase(locale);
				identity.append(fallback);
			}
			const name = document.createElement('strong');
			name.textContent = comment.display_name ?? (locale === 'en' ? 'Reader' : '读者');
			identity.append(name);
			const time = document.createElement('time');
			time.dateTime = comment.created_at;
			time.textContent = new Intl.DateTimeFormat(locale, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(new Date(comment.created_at));
			header.append(identity, time);
			const content = document.createElement('p');
			content.textContent = comment.content;
			const actions = document.createElement('div');
			actions.className = 'discussion-actions';
			const reply = document.createElement('button');
			reply.type = 'button';
			reply.textContent = labels.reply;
			reply.addEventListener('click', () => setReply(comment));
			actions.append(reply);
			if (
				authSnapshot().user?.id === comment.user_id &&
				!comments.some((child) => child.parent_id === comment.id)
			) {
				const remove = document.createElement('button');
				remove.type = 'button';
				remove.textContent = labels.remove;
				remove.addEventListener('click', () => void removeComment(comment.id, remove));
				actions.append(remove);
			}
			article.append(header, content, actions);
			const replies = comments
				.filter((child) => child.parent_id === comment.id)
				.sort((a, b) => a.created_at.localeCompare(b.created_at));
			if (replies.length) {
				const replyList = document.createElement('ol');
				replyList.className = 'discussion-replies';
				for (const child of replies) {
					const childItem = document.createElement('li');
					const childArticle = document.createElement('article');
					childArticle.id = `comment-${child.id}`;
					const childHeader = document.createElement('header');
					const childName = document.createElement('strong');
					childName.textContent = child.display_name ?? (locale === 'en' ? 'Reader' : '读者');
					const childTime = document.createElement('time');
					childTime.dateTime = child.created_at;
					childTime.textContent = new Intl.DateTimeFormat(locale, {
						dateStyle: 'medium',
						timeStyle: 'short',
					}).format(new Date(child.created_at));
					childHeader.append(childName, childTime);
					const childContent = document.createElement('p');
					childContent.textContent = child.content;
					childArticle.append(childHeader, childContent);
					childItem.append(childArticle);
					replyList.append(childItem);
				}
				article.append(replyList);
			}
			item.append(article);
			list.append(item);
		}
		text(count, String(comments.length));
		setState(comments.length ? 'ready_data' : 'ready_empty', comments.length ? '' : labels.empty);
	}

	async function load(): Promise<void> {
		setState('loading', labels.loading);
		try {
			comments = await loadPageComments(threadId);
			loaded = true;
			render();
		} catch {
			setState('load_error', labels.error, true);
		}
	}

	async function setupTurnstile(): Promise<void> {
		const config = browserCommunityConfig();
		const container = root.querySelector<HTMLElement>('[data-turnstile]');
		if (!config?.turnstileSiteKey || !container || turnstileWidget) return;
		try {
			const api = await loadTurnstile();
			turnstileWidget = api.render(container, {
				sitekey: config.turnstileSiteKey,
				action: 'comment',
				callback: (token: string) => {
					turnstileToken = token;
				},
				'expired-callback': () => {
					turnstileToken = '';
				},
				'error-callback': () => {
					turnstileToken = '';
				},
			});
		} catch (error) {
			setState('mutation_error', error instanceof Error ? error.message : labels.failed, true);
		}
	}

	function updateAuth(state: AuthState): void {
		const config = browserCommunityConfig();
		if (!authNote || !form) return;
		authNote.replaceChildren();
		if (state.status === 'anonymous') {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = labels.login;
			button.addEventListener(
				'click',
				() =>
					void signInWithGoogle(
						`${location.pathname}#discussion`,
						locale === 'en' ? 'en' : 'zh-CN',
					),
			);
			authNote.append(button);
			form.hidden = true;
		} else if (state.status === 'ready' && config?.turnstileSiteKey) {
			form.hidden = false;
			void setupTurnstile();
		} else if (state.status === 'ready') {
			text(authNote, labels.unavailable);
			form.hidden = true;
		} else {
			text(authNote, state.error ?? '');
			form.hidden = true;
		}
		if (loaded) render();
	}

	async function removeComment(id: string, button: HTMLButtonElement): Promise<void> {
		if (!turnstileToken) {
			setState(
				'mutation_error',
				locale === 'en' ? 'Complete human verification first.' : '请先完成人机验证。',
				true,
			);
			return;
		}
		if (!confirm(locale === 'en' ? 'Delete this comment?' : '确认删除这条评论吗？')) return;
		button.disabled = true;
		try {
			await deletePageComment(id, turnstileToken);
			comments = comments.filter((item) => item.id !== id);
			turnstileToken = '';
			if (turnstileWidget && window.turnstile) window.turnstile.reset(turnstileWidget);
			render();
		} catch (error) {
			setState('mutation_error', error instanceof Error ? error.message : labels.failed, true);
		} finally {
			button.disabled = false;
		}
	}

	form?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const content = textarea?.value.trim() ?? '';
		if (!content || !turnstileToken || !typeSelect) {
			setState(
				'mutation_error',
				locale === 'en'
					? 'Write a comment and complete human verification.'
					: '请填写内容并完成人机验证。',
				true,
			);
			return;
		}
		const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
		if (submit) submit.disabled = true;
		setState('posting', labels.posting);
		try {
			const created = await createPageComment({
				threadId,
				type: typeSelect.value as 'question' | 'repro' | 'suggestion',
				content,
				turnstileToken,
				parentId,
			});
			comments.push(created);
			if (textarea) textarea.value = '';
			text(charCount, '0 / 4000');
			setReply(null);
			turnstileToken = '';
			if (turnstileWidget && window.turnstile) window.turnstile.reset(turnstileWidget);
			render();
			setState('ready_data', labels.published);
			document.querySelector<HTMLElement>(`#comment-${created.id}`)?.focus();
		} catch (error) {
			setState(
				'mutation_error',
				`${labels.failed} ${error instanceof Error ? error.message : ''}`.trim(),
				true,
			);
		} finally {
			if (submit) submit.disabled = false;
		}
	});

	textarea?.addEventListener('input', () => text(charCount, `${textarea.value.length} / 4000`));
	root.querySelector('[data-cancel-reply]')?.addEventListener('click', () => setReply(null));
	retry?.addEventListener('click', () => void load());
	subscribeAuth(updateAuth);
	void bootAuth();

	if ('IntersectionObserver' in window) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					void load();
				}
			},
			{ rootMargin: '600px 0px' },
		);
		observer.observe(root);
	} else {
		void load();
	}
}
