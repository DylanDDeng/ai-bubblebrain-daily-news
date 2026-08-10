import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-directory.js', import.meta.url), 'utf8');

describe('legacy directory lifecycle', () => {
	it('rebinds directory search after Astro client-side navigation', () => {
		expect(source).toContain("document.addEventListener('astro:page-load', setupDirectory);");
		expect(source).toContain(
			"input.addEventListener('input', apply, { signal: controller.signal });",
		);
		expect(source).toContain('cleanupDirectory = () => controller.abort();');
		expect(source).toMatch(/\nsetupDirectory\(\);\s*$/);
	});
});
