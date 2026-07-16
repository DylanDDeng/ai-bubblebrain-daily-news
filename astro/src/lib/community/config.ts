const PRODUCTION_SUPABASE_URL = 'https://znurdobjryrhshzkalup.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpudXJkb2JqcnlyaHNoemthbHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTM1ODAsImV4cCI6MjA4MjU2OTU4MH0.1a5V2EECu9_To8KneGQRpt73JJSaIxLf592LPjxdp1Y';
const PRODUCTION_TURNSTILE_SITE_KEY = '0x4AAAAAAD3VMNWvRRpprPqO';

export interface BrowserCommunityConfig {
	environment: 'production' | 'preview' | 'local';
	supabaseUrl: string;
	supabaseAnonKey: string;
	communityApiUrl: string;
	turnstileSiteKey: string;
	commentsWriteUiEnabled: boolean;
}

export function publicCapabilityEnabled(value: string | undefined): boolean {
	return value === 'true';
}

function normalizedUrl(value: string | undefined, allowedProtocols: string[]): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (!allowedProtocols.includes(url.protocol) || url.username || url.password) return null;
		url.pathname = url.pathname.replace(/\/$/, '');
		return url.toString().replace(/\/$/, '');
	} catch {
		return null;
	}
}

export function browserCommunityConfig(): BrowserCommunityConfig | null {
	const host = window.location.hostname;
	const isProduction = host === 'bubblenews.today';
	const isLocal = host === '127.0.0.1' || host === 'localhost';
	const isStablePreview = host === 'preview.bubblenews.today';

	if (isStablePreview) {
		const stagingUrl = normalizedUrl(import.meta.env.PUBLIC_SUPABASE_STAGING_URL, ['https:']);
		const stagingKey = import.meta.env.PUBLIC_SUPABASE_STAGING_ANON_KEY;
		const stagingApi = normalizedUrl(import.meta.env.PUBLIC_COMMUNITY_STAGING_API_URL, ['https:']);
		if (
			!stagingUrl ||
			!stagingKey ||
			!stagingApi ||
			stagingUrl === PRODUCTION_SUPABASE_URL ||
			!new URL(stagingUrl).hostname.endsWith('.supabase.co') ||
			stagingApi !== 'https://community-api-staging.bubblenews.today'
		)
			return null;
		return {
			environment: 'preview',
			supabaseUrl: stagingUrl,
			supabaseAnonKey: stagingKey,
			communityApiUrl: stagingApi,
			turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_STAGING_SITE_KEY ?? '',
			commentsWriteUiEnabled: publicCapabilityEnabled(
				import.meta.env.PUBLIC_COMMENTS_WRITE_UI_ENABLED,
			),
		};
	}

	if (isLocal) {
		const localUrl = normalizedUrl(import.meta.env.PUBLIC_SUPABASE_LOCAL_URL, ['http:', 'https:']);
		const localKey = import.meta.env.PUBLIC_SUPABASE_LOCAL_ANON_KEY;
		const localApi = normalizedUrl(import.meta.env.PUBLIC_COMMUNITY_LOCAL_API_URL, [
			'http:',
			'https:',
		]);
		if (!localUrl || !localKey || !localApi || localUrl === PRODUCTION_SUPABASE_URL) return null;
		return {
			environment: 'local',
			supabaseUrl: localUrl,
			supabaseAnonKey: localKey,
			communityApiUrl: localApi,
			turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_LOCAL_SITE_KEY ?? '',
			commentsWriteUiEnabled: publicCapabilityEnabled(
				import.meta.env.PUBLIC_COMMENTS_WRITE_UI_ENABLED,
			),
		};
	}

	if (!isProduction) return null;
	const productionApi = normalizedUrl(
		import.meta.env.PUBLIC_COMMUNITY_API_URL ?? 'https://community-api.bubblenews.today',
		['https:'],
	);
	if (!productionApi || productionApi !== 'https://community-api.bubblenews.today') return null;
	return {
		environment: 'production',
		supabaseUrl: PRODUCTION_SUPABASE_URL,
		supabaseAnonKey: PRODUCTION_SUPABASE_ANON_KEY,
		communityApiUrl: productionApi,
		turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? PRODUCTION_TURNSTILE_SITE_KEY,
		commentsWriteUiEnabled: publicCapabilityEnabled(
			import.meta.env.PUBLIC_COMMENTS_WRITE_UI_ENABLED,
		),
	};
}
