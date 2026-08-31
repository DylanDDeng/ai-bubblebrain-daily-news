import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../static/js/site-shell.js', import.meta.url), 'utf8');

class FakeNavGroup {
	dataset: Record<string, string> = {};
	open = false;
	private listeners = new Map<string, () => void>();

	addEventListener(type: string, listener: () => void) {
		this.listeners.set(type, listener);
	}

	toggle(open: boolean) {
		this.open = open;
		this.listeners.get('toggle')?.();
	}
}

describe('site shell navigation groups', () => {
	it('keeps only the most recently opened navigation group expanded', () => {
		const groups = [new FakeNavGroup(), new FakeNavGroup(), new FakeNavGroup()];
		const document = {
			documentElement: { dataset: { theme: 'light' } },
			querySelectorAll: (selector: string) =>
				selector === 'details[data-nav-group]' ? groups : [],
			querySelector: () => null,
			addEventListener: () => undefined,
		};

		runInNewContext(source, { document, localStorage: { setItem: () => undefined } });

		groups[0].toggle(true);
		groups[1].toggle(true);

		expect(groups.map((group) => group.open)).toEqual([false, true, false]);

		groups[2].toggle(true);

		expect(groups.map((group) => group.open)).toEqual([false, false, true]);
	});
});
