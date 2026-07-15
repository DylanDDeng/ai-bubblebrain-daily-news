// @ts-check
import { defineConfig } from 'astro/config';

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
});
