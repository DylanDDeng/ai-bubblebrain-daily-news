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
	remove(widgetId: string): void;
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
	const pending = new Promise<TurnstileApi>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		script.async = true;
		script.defer = true;
		script.onload = () => {
			if (window.turnstile) resolve(window.turnstile);
			else {
				script.remove();
				reject(new Error('Turnstile did not initialize.'));
			}
		};
		script.onerror = () => {
			script.remove();
			reject(new Error('Human verification could not be loaded.'));
		};
		document.head.append(script);
	});
	turnstilePromise = pending.catch((error) => {
		turnstilePromise = null;
		throw error;
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
				unavailable: 'Comments are not open yet.',
				reply: 'Reply',
				remove: 'Delete',
				replying: 'Replying to',
				posting: 'Publishing…',
				published: 'Comment published.',
				deleted: 'Comment deleted.',
				failed: 'Your draft was kept. Please try again.',
				turnstileError: 'Human verification could not be loaded. Please retry.',
				deleteFailed: 'This comment could not be deleted. Please retry.',
				authChecking: 'Checking your account…',
				authError:
					'Account service is temporarily unavailable. Please retry from the account menu.',
			}
		: {
				loading: '正在加载讨论…',
				empty: '还没有讨论。可以从一个有价值的问题或补充开始。',
				error: '讨论加载失败。',
				login: '登录后参与这篇文章的讨论。',
				unavailable: '评论区暂未开放。',
				reply: '回复',
				remove: '删除',
				replying: '正在回复',
				posting: '正在发布…',
				published: '评论已发布。',
				deleted: '评论已删除。',
				failed: '发送失败，草稿已保留，请重试。',
				turnstileError: '人机验证加载失败，请重试。',
				deleteFailed: '删除失败，请重试。',
				authChecking: '正在检查账户状态…',
				authError: '账户服务暂时不可用，请从账户菜单重试。',
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

const cleanupByRoot = new Map<HTMLElement, () => void>();

function initDiscussions(): void {
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
		let turnstileSetupPromise: Promise<void> | null = null;
		let turnstileFailed = false;
		let observer: IntersectionObserver | null = null;

		function setState(next: string, message: string, isError = false): void {
			root.dataset.state = next;
			text(status, message);
			if (status) status.setAttribute('role', isError ? 'alert' : 'status');
			if (retry) retry.hidden = next !== 'load_error' && next !== 'turnstile_error';
		}

		function setReply(comment: PageComment | null): void {
			parentId = comment?.id ?? null;
			if (replyContext) replyContext.hidden = !comment;
			if (typeSelect) typeSelect.disabled = Boolean(comment);
			text(replyLabel, comment ? `${labels.replying} ${comment.display_name ?? ''}` : '');
			textarea?.focus();
		}

		async function beginReply(comment: PageComment): Promise<void> {
			let state = authSnapshot();
			if (
				state.status === 'booting' ||
				state.status === 'authenticated' ||
				state.status === 'provisioning_profile'
			) {
				setState('auth_checking', labels.authChecking);
				try {
					state = await bootAuth();
				} catch {
					setState('mutation_error', labels.authError, true);
					return;
				}
			}
			const config = browserCommunityConfig();
			if (state.status === 'anonymous') {
				void signInWithGoogle(
					`${location.pathname}#discussion`,
					locale === 'en' ? 'en' : 'zh-CN',
				).catch(() => setState('mutation_error', labels.authError, true));
				return;
			}
			if (state.status !== 'ready') {
				setState('mutation_error', labels.authError, true);
				return;
			}
			if (!config?.commentsWriteUiEnabled || !config.turnstileSiteKey) {
				setState('mutation_error', labels.unavailable, true);
				return;
			}
			setReply(comment);
		}

		function render(): void {
			if (!list) return;
			list.replaceChildren();
			const config = browserCommunityConfig();
			const mutationsAvailable = Boolean(config?.commentsWriteUiEnabled && config.turnstileSiteKey);
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
					fallback.textContent = (comment.display_name ?? '?')
						.slice(0, 1)
						.toLocaleUpperCase(locale);
					identity.append(fallback);
				}
				const name = document.createElement('strong');
				name.textContent = comment.display_name ?? (locale === 'en' ? 'Reader' : '读者');
				identity.append(name);
				const type = document.createElement('span');
				type.className = 'discussion-type';
				type.textContent =
					locale === 'en'
						? {
								question: 'Question',
								repro: 'Repro feedback',
								suggestion: 'Suggestion',
								reply: 'Reply',
							}[comment.type]
						: { question: '提问', repro: '复现反馈', suggestion: '改进建议', reply: '回复' }[
								comment.type
							];
				identity.append(type);
				const time = document.createElement('time');
				time.dateTime = comment.created_at;
				time.textContent = new Intl.DateTimeFormat(locale, {
					dateStyle: 'medium',
					timeStyle: 'short',
				}).format(new Date(comment.created_at));
				header.append(identity, time);
				const content = document.createElement('p');
				content.textContent = comment.content;
				article.append(header, content);
				if (mutationsAvailable) {
					const actions = document.createElement('div');
					actions.className = 'discussion-actions';
					const reply = document.createElement('button');
					reply.type = 'button';
					reply.textContent = labels.reply;
					reply.addEventListener('click', () => void beginReply(comment));
					actions.append(reply);
					if (
						authSnapshot().user?.id === comment.user_id &&
						!comments.some((child) => child.parent_id === comment.id)
					) {
						const remove = document.createElement('button');
						remove.type = 'button';
						remove.textContent = labels.remove;
						remove.addEventListener('click', () => void removeComment(comment, remove));
						actions.append(remove);
					}
					article.append(actions);
				}
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
						childArticle.tabIndex = -1;
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
						if (mutationsAvailable && authSnapshot().user?.id === child.user_id) {
							const childActions = document.createElement('div');
							childActions.className = 'discussion-actions';
							const remove = document.createElement('button');
							remove.type = 'button';
							remove.textContent = labels.remove;
							remove.addEventListener('click', () => void removeComment(child, remove));
							childActions.append(remove);
							childArticle.append(childActions);
						}
						childItem.append(childArticle);
						replyList.append(childItem);
					}
					article.append(replyList);
				}
				item.append(article);
				list.append(item);
			}
			text(count, String(comments.length));
			if (turnstileFailed && authSnapshot().status === 'ready')
				setState('turnstile_error', labels.turnstileError, true);
			else
				setState(
					comments.length ? 'ready_data' : 'ready_empty',
					comments.length ? '' : labels.empty,
				);
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

		function discardTurnstile(): void {
			turnstileToken = '';
			turnstileFailed = false;
			try {
				if (turnstileWidget && window.turnstile) window.turnstile.remove(turnstileWidget);
			} catch {
				// A failed widget may already have removed itself.
			}
			turnstileWidget = null;
		}

		function setupTurnstile(): Promise<void> {
			const config = browserCommunityConfig();
			const container = root.querySelector<HTMLElement>('[data-turnstile]');
			if (
				!config?.commentsWriteUiEnabled ||
				!config.turnstileSiteKey ||
				!container ||
				turnstileWidget
			)
				return Promise.resolve();
			if (turnstileSetupPromise) return turnstileSetupPromise;
			turnstileSetupPromise = (async () => {
				try {
					const api = await loadTurnstile();
					if (turnstileWidget) return;
					turnstileWidget = api.render(container, {
						sitekey: config.turnstileSiteKey,
						action: 'comment',
						size: 'flexible',
						callback: (token: string) => {
							turnstileToken = token;
						},
						'expired-callback': () => {
							turnstileToken = '';
						},
						'error-callback': () => {
							turnstileToken = '';
							turnstileFailed = true;
							setState('turnstile_error', labels.turnstileError, true);
						},
					});
					turnstileFailed = false;
					setState(comments.length ? 'ready_data' : 'ready_empty', '');
				} catch {
					turnstileFailed = true;
					setState('turnstile_error', labels.turnstileError, true);
				}
			})().finally(() => {
				turnstileSetupPromise = null;
			});
			return turnstileSetupPromise;
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
						).catch(() => setState('mutation_error', labels.authError, true)),
				);
				authNote.append(button);
				form.hidden = true;
			} else if (
				state.status === 'ready' &&
				config?.commentsWriteUiEnabled &&
				config.turnstileSiteKey
			) {
				form.hidden = false;
				void setupTurnstile();
			} else if (state.status === 'ready') {
				text(authNote, labels.unavailable);
				form.hidden = true;
			} else {
				text(authNote, state.status === 'recoverable_error' ? labels.authError : '');
				form.hidden = true;
			}
			if (loaded) render();
		}

		async function removeComment(comment: PageComment, button: HTMLButtonElement): Promise<void> {
			if (!browserCommunityConfig()?.commentsWriteUiEnabled) {
				setState('mutation_error', labels.unavailable, true);
				return;
			}
			if (!turnstileToken) {
				setState(
					'mutation_error',
					locale === 'en' ? 'Complete human verification first.' : '请先完成人机验证。',
					true,
				);
				return;
			}
			if (!confirm(locale === 'en' ? 'Delete this comment?' : '确认删除这条评论吗？')) return;
			const siblings = comments
				.filter((item) => item.parent_id === comment.parent_id)
				.sort((a, b) => a.created_at.localeCompare(b.created_at));
			const index = siblings.findIndex((item) => item.id === comment.id);
			const focusId = siblings[index + 1]?.id ?? siblings[index - 1]?.id ?? comment.parent_id;
			button.disabled = true;
			try {
				await deletePageComment(comment.id, turnstileToken);
				comments = comments.filter((item) => item.id !== comment.id);
				turnstileToken = '';
				if (turnstileWidget && window.turnstile) window.turnstile.reset(turnstileWidget);
				render();
				setState(comments.length ? 'ready_data' : 'ready_empty', labels.deleted);
				if (focusId) document.querySelector<HTMLElement>(`#comment-${focusId}`)?.focus();
				else status?.focus();
			} catch {
				setState('mutation_error', labels.deleteFailed, true);
			} finally {
				button.disabled = false;
			}
		}

		form?.addEventListener('submit', async (event) => {
			event.preventDefault();
			if (!browserCommunityConfig()?.commentsWriteUiEnabled) {
				setState('mutation_error', labels.unavailable, true);
				return;
			}
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
			} catch {
				setState('mutation_error', labels.failed, true);
			} finally {
				if (submit) submit.disabled = false;
			}
		});

		textarea?.addEventListener('input', () => text(charCount, `${textarea.value.length} / 4000`));
		root.querySelector('[data-cancel-reply]')?.addEventListener('click', () => setReply(null));
		retry?.addEventListener('click', () => {
			if (root.dataset.state === 'turnstile_error') {
				discardTurnstile();
				void setupTurnstile();
			} else void load();
		});
		const unsubscribe = subscribeAuth(updateAuth);

		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer?.disconnect();
						void bootAuth();
						void load();
					}
				},
				{ rootMargin: '600px 0px' },
			);
			observer.observe(root);
		} else {
			void bootAuth();
			void load();
		}
		cleanupByRoot.set(root, () => {
			unsubscribe();
			observer?.disconnect();
			discardTurnstile();
		});
	}
}

document.addEventListener('astro:after-swap', () => {
	for (const [root, cleanup] of cleanupByRoot) {
		if (root.isConnected) continue;
		cleanup();
		cleanupByRoot.delete(root);
	}
});
document.addEventListener('astro:page-load', initDiscussions);
initDiscussions();
