import { describe, expect, it } from 'vitest';

import {
    projectPublishedCalendarReport,
    sortItemsBySourcePublishedAt,
} from '../../src/daily/calendarView.js';

function item(id, publishedAt, owningBatch = 'night', overrides = {}) {
    const publishedDate = publishedAt
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date(publishedAt))
        : null;
    return {
        id,
        identity_claims: [`claim:${id}`],
        batch: owningBatch,
        published_at: publishedAt,
        published_date: publishedDate,
        ingested_at: '2026-07-26T00:00:00.000+08:00',
        ...overrides,
    };
}

function report(date, items) {
    return {
        date,
        generated_at: `${date}T00:00:00.000+08:00`,
        batches: ['morning', 'afternoon', 'night', 'lateNight'].map(id => ({
            id,
            label: id,
            status: id === 'night' ? 'completed' : 'pending',
            generated_at: id === 'night' ? `${date}T00:00:00.000+08:00` : null,
            item_ids: items.filter(candidate => candidate.batch === id).map(candidate => candidate.id),
        })),
        items,
    };
}

describe('source publication calendar view', () => {
    it('moves late-discovered items to the source publication day', () => {
        const july25 = report('2026-07-25', [
            item('midday', '2026-07-25T04:00:00.000Z'),
        ]);
        const july26 = report('2026-07-26', [
            item('late-evening', '2026-07-25T12:00:00.000Z'),
            item('early-morning', '2026-07-24T22:31:00.000Z'),
            item('actual-july26', '2026-07-25T16:05:00.000Z'),
        ]);

        const projected25 = projectPublishedCalendarReport('2026-07-25', [july25, july26]);
        const projected26 = projectPublishedCalendarReport('2026-07-26', [july25, july26]);

        expect(projected25.items.map(candidate => candidate.id)).toEqual([
            'late-evening',
            'midday',
            'early-morning',
        ]);
        expect(projected25.items.map(candidate => candidate.batch)).toEqual([
            'afternoon',
            'morning',
            'morning',
        ]);
        expect(projected26.items.map(candidate => candidate.id)).toEqual(['actual-july26']);
        expect(projected26.items[0].batch).toBe('lateNight');
    });

    it('orders exact source timestamps newest first and keeps unknown dates on their owning report', () => {
        const unknown = item('unknown', null, 'morning');
        const items = [
            item('older', '2026-07-25T01:00:00.000Z'),
            unknown,
            item('newer', '2026-07-25T03:00:00.000Z'),
        ];
        expect(sortItemsBySourcePublishedAt(items).map(candidate => candidate.id)).toEqual([
            'newer',
            'older',
            'unknown',
        ]);
        expect(projectPublishedCalendarReport('2026-07-25', [report('2026-07-25', items)]).items)
            .toContainEqual(unknown);
    });

    it('deduplicates the same source identity across ingestion reports', () => {
        const first = item('first', '2026-07-25T03:00:00.000Z', 'morning', {
            identity_claims: ['shared'],
        });
        const repeated = item('repeated', '2026-07-25T03:00:00.000Z', 'night', {
            identity_claims: ['shared'],
        });
        const projected = projectPublishedCalendarReport('2026-07-25', [
            report('2026-07-25', [first]),
            report('2026-07-26', [repeated]),
        ]);
        expect(projected.items).toHaveLength(1);
    });
});
