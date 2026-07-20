import { buildDailyArtifacts } from './buildArtifacts.js';
import { getFromKV, storeInKV } from '../kv.js';
import { previousReportDates } from './time.js';

const SHADOW_TTL_SECONDS = 14 * 24 * 60 * 60;

function reportKey(date) {
    return `structured:shadow:report:${date}`;
}

export async function runStructuredShadow(env, {
    reportDate,
    batch,
    runAt,
    rawItems,
    structuredStartDate,
    producer,
}, {
    build = buildDailyArtifacts,
    readKv = getFromKV,
    writeKv = storeInKV,
} = {}) {
    if (!env.DATA_KV) throw new Error('Shadow DATA_KV is required');
    const existingReport = await readKv(env.DATA_KV, reportKey(reportDate));
    const historyDates = previousReportDates(reportDate)
        .filter(date => date >= structuredStartDate);
    const recentReports = [];
    for (const date of historyDates) {
        const report = await readKv(env.DATA_KV, reportKey(date));
        if (report) recentReports.push(report);
    }

    const result = await build({
        existingReport,
        recentReports,
        rawItems,
        reportDate,
        batch,
        runAt,
        producer,
        blockedXHandles: env.X_BLOCKED_HANDLES || '',
        structuredStartDate,
    });
    await writeKv(env.DATA_KV, reportKey(reportDate), result.report, SHADOW_TTL_SECONDS);

    try {
        await writeKv(env.DATA_KV, `structured:shadow:metrics:${reportDate}:${batch}`, {
            status: 'passed',
            run_at: runAt,
            no_op: result.noOp,
            metrics: result.metrics,
        }, SHADOW_TTL_SECONDS);
    } catch (error) {
        console.warn('[StructuredShadow] metrics write failed', { errorType: error?.name || 'Error' });
    }

    return {
        status: 'passed',
        noOp: result.noOp,
        metrics: result.metrics,
    };
}
