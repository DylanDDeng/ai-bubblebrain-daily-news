interface CommentThreadInput {
	route: string;
	locale: 'zh-CN' | 'en';
	chineseAlternateRoute?: string | null;
}

function assertCanonicalRoute(route: string): string {
	if (!route.startsWith('/') || !route.endsWith('/') || route.includes('\\') || /\s/.test(route)) {
		throw new Error(`Invalid canonical comment route: ${route}`);
	}
	return route;
}

export function commentThreadId(input: CommentThreadInput): `page:${string}` {
	const canonical =
		input.locale === 'en' && input.chineseAlternateRoute
			? input.chineseAlternateRoute
			: input.route;
	return `page:${assertCanonicalRoute(canonical)}`;
}
