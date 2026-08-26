// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	adapter: cloudflare({
		prerenderEnvironment: 'node',
	}),
	site: 'https://bubblenews.today',
	output: 'static',
	trailingSlash: 'always',
	markdown: {
		shikiConfig: {
			theme: 'min-light',
		},
	},
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
