import { BATCH_ORDER } from './dedupe.js';
import { canonicalizeUrl, createIdentity } from './identity.js';
import { getSourcePolicy } from './sourceRegistry.js';
import { isRealDate } from './time.js';
import { validateKnowledgeReport } from '../knowledge/taxonomy.js';

export function validateDailyReportSemantics(report, { enforcePhase1 = false } = {}) {
    const errors = [];
    if (!report || typeof report !== 'object') throw new Error('Invalid daily report semantics: invalid_report');
    if (!isRealDate(report.date)) errors.push('invalid_report_date');
    const batches = Array.isArray(report.batches) ? report.batches : [];
    const items = Array.isArray(report.items) ? report.items : [];
    if (!Array.isArray(report.batches)) errors.push('invalid_batches');
    if (!Array.isArray(report.items)) errors.push('invalid_items');
    const batchIds = batches.map(batch => batch.id);
    if (JSON.stringify(batchIds) !== JSON.stringify(BATCH_ORDER)) errors.push('invalid_batch_order');
    if (new Set(batchIds).size !== batchIds.length) errors.push('duplicate_batch_id');

    const itemIds = items.map(item => item.id);
    if (new Set(itemIds).size !== itemIds.length) errors.push('duplicate_item_id');
    const itemIdSet = new Set(itemIds);
    const memberships = new Map();

    for (const batch of batches) {
        const batchItems = Array.isArray(batch.item_ids) ? batch.item_ids : [];
        if (!Array.isArray(batch.item_ids)) errors.push(`invalid_batch_items:${batch.id}`);
        if (new Set(batchItems).size !== batchItems.length) errors.push(`duplicate_batch_item:${batch.id}`);
        for (const id of batchItems) {
            if (!itemIdSet.has(id)) errors.push(`unknown_batch_item:${id}`);
            memberships.set(id, (memberships.get(id) || 0) + 1);
        }
        if (batch.status === 'pending' && (batch.generated_at !== null || batchItems.length > 0)) {
            errors.push(`invalid_pending_batch:${batch.id}`);
        }
        if (batch.status === 'completed'
            && (typeof batch.generated_at !== 'string' || Number.isNaN(new Date(batch.generated_at).getTime()))) {
            errors.push(`invalid_completed_batch:${batch.id}`);
        }
        if (!['pending', 'completed'].includes(batch.status)) errors.push(`invalid_batch_status:${batch.id}`);
    }

    const claimOwners = new Map();
    for (const item of items) {
        const policy = getSourcePolicy(item.source_type);
        if (!policy) errors.push(`unknown_provider:${item.source_type}`);
        else if (item.content_type !== policy.contentType) errors.push(`content_type_mismatch:${item.id}`);
        if (item.source?.homepage !== null
            && item.source?.homepage !== canonicalizeUrl(item.source?.homepage)) {
            errors.push(`noncanonical_homepage:${item.id}`);
        }
        if (memberships.get(item.id) !== 1) errors.push(`invalid_batch_membership:${item.id}`);
        const batch = batches.find(candidate => candidate.id === item.batch);
        if (!batch?.item_ids?.includes(item.id)) errors.push(`item_batch_mismatch:${item.id}`);
        const suffix = typeof item.id === 'string' ? item.id.slice(2) : '';
        const claims = Array.isArray(item.identity_claims) ? item.identity_claims : [];
        if (!Array.isArray(item.identity_claims)) errors.push(`invalid_identity_claims:${item.id}`);
        if (!claims.includes(`c_${suffix}`)) errors.push(`primary_claim_missing:${item.id}`);
        for (const claim of claims) {
            const owner = claimOwners.get(claim);
            if (owner && owner !== item.id) errors.push(`identity_claim_collision:${claim}`);
            else claimOwners.set(claim, item.id);
        }
        const relatedIds = Array.isArray(item.related_source_ids) ? item.related_source_ids : [];
        if (!Array.isArray(item.related_source_ids)) errors.push(`invalid_related_sources:${item.id}`);
        if (relatedIds.includes(item.id)) errors.push(`self_related_source:${item.id}`);
        for (const related of relatedIds) {
            if (!itemIdSet.has(related)) errors.push(`unknown_related_source:${related}`);
        }

        if (item.time_precision === 'exact') {
            const instant = new Date(item.published_at);
            if (!item.published_at || Number.isNaN(instant.getTime()) || !isRealDate(item.published_date)) {
                errors.push(`invalid_exact_time:${item.id}`);
            } else {
                const parts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
                }).formatToParts(instant);
                const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
                if (`${values.year}-${values.month}-${values.day}` !== item.published_date) {
                    errors.push(`published_date_mismatch:${item.id}`);
                }
            }
        } else if (item.time_precision === 'date_only') {
            if (item.published_at !== null || !isRealDate(item.published_date)) {
                errors.push(`invalid_date_only_time:${item.id}`);
            }
        } else if (item.time_precision === 'inferred') {
            if (item.published_at !== null || (item.published_date !== null && !isRealDate(item.published_date))) {
                errors.push(`invalid_inferred_time:${item.id}`);
            }
        } else {
            errors.push(`invalid_time_precision:${item.id}`);
        }

        if (Number.isNaN(new Date(item.ingested_at).getTime())) errors.push(`invalid_ingested_at:${item.id}`);
    }

    if (enforcePhase1) {
        for (const item of items) {
            const suffix = typeof item.id === 'string' ? item.id.slice(2) : '';
            if (item.event_id !== `e_${suffix}`) errors.push(`phase1_event_id_mismatch:${item.id}`);
            if (item.canonical_url !== canonicalizeUrl(item.canonical_url)) errors.push(`noncanonical_url:${item.id}`);
            if (item.url !== item.canonical_url) errors.push(`url_canonical_mismatch:${item.id}`);
            if (item.source?.id !== item.source_id) errors.push(`source_id_mismatch:${item.id}`);
        }
    }

    if (errors.length > 0) throw new Error(`Invalid daily report semantics: ${errors.join(', ')}`);
    validateKnowledgeReport(report);
    return true;
}

export function validateReportFilename(report, path) {
    const match = /(?:^|\/)data\/daily\/(\d{4}-\d{2}-\d{2})\.json$/.exec(path);
    if (!match || match[1] !== report.date) throw new Error('Report filename does not match report date');
    return true;
}

export async function validateDailyReportIdentities(report) {
    const errors = [];
    for (const item of report?.items || []) {
        let derived;
        try {
            derived = await createIdentity({
                provider: item.source_type,
                sourceId: item.source_id,
                canonicalUrl: item.canonical_url,
                title: item.title,
                publishedDate: item.published_date,
            });
        } catch {
            errors.push(`identity_derivation_failed:${item.id}`);
            continue;
        }
        if (!derived) {
            errors.push(`identity_derivation_failed:${item.id}`);
            continue;
        }
        if (item.id !== derived.id) errors.push(`item_identity_mismatch:${item.id}`);
        if (item.identity_strategy !== derived.strategy) errors.push(`identity_strategy_mismatch:${item.id}`);
        for (const claim of derived.claims) {
            if (!item.identity_claims?.includes(claim)) errors.push(`derived_claim_missing:${item.id}`);
        }
    }

    if (errors.length > 0) throw new Error(`Invalid daily report identities: ${errors.join(', ')}`);
    return true;
}
