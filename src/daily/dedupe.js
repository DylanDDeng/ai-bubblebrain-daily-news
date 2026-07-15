export const BATCH_ORDER = ['morning', 'afternoon', 'night', 'lateNight'];

function compareStrings(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function union(parent, left, right) {
    const find = value => {
        let current = value;
        while (parent[current] !== current) {
            parent[current] = parent[parent[current]];
            current = parent[current];
        }
        return current;
    };
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function connectedGroups(entries) {
    const parent = entries.map((_, index) => index);
    const claimOwner = new Map();
    entries.forEach((entry, index) => {
        for (const claim of entry.item.identity_claims) {
            if (claimOwner.has(claim)) union(parent, index, claimOwner.get(claim));
            else claimOwner.set(claim, index);
        }
    });

    const find = value => {
        let current = value;
        while (parent[current] !== current) current = parent[current];
        return current;
    };
    const groups = new Map();
    entries.forEach((entry, index) => {
        const root = find(index);
        const group = groups.get(root) || [];
        group.push(entry);
        groups.set(root, group);
    });
    return Array.from(groups.values());
}

export function sortDailyItems(items) {
    return [...items].sort((left, right) => {
        const batchDifference = BATCH_ORDER.indexOf(left.batch) - BATCH_ORDER.indexOf(right.batch);
        if (batchDifference !== 0) return batchDifference;
        const leftPublished = left.published_at || `${left.published_date || '9999'}T23:59:59Z`;
        const rightPublished = right.published_at || `${right.published_date || '9999'}T23:59:59Z`;
        return compareStrings(leftPublished, rightPublished) || compareStrings(left.id, right.id);
    });
}

function mergeGroup(group) {
    const existing = group.filter(entry => entry.existing).sort((a, b) => compareStrings(a.item.id, b.item.id));
    if (existing.length > 1) {
        throw new Error('Incoming identity claims conflict with multiple existing items');
    }
    const candidates = group.map(entry => entry.item).sort((a, b) => compareStrings(a.id, b.id));
    const base = existing[0]?.item || candidates[0];
    const identityClaims = Array.from(new Set(group.flatMap(entry => entry.item.identity_claims))).sort();
    if (identityClaims.length > 64) throw new Error('Too many identity claims for one item');
    return {
        ...base,
        identity_claims: identityClaims,
    };
}

export function deduplicateSameDay(existingItems, incomingItems) {
    const entries = [
        ...(existingItems || []).map(item => ({ item, existing: true })),
        ...(incomingItems || []).map(item => ({ item, existing: false })),
    ];
    const groups = connectedGroups(entries);
    const items = sortDailyItems(groups.map(mergeGroup));
    const existingJson = JSON.stringify(sortDailyItems(existingItems || []));
    const mergedJson = JSON.stringify(items);
    const freshCount = groups.filter(group => !group.some(entry => entry.existing)).length;

    return {
        items,
        freshCount,
        duplicateCount: entries.length - groups.length,
        changed: existingJson !== mergedJson,
    };
}

function daysBetween(currentDate, priorDate) {
    const current = Date.parse(`${currentDate}T00:00:00Z`);
    const prior = Date.parse(`${priorDate}T00:00:00Z`);
    return Math.floor((current - prior) / 86400000);
}

export function partitionCrossDayDuplicates(incomingItems, recentReports, reportDate, lookbackDays = 7) {
    const historicalClaims = new Map();
    for (const report of recentReports || []) {
        const age = daysBetween(reportDate, report.date);
        if (age < 1 || age > lookbackDays) continue;
        for (const item of report.items || []) {
            for (const claim of item.identity_claims) {
                const existing = historicalClaims.get(claim);
                if (!existing || report.date > existing.date
                    || (report.date === existing.date && item.id < existing.id)) {
                    historicalClaims.set(claim, { date: report.date, id: item.id });
                }
            }
        }
    }

    const fresh = [];
    const duplicates = [];
    for (const item of incomingItems) {
        const match = item.identity_claims.map(claim => historicalClaims.get(claim)).find(Boolean);
        if (match) duplicates.push({ item, original_date: match.date, original_id: match.id });
        else fresh.push(item);
    }
    return { fresh, duplicates };
}
