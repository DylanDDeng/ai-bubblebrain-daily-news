import type { Session, User } from '@supabase/supabase-js';

import { loadSupabaseClient } from '../supabase/client';
import { callbackUrl, safeRelativeNext } from './redirect';

export type AuthStatus =
	| 'booting'
	| 'anonymous'
	| 'redirecting'
	| 'authenticated'
	| 'provisioning_profile'
	| 'ready'
	| 'signing_out'
	| 'recoverable_error';

export interface PublicProfile {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
}

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	session: Session | null;
	profile: PublicProfile | null;
	error: string | null;
}

const listeners = new Set<(state: AuthState) => void>();
let state: AuthState = { status: 'booting', user: null, session: null, profile: null, error: null };
let bootPromise: Promise<AuthState> | null = null;
let subscribed = false;

function publish(next: AuthState): AuthState {
	state = next;
	for (const listener of listeners) listener(state);
	return state;
}

async function provision(session: Session): Promise<AuthState> {
	publish({
		status: 'provisioning_profile',
		user: session.user,
		session,
		profile: null,
		error: null,
	});
	const client = await loadSupabaseClient();
	if (!client)
		return publish({
			...state,
			status: 'recoverable_error',
			error: 'Community configuration is unavailable.',
		});
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const result = await client
			.from('profiles')
			.select('id,display_name,avatar_url')
			.eq('id', session.user.id)
			.maybeSingle<PublicProfile>();
		if (result.data)
			return publish({
				status: 'ready',
				user: session.user,
				session,
				profile: result.data,
				error: null,
			});
		if (attempt < 2)
			await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
	}
	return publish({
		status: 'recoverable_error',
		user: session.user,
		session,
		profile: null,
		error: 'Profile initialization failed. Please retry.',
	});
}

export function authSnapshot(): AuthState {
	return state;
}

export function subscribeAuth(listener: (state: AuthState) => void): () => void {
	listeners.add(listener);
	listener(state);
	return () => listeners.delete(listener);
}

export function bootAuth(): Promise<AuthState> {
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		const client = await loadSupabaseClient();
		if (!client)
			return publish({
				status: 'recoverable_error',
				user: null,
				session: null,
				profile: null,
				error: 'Community features are unavailable on this host.',
			});
		if (!subscribed) {
			subscribed = true;
			client.auth.onAuthStateChange((_event, session) => {
				queueMicrotask(() => {
					if (session) void provision(session);
					else
						publish({ status: 'anonymous', user: null, session: null, profile: null, error: null });
				});
			});
		}
		const { data, error } = await client.auth.getSession();
		if (error)
			return publish({
				status: 'recoverable_error',
				user: null,
				session: null,
				profile: null,
				error: error.message,
			});
		if (!data.session)
			return publish({
				status: 'anonymous',
				user: null,
				session: null,
				profile: null,
				error: null,
			});
		return provision(data.session);
	})();
	return bootPromise;
}

export async function signInWithGoogle(next: string, locale: 'zh-CN' | 'en'): Promise<void> {
	publish({ ...state, status: 'redirecting', error: null });
	const client = await loadSupabaseClient();
	if (!client) throw new Error('Community configuration is unavailable.');
	sessionStorage.setItem('bb-auth-next', safeRelativeNext(next));
	sessionStorage.setItem('bb-auth-locale', locale);
	const { error } = await client.auth.signInWithOAuth({
		provider: 'google',
		options: { redirectTo: callbackUrl(), skipBrowserRedirect: false },
	});
	if (error) {
		publish({ ...state, status: 'recoverable_error', error: error.message });
		throw error;
	}
}

export async function completeOAuthCallback(code: string): Promise<AuthState> {
	publish({ ...state, status: 'authenticated', error: null });
	const client = await loadSupabaseClient();
	if (!client) throw new Error('Community configuration is unavailable.');
	const { data, error } = await client.auth.exchangeCodeForSession(code);
	if (error || !data.session) {
		const message = error?.message ?? 'The login session could not be completed.';
		publish({
			status: 'recoverable_error',
			user: null,
			session: null,
			profile: null,
			error: message,
		});
		throw new Error(message);
	}
	return provision(data.session);
}

export async function signOut(): Promise<void> {
	publish({ ...state, status: 'signing_out', error: null });
	const client = await loadSupabaseClient();
	if (!client) return;
	const { error } = await client.auth.signOut();
	if (error) {
		publish({ ...state, status: 'recoverable_error', error: error.message });
		throw error;
	}
	publish({ status: 'anonymous', user: null, session: null, profile: null, error: null });
}
