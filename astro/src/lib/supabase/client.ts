import type { SupabaseClient } from '@supabase/supabase-js';

import { browserCommunityConfig } from '../community/config';

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function loadSupabaseClient(): Promise<SupabaseClient | null> {
	if (clientPromise) return clientPromise;
	clientPromise = (async () => {
		const config = browserCommunityConfig();
		if (!config) return null;
		const { createClient } = await import('@supabase/supabase-js');
		return createClient(config.supabaseUrl, config.supabaseAnonKey, {
			auth: {
				flowType: 'pkce',
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: false,
			},
		});
	})();
	return clientPromise;
}
