import eslint from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['.astro/**', 'dist/**', 'node_modules/**'],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...eslintPluginAstro.configs['flat/recommended'],
	{
		files: ['**/*.astro'],
		languageOptions: {
			globals: globals.browser,
		},
	},
	{
		files: ['scripts/**/*.mjs', '*.config.js'],
		languageOptions: {
			globals: globals.node,
		},
	},
];
