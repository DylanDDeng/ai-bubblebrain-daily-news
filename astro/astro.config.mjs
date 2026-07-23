// @ts-check
import { defineConfig } from 'astro/config';

function cjsToEsmPlugin() {
	return {
		name: 'cjs-to-esm-validator',
		enforce: 'pre',
		transform(code, id) {
			if (!id.includes('dailyReportValidator')) return null;
			const shim =
				'import { createRequire as _cr } from "node:module";\nconst require = _cr(import.meta.url);\n';
			return { code: shim + code, map: null };
		},
	};
}

// https://astro.build/config
export default defineConfig({
	site: 'https://bubblenews.today',
	output: 'static',
	trailingSlash: 'always',
	publicDir: '../static',
	i18n: {
		defaultLocale: 'zh-CN',
		locales: ['zh-CN', 'en'],
		routing: {
			prefixDefaultLocale: false,
			redirectToDefaultLocale: false,
		},
	},
	vite: {
		plugins: [cjsToEsmPlugin()],
	},
});
