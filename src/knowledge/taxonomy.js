import taxonomy from '../../data/knowledge/taxonomy.json' with { type: 'json' };
import { SOURCE_REGISTRY } from '../daily/sourceRegistry.js';

const normalizeKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en');
const topicsById = new Map(taxonomy.topics.map(topic => [topic.id, topic]));

function assertUnique(values, error) {
    if (new Set(values).size !== values.length) throw new Error(error);
}

export function validateTaxonomyRegistry(
    registry = taxonomy,
    { validateProviderCoverage = true } = {},
) {
    if (registry.schema_version !== 1 || registry.classifier_version !== 1) {
        throw new Error('unsupported_taxonomy_version');
    }
    for (const [type, entries, idPattern] of [
        ['topic', registry.topics, /^topic_[a-z0-9_]{2,63}$/],
        ['entity', registry.entities, /^entity_[a-z0-9_]{2,63}$/],
    ]) {
        assertUnique(entries.map(entry => entry.id), `duplicate_${type}_id`);
        assertUnique(entries.flatMap(entry => [entry.slug, ...entry.slug_aliases]), `duplicate_${type}_slug`);
        const byId = new Map(entries.map(entry => [entry.id, entry]));
        for (const entry of entries) {
            if (!idPattern.test(entry.id)) throw new Error(`invalid_${type}_id:${entry.id}`);
            if (entry.slug_aliases.includes(entry.slug)) throw new Error(`canonical_slug_repeated:${entry.id}`);
            if (entry.status === 'active' && entry.redirect_to_id !== null) {
                throw new Error(`active_redirect:${entry.id}`);
            }
            if (entry.status === 'deprecated' && entry.redirect_to_id !== null) {
                throw new Error(`deprecated_redirect:${entry.id}`);
            }
            if (entry.status === 'merged') {
                const target = byId.get(entry.redirect_to_id);
                if (!target || target.id === entry.id || target.status !== 'active') {
                    throw new Error(`invalid_merge_target:${entry.id}`);
                }
            }
        }
    }
    const registryTopics = new Set(registry.topics.map(entry => entry.id));
    const registryEntities = new Set(registry.entities.map(entry => entry.id));
    const expectedProviders = Object.keys(SOURCE_REGISTRY).sort();
    const actualProviders = Object.keys(registry.provider_mappings).map(normalizeKey).sort();
    assertUnique(actualProviders, 'duplicate_provider_name');
    if (validateProviderCoverage) {
        for (const provider of expectedProviders) {
            if (!actualProviders.includes(provider)) throw new Error(`missing_provider_mapping:${provider}`);
        }
        for (const provider of actualProviders) {
            if (!expectedProviders.includes(provider)) throw new Error(`unknown_provider_mapping:${provider}`);
        }
    }
    for (const [provider, mapping] of Object.entries(registry.provider_mappings)) {
        for (const type of ['topics', 'entities']) {
            const normalizedKeys = Object.keys(mapping[type]).map(normalizeKey);
            assertUnique(normalizedKeys, `duplicate_provider_mapping:${provider}:${type}`);
        }
        for (const ids of Object.values(mapping.topics)) {
            for (const id of ids) {
                if (!registryTopics.has(id)) throw new Error(`unknown_provider_topic:${provider}:${id}`);
                if (registry.topics.find(entry => entry.id === id)?.status !== 'active') {
                    throw new Error(`non_active_provider_topic:${provider}:${id}`);
                }
            }
        }
        for (const ids of Object.values(mapping.entities)) {
            for (const id of ids) {
                if (!registryEntities.has(id)) throw new Error(`unknown_provider_entity:${provider}:${id}`);
                if (registry.entities.find(entry => entry.id === id)?.status !== 'active') {
                    throw new Error(`non_active_provider_entity:${provider}:${id}`);
                }
            }
        }
    }
    return true;
}

