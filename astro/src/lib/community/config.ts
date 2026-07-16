const PRODUCTION_SUPABASE_URL = 'https://znurdobjryrhshzkalup.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpudXJkb2JqcnlyaHNoemthbHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTM1ODAsImV4cCI6MjA4MjU2OTU4MH0.1a5V2EECu9_To8KneGQRpt73JJSaIxLf592LPjxdp1Y';

export interface BrowserCommunityConfig {
	supabaseUrl: string;
	supabaseAnonKey: string;
	communityApiUrl: string;
	turnstileSiteKey: string;
}

export function browserCommunityConfig(): BrowserCommunityConfig | null {
	const host = window.location.hostname;
	const isProduction = host === 'bubblenews.today' || host === 'www.bubblenews.today';
	const isLocal = host === '127.0.0.1' || host === 'localhost';
	const isStablePreview = host === 'preview.bubblenews.today';

	if (isStablePreview) {
		const stagingUrl = import.meta.env.PUBLIC_SUPABASE_STAGING_URL;
		const stagingKey = import.meta.env.PUBLIC_SUPABASE_STAGING_ANON_KEY;
		if (!stagingUrl || !stagingKey) return null;
		return {
			supabaseUrl: stagingUrl,
			supabaseAnonKey: stagingKey,
			communityApiUrl:
				import.meta.env.PUBLIC_COMMUNITY_API_URL ?? 'https://community-api.bubblenews.today',
			turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '',
		};
	}

	if (!isProduction && !isLocal) return null;
	return {
		supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL ?? PRODUCTION_SUPABASE_URL,
		supabaseAnonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? PRODUCTION_SUPABASE_ANON_KEY,
		communityApiUrl:
			import.meta.env.PUBLIC_COMMUNITY_API_URL ?? 'https://community-api.bubblenews.today',
		turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '',
	};
}
