import { BATCH_ORDER, deduplicateSameDay, partitionCrossDayDuplicates, sortDailyItems } from './dedupe.js';
import { normalizeSourceItem } from './normalize.js';
import { createDailyReportArtifacts } from './serialize.js';
import { validateDailyReportIdentities, validateDailyReportSemantics } from './semanticValidate.js';
import { validateDailyReportSchema } from './schemaValidate.js';
import { isExplicitInstant, isRealDate } from './time.js';

const BATCH_LABELS = {
    morning: '10:00 更新',
    afternoon: '15:00 更新',
    night: '23:00 更新',
    lateNight: '次日 03:00 补充更新',
};

function previousReportDates(reportDate, days = 7) {
    const anchor = new Date(`${reportDate}T00:00:00Z`);
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(anchor);
        date.setUTCDate(date.getUTCDate() - index - 1);
        return date.toISOString().slice(0, 10);
    });
}

function assertHistoryCompleteness(recentReports, reportDate, structuredStartDate) {
    if (!structuredStartDate) return;
    const loadedDates = new Set(recentReports.map(report => report.date));
    for (const date of previousReportDates(reportDate)) {
        if (date < structuredStartDate) continue;
        if (!loadedDates.has(date)) throw new Error(`Missing structured history report: ${date}`);
    }
}

function baseOverview() {
    return {
        text: '今日 AI 增量日报正在更新中。',
        kind: 'pending',
        provenance: { method: 'template', model: null, prompt_version: null },
    };
}

export async function buildDailyArtifacts({
    existingReport = null,
    recentReports = [],
    structuredStartDate,
    rawItems = [],
    reportDate,
    batch,
    runAt,
    producer,
}) {
    if (!isRealDate(reportDate)) throw new Error('Invalid report date');
    if (!BATCH_ORDER.includes(batch)) throw new Error('Invalid batch');
    if (!Array.isArray(rawItems)) throw new Error('rawItems must be an array');
    if (rawItems.length > 1000) throw new Error('Too many rawItems');
    if (!Array.isArray(recentReports)) throw new Error('recentReports must be an array');
    if (!isRealDate(structuredStartDate)) {
        throw new Error('Invalid structuredStartDate');
    }
    if (structuredStartDate > reportDate) throw new Error('structuredStartDate cannot be after reportDate');
    if (!isExplicitInstant(runAt)) {
        if (Number.isNaN(new Date(runAt).getTime())) throw new Error('Invalid runAt');
        throw new Error('runAt must include an explicit timezone');
    }
    const runDate = new Date(runAt);
    if (Number.isNaN(runDate.getTime())) throw new Error('Invalid runAt');
    if (!producer?.version) throw new Error('Producer version is required');

    if (existingReport?.date !== undefined && existingReport.date !== reportDate) {
        throw new Error('Existing report date mismatch');
    }
    if (existingReport && new Date(existingReport.generated_at).getTime() > runDate.getTime()) {
        throw new Error('runAt precedes the existing report');
    }
    if (new Set(recentReports.map(report => report?.date)).size !== recentReports.length) {
        throw new Error('Duplicate structured history report date');
    }
    if (existingReport) {
        validateDailyReportSchema(existingReport);
        validateDailyReportSemantics(existingReport, { enforcePhase1: true });
        await validateDailyReportIdentities(existingReport);
    }
    for (const report of recentReports) {
        validateDailyReportSchema(report);
        validateDailyReportSemantics(report, { enforcePhase1: true });
        await validateDailyReportIdentities(report);
    }
    assertHistoryCompleteness(recentReports, reportDate, structuredStartDate);

    const normalizedResults = await Promise.all(rawItems.map(raw => normalizeSourceItem(raw, {
        provider: raw?.provider,
        batch,
        runAt: runDate.toISOString(),
    })));
    const accepted = normalizedResults.filter(result => result.accepted).map(result => result.item);
    const rejected = normalizedResults.filter(result => !result.accepted).map(result => result.reason);
    const crossDay = partitionCrossDayDuplicates(accepted, recentReports, reportDate, 7);
    const sameDay = deduplicateSameDay(existingReport?.items || [], crossDay.fresh);

    const existingBatch = existingReport?.batches.find(existing => existing.id === batch);
    if (existingReport && !sameDay.changed && existingBatch?.status === 'completed') {
        const artifacts = createDailyReportArtifacts(existingReport);
        return {
            report: existingReport,
            ...artifacts,
            metrics: {
                raw_count: rawItems.length,
                accepted_count: accepted.length,
                rejected_count: rejected.length,
                same_day_duplicate_count: sameDay.duplicateCount,
                cross_day_duplicate_count: crossDay.duplicates.length,
                fresh_count: 0,
                history_days_loaded: recentReports.length,
                cold_start: recentReports.length === 0,
            },
            rejected,
            crossDayDuplicates: crossDay.duplicates,
            noOp: true,
        };
    }

    const generatedAt = runDate.toISOString();
    const items = sortDailyItems(sameDay.items);
    const report = {
        schema_version: 1,
        identity_version: 1,
        dedupe_version: 1,
        date: reportDate,
        timezone: 'Asia/Shanghai',
        generated_at: generatedAt,
        overview: existingReport?.overview || baseOverview(),
        producer: {
            name: 'bubble-brain-worker',
            version: producer.version,
            commit_sha: producer.commitSha || null,
            dedupe_lookback_days: 7,
        },
        batches: BATCH_ORDER.map(id => {
            const previous = existingReport?.batches.find(existing => existing.id === id);
            const isCurrent = id === batch;
            const completed = isCurrent || previous?.status === 'completed';
            return {
                id,
                label: BATCH_LABELS[id],
                status: completed ? 'completed' : 'pending',
                generated_at: isCurrent ? generatedAt : previous?.generated_at || null,
                item_ids: items.filter(item => item.batch === id).map(item => item.id),
            };
        }),
        items,
    };
    validateDailyReportSchema(report);
    validateDailyReportSemantics(report, { enforcePhase1: true });
    await validateDailyReportIdentities(report);
    const artifacts = createDailyReportArtifacts(report);
    return {
        report,
        ...artifacts,
        metrics: {
            raw_count: rawItems.length,
            accepted_count: accepted.length,
            rejected_count: rejected.length,
            same_day_duplicate_count: sameDay.duplicateCount,
            cross_day_duplicate_count: crossDay.duplicates.length,
            fresh_count: sameDay.freshCount,
            history_days_loaded: recentReports.length,
            cold_start: recentReports.length === 0,
        },
        rejected,
        crossDayDuplicates: crossDay.duplicates,
        noOp: false,
    };
}