export function validateTaxonomyEvolution(previous, current = taxonomy) {
    validateTaxonomyRegistry(previous, { validateProviderCoverage: false });
    validateTaxonomyRegistry(current);
    for (const [type, previousEntries, currentEntries] of [
        ['topic', previous.topics, current.topics],
        ['entity', previous.entities, current.entities],
    ]) {
        const currentById = new Map(currentEntries.map(entry => [entry.id, entry]));
        for (const previousEntry of previousEntries) {
            const currentEntry = currentById.get(previousEntry.id);
            if (!currentEntry) throw new Error(`removed_${type}_id:${previousEntry.id}`);
            if (type === 'entity' && previousEntry.entity_type !== currentEntry.entity_type) {
                throw new Error(`changed_entity_type:${previousEntry.id}`);
            }
            const currentSlugs = new Set([currentEntry.slug, ...currentEntry.slug_aliases]);
            if (!currentSlugs.has(previousEntry.slug)) {
                throw new Error(`removed_${type}_slug:${previousEntry.id}:${previousEntry.slug}`);
            }
            for (const alias of previousEntry.slug_aliases) {
                if (!currentSlugs.has(alias)) {
                    throw new Error(`removed_${type}_slug_alias:${previousEntry.id}:${alias}`);
                }
            }
            if (previousEntry.status !== 'active' && currentEntry.status === 'active') {
                throw new Error(`reactivated_${type}_tombstone:${previousEntry.id}`);
            }
            if (
                previousEntry.status === 'merged'
                && currentEntry.redirect_to_id !== previousEntry.redirect_to_id
            ) {
                throw new Error(`changed_${type}_merge_target:${previousEntry.id}`);
            }
        }
    }
    return true;
}

function resolveMappedValues(provider, type, rawValues) {
    const mapping = taxonomy.provider_mappings[normalizeKey(provider)]?.[type] || {};
    const resolved = new Set();
    for (const rawValue of rawValues) {
        for (const id of mapping[normalizeKey(rawValue)] || []) resolved.add(id);
    }
    return resolved;
}

function includesKeyword(haystack, keyword) {
    const needle = normalizeKey(keyword);
    if (!needle) return false;
    if (/^[a-z0-9.-]+$/.test(needle)) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(haystack);
    }
    return haystack.includes(needle);
}

function sortedKnownIds(ids, registry) {
    return registry.filter(entry => ids.has(entry.id) && entry.status === 'active').map(entry => entry.id);
}

export function classifyKnowledgeItem(raw, { provider, title, summary, sourceName } = {}) {
    const rawTopics = [raw?.category, ...(Array.isArray(raw?.topics) ? raw.topics : [])];
    const rawEntities = Array.isArray(raw?.entities) ? raw.entities : [];
    const topicIds = resolveMappedValues(provider, 'topics', rawTopics);
    const entityIds = resolveMappedValues(provider, 'entities', rawEntities);
    const searchable = normalizeKey([title, summary, sourceName, provider].filter(Boolean).join(' '));

    for (const topic of taxonomy.topics) {
        const matchTerms = [...topic.aliases, ...topic.keywords];
        if (topic.status === 'active' && matchTerms.some(keyword => includesKeyword(searchable, keyword))) {
            topicIds.add(topic.id);
        }
    }
    for (const entity of taxonomy.entities) {
        const matchTerms = [...entity.aliases, ...entity.keywords];
        if (entity.status === 'active' && matchTerms.some(keyword => includesKeyword(searchable, keyword))) {
            entityIds.add(entity.id);
        }
    }
    if (topicIds.size === 0) topicIds.add('topic_other');
    const orderedTopics = sortedKnownIds(topicIds, taxonomy.topics);
    const orderedEntities = sortedKnownIds(entityIds, taxonomy.entities);
    const primaryTopic = topicsById.get(orderedTopics[0]);
    return {
        category: primaryTopic?.category || 'other',
        topicIds: orderedTopics,
        entityIds: orderedEntities,
        taxonomyVersion: taxonomy.schema_version,
        classifierVersion: taxonomy.classifier_version,
    };
}

export function resolveCanonicalTaxonomyId(id, type, registry = taxonomy) {
    const entries = type === 'topic' ? registry.topics : registry.entities;
    const record = entries.find(entry => entry.id === id);
    if (!record) throw new Error(`unknown_${type}_id:${id}`);
    return record.status === 'merged' ? record.redirect_to_id : record.id;
}

export function validateKnowledgeReferences(item, registry = taxonomy) {
    const registryTopics = new Set(registry.topics.map(entry => entry.id));
    const registryEntities = new Set(registry.entities.map(entry => entry.id));
    if (!Array.isArray(item?.topic_ids) || item.topic_ids.length === 0) {
        throw new Error('missing_topic_ids');
    }
    for (const id of item.topic_ids) {
        if (!registryTopics.has(id)) throw new Error(`unknown_topic_id:${id}`);
    }
    for (const id of item.entity_ids || []) {
        if (!registryEntities.has(id)) throw new Error(`unknown_entity_id:${id}`);
    }
    return true;
}

export function validateKnowledgeReport(report, registry = taxonomy) {
    validateTaxonomyRegistry(registry);
    if (report?.taxonomy_version !== registry.schema_version) throw new Error('taxonomy_version_mismatch');
    if (report?.classifier_version !== registry.classifier_version) throw new Error('classifier_version_mismatch');
    for (const item of report?.items || []) validateKnowledgeReferences(item, registry);
    return true;
}

export { taxonomy };
