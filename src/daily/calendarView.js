import { deduplicateSameDay } from './dedupe.js';
import { isRealDate } from './time.js';

function sourcePublishedTimestamp(item) {
    if (!item?.published_at) return null;
    const value = Date.parse(item.published_at);
    return Number.isFinite(value) ? value : null;
}

function comparePublishedItems(left, right) {
    const leftTimestamp = sourcePublishedTimestamp(left);
    const rightTimestamp = sourcePublishedTimestamp(right);
    if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
    }
    if (leftTimestamp !== null) return -1;
    if (rightTimestamp !== null) return 1;
    const dateDifference = String(right.published_date || '')
        .localeCompare(String(left.published_date || ''));
    if (dateDifference !== 0) return dateDifference;
    return String(left.id).localeCompare(String(right.id));
}

export function sortItemsBySourcePublishedAt(items) {
    return [...(items || [])].sort(comparePublishedItems);
}

function itemDisplayDate(item, owningReportDate) {
    return isRealDate(item?.published_date) ? item.published_date : owningReportDate;
}

function sourcePublishedBatch(item) {
    const timestamp = sourcePublishedTimestamp(item);
    if (timestamp === null) return item.batch;
    const beijingHour = (new Date(timestamp).getUTCHours() + 8) % 24;
    if (beijingHour < 5) return 'lateNight';
    if (beijingHour < 14) return 'morning';
    if (beijingHour < 22) return 'afternoon';
    return 'night';
}

export function projectPublishedCalendarReport(dateKey, reports) {
    if (!isRealDate(dateKey)) throw new Error('Invalid published calendar date');
    if (!Array.isArray(reports)) throw new Error('Published calendar reports must be an array');

    const baseReport = reports.find(report => report?.date === dateKey) || null;
    if (!baseReport) return null;

    const candidates = reports.flatMap(report => (
        (report?.items || [])
            .filter(item => itemDisplayDate(item, report.date) === dateKey)
            .map(item => ({ ...item, batch: sourcePublishedBatch(item) }))
    ));
    const deduplicated = deduplicateSameDay([], candidates).items;
    const items = sortItemsBySourcePublishedAt(deduplicated);
    const itemIds = new Set(items.map(item => item.id));
    const contributingGeneratedAt = reports
        .filter(report => report?.items?.some(item => itemIds.has(item.id)))
        .map(report => report.generated_at)
        .filter(Boolean)
        .sort()
        .at(-1);

    return {
        ...baseReport,
        generated_at: contributingGeneratedAt || baseReport.generated_at,
        batches: baseReport.batches.map(batch => {
            const batchItems = items.filter(item => item.batch === batch.id);
            return {
                ...batch,
                status: batchItems.length > 0 ? 'completed' : batch.status,
                item_ids: batchItems.map(item => item.id),
            };
        }),
        items,
    };
}
