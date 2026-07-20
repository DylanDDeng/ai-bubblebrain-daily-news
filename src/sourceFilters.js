const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);

export function parseBlockedXHandles(value) {
    return new Set(
        String(value || '')
            .split(/[\s,]+/)
            .map(handle => handle.trim().replace(/^@/, '').toLowerCase())
            .filter(Boolean),
    );
}

export function xHandleFromItem(item) {
    const value = item?.url || item?.link || item?.external_url;
    if (!value) return null;
    try {
        const parsed = new URL(String(value));
        if (!X_HOSTS.has(parsed.hostname.toLowerCase())) return null;
        const handle = parsed.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
        if (!handle || ['i', 'home', 'intent', 'search', 'share'].includes(handle)) return null;
        return handle;
    } catch {
        return null;
    }
}

export function filterBlockedSourceItems(items, contentType, env) {
    if (!Array.isArray(items) || contentType !== 'socialMedia') return items;
    const blocked = parseBlockedXHandles(env?.X_BLOCKED_HANDLES);
    if (blocked.size === 0) return items;
    return items.filter(item => !blocked.has(xHandleFromItem(item)));
}

export function filterBlockedXItemsFromReport(report, value) {
    if (!report || !Array.isArray(report.items)) return { report, removedCount: 0 };
    const blocked = parseBlockedXHandles(value);
    if (blocked.size === 0) return { report, removedCount: 0 };
    const removedIds = new Set(
        report.items
            .filter(item => item.content_type === 'socialMedia' && blocked.has(xHandleFromItem(item)))
            .map(item => item.id),
    );
    if (removedIds.size === 0) return { report, removedCount: 0 };

    return {
        report: {
            ...report,
            batches: report.batches.map(batch => ({
                ...batch,
                item_ids: batch.item_ids.filter(id => !removedIds.has(id)),
            })),
            items: report.items
                .filter(item => !removedIds.has(item.id))
                .map(item => ({
                    ...item,
                    related_source_ids: item.related_source_ids.filter(id => !removedIds.has(id)),
                })),
        },
        removedCount: removedIds.size,
    };
}
