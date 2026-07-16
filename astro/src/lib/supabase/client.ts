import type { SupabaseClient } from '@supabase/supabase-js';

import { browserCommunityConfig } from '../community/config';

let clientPromise: Promise<SupabaseClient | null> | null = null;
let resolvedClient: SupabaseClient | null | undefined;

export function resetUnavailableSupabaseClient(): void {
	if (resolvedClient === null) {
		clientPromise = null;
		resolvedClient = undefined;
	}
}

export function loadSupabaseClient(): Promise<SupabaseClient | null> {
	if (clientPromise) return clientPromise;
	clientPromise = (async () => {
		try {
			const config = browserCommunityConfig();
			if (!config) return (resolvedClient = null);
			const { createClient } = await import('@supabase/supabase-js');
			return (resolvedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
				auth: {
					flowType: 'pkce',
					persistSession: true,
					autoRefreshToken: true,
					detectSessionInUrl: false,
				},
			}));
		} catch {
			return (resolvedClient = null);
		}
	})();
	return clientPromise;
}
