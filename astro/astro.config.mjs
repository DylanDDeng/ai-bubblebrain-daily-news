// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

const configDir = dirname(fileURLToPath(import.meta.url));

// Shared timeline assets are served unhashed from static/, so SSR pages bust
// the browser cache with a build-time content hash. Computed here (Node has
// fs access) because the Workers runtime cannot read the filesystem.
function staticAssetVersion() {
	try {
		const hash = createHash('sha256');
		for (const asset of ['css/daily-timeline.css', 'js/daily-timeline.js']) {
			hash.update(readFileSync(resolve(configDir, '..', 'static', asset)));
		}
		return hash.digest('hex').slice(0, 10);
	} catch {
		return 'build';
	}
}

function cjsToEsmPlugin() {
	return {
		name: 'cjs-to-esm-validator',
		enforce: 'pre',
		/**
		 * @param {string} code
		 * @param {string} id
		 */
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
	adapter: cloudflare({
		prerenderEnvironment: 'node',
	}),
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
		define: {
			__STATIC_ASSET_VERSION__: JSON.stringify(staticAssetVersion()),
			__SITE_DISPLAY_DATE__: JSON.stringify(process.env.SITE_DISPLAY_DATE ?? ''),
			__STRUCTURED_CUTOVER_DATE__: JSON.stringify(process.env.STRUCTURED_CUTOVER_DATE ?? ''),
		},
	},
});
