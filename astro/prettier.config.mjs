export default {
	plugins: ['prettier-plugin-astro'],
	overrides: [
		{
			files: '*.astro',
			options: { parser: 'astro' },
		},
	],
	printWidth: 100,
	semi: true,
	singleQuote: true,
	useTabs: true,
};
