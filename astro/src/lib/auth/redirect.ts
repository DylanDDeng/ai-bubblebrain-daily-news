export function safeRelativeNext(value: string | null | undefined, fallback = '/'): string {
	if (!value) return fallback;
	if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
	const hasControlCharacter = Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});
	if (/[%](?:0d|0a|00|2f|5c)/i.test(value) || hasControlCharacter) return fallback;
	try {
		const parsed = new URL(value, 'https://bubblenews.today');
		if (parsed.origin !== 'https://bubblenews.today') return fallback;
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return fallback;
	}
}

export function callbackUrl(): string {
	return new URL('/auth/callback/', window.location.origin).toString();
}
