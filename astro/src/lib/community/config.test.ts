import { describe, expect, it } from 'vitest';

import { publicCapabilityEnabled } from './config';

describe('public community capabilities', () => {
	it('keeps the comment composer disabled when the build flag is absent or malformed', () => {
		expect(publicCapabilityEnabled(undefined)).toBe(false);
		expect(publicCapabilityEnabled('')).toBe(false);
		expect(publicCapabilityEnabled('TRUE')).toBe(false);
		expect(publicCapabilityEnabled('1')).toBe(false);
	});

	it('enables the comment composer only for the explicit true value', () => {
		expect(publicCapabilityEnabled('true')).toBe(true);
	});
});
