import { describe, expect, it } from 'vitest';

import { canonicalizeTaxonomyIds, type TaxonomyRecord } from './knowledge';

function record(
	id: string,
	status: TaxonomyRecord['status'],
	redirectToId: string | null = null,
): TaxonomyRecord {
	return {
		id,
		slug: id,
		slug_aliases: [],
		labels: { zh: id, en: id },
		aliases: [],
		keywords: [],
		status,
		redirect_to_id: redirectToId,
	};
}

describe('taxonomy canonicalization', () => {
	it('aggregates merged historical IDs and retains deprecated tombstones', () => {
		const records = [
			record('topic_old', 'merged', 'topic_current'),
			record('topic_current', 'active'),
			record('topic_deprecated', 'deprecated'),
		];
		const registry = new Map(records.map((entry) => [entry.id, entry]));

		expect(
			canonicalizeTaxonomyIds(
				['topic_old', 'topic_current', 'topic_deprecated'],
				records,
				registry,
			),
		).toEqual(['topic_current', 'topic_deprecated']);
	});
});
