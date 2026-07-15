export function isRealDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

export function isExplicitInstant(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):?(\d{2}))$/i
        .exec(value.trim());
    if (!match || !isRealDate(match[1])) return false;
    const hour = Number(match[2]);
    const minute = Number(match[3]);
    const second = Number(match[4] || 0);
    if (hour > 23 || minute > 59 || second > 59) return false;
    if (match[5].toUpperCase() !== 'Z') {
        const offsetHour = Number(match[6]);
        const offsetMinute = Number(match[7]);
        if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
    }
    return !Number.isNaN(new Date(value).getTime());
}
