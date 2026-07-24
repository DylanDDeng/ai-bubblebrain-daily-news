const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TERMINAL_GRACE_MS = 10 * 60 * 1000;

export const SCHEDULE_UTC_HOURS = Object.freeze([
    0, 2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23,
]);
export const SCHEDULE_HEALTH_PAGE_SIZE = 16;

const SCHEDULE_UTC_HOUR_SET = new Set(SCHEDULE_UTC_HOURS);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function beijingParts(date) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date).map(part => [part.type, part.value]));
}

function beijingDate(date) {
    const parts = beijingParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function addReportDays(reportDate, days) {
    const date = new Date(`${reportDate}T00:00:00+08:00`);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid report date');
    date.setUTCDate(date.getUTCDate() + days);
    return beijingDate(date);
}

function normalizeScheduledInstant(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error('Invalid scheduled instant');
    parsed.setUTCSeconds(0, 0);
    if (
        parsed.getUTCMinutes() !== 0 ||
        !SCHEDULE_UTC_HOUR_SET.has(parsed.getUTCHours())
    ) {
        throw new Error('Instant is not in the production schedule');
    }
    return parsed;
}

function batchForBeijingHour(hour) {
    if (hour >= 2 && hour < 5) return 'lateNight';
    if (hour >= 22 || hour < 2) return 'night';
    if (hour >= 14 && hour < 22) return 'afternoon';
    return 'morning';
}

export function scheduledRunId(value) {
    const scheduled = normalizeScheduledInstant(value);
    return `scheduled:${scheduled.getTime()}`;
}

export function resolveScheduledRun(value) {
    const scheduled = normalizeScheduledInstant(value);
    const local = beijingParts(scheduled);
    const localHour = Number(local.hour);
    const batchId = batchForBeijingHour(localHour);
    const localDate = `${local.year}-${local.month}-${local.day}`;
    const reportDate =
        batchId === 'lateNight' ? addReportDays(localDate, -1) : localDate;
    const scheduledAt = scheduled.toISOString();
    return {
        batch_id: batchId,
        deadline: new Date(scheduled.getTime() + TERMINAL_GRACE_MS).toISOString(),
        publication_batch_id:
            batchId === 'lateNight' && localHour === 3
                ? 'lateNightSupplement'
                : batchId,
        report_date: reportDate,
        run_id: `scheduled:${scheduled.getTime()}`,
        scheduled_at: scheduledAt,
    };
}

export function scheduledRunsBetween(start, end) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        throw new Error('Invalid schedule range');
    }
    const firstDay = new Date(startMs);
    firstDay.setUTCHours(0, 0, 0, 0);
    const runs = [];
    for (
        let day = firstDay.getTime();
        day <= endMs;
        day += DAY_MS
    ) {
        for (const hour of SCHEDULE_UTC_HOURS) {
            const scheduledAt = day + hour * HOUR_MS;
            if (scheduledAt < startMs || scheduledAt > endMs) continue;
            runs.push(resolveScheduledRun(scheduledAt));
        }
    }
    return runs;
}

export function dueScheduledRuns(
    now = Date.now(),
    lookbackHours = 30,
    terminalGraceMs = TERMINAL_GRACE_MS,
) {
    if (
        !Number.isFinite(now) ||
        !Number.isFinite(lookbackHours) ||
        lookbackHours <= 0 ||
        !Number.isFinite(terminalGraceMs) ||
        terminalGraceMs < 0
    ) {
        throw new Error('Invalid due schedule range');
    }
    const start = now - lookbackHours * HOUR_MS;
    return scheduledRunsBetween(start, now).filter(
        run => Date.parse(run.scheduled_at) + terminalGraceMs <= now,
    );
}

export function scheduledRunsForReportDate(reportDate) {
    if (!DATE.test(String(reportDate || ''))) {
        throw new Error('Invalid report date');
    }
    const start = Date.parse(`${reportDate}T00:00:00+08:00`) - 4 * HOUR_MS;
    const end = start + 36 * HOUR_MS;
    const runs = scheduledRunsBetween(start, end).filter(
        run => run.report_date === reportDate,
    );
    if (runs.length !== SCHEDULE_UTC_HOURS.length) {
        throw new Error('Report date does not resolve to sixteen scheduled runs');
    }
    return runs;
}

export function chunkScheduledRuns(
    runs,
    pageSize = SCHEDULE_HEALTH_PAGE_SIZE,
) {
    if (
        !Array.isArray(runs) ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > SCHEDULE_HEALTH_PAGE_SIZE
    ) {
        throw new Error('Invalid schedule health page');
    }
    const pages = [];
    for (let index = 0; index < runs.length; index += pageSize) {
        pages.push(runs.slice(index, index + pageSize));
    }
    return pages;
}
