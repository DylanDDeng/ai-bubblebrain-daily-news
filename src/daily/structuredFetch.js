import { STRUCTURED_SOURCE_ADAPTERS } from './sourceAdapters.js';

const CONTENT_TYPE_ORDER = ['news', 'project', 'paper', 'socialMedia'];

export async function fetchProviderPreservingData(env, foloCookie, {
    adapters = STRUCTURED_SOURCE_ADAPTERS,
} = {}) {
    const taggedByType = Object.fromEntries(CONTENT_TYPE_ORDER.map(type => [type, []]));
    const errors = [];

    for (const entry of adapters) {
        if (!taggedByType[entry.contentType]) {
            throw new Error(`Unknown structured content type: ${entry.contentType}`);
        }
        try {
            const raw = await entry.adapter.fetch(env, foloCookie);
            const transformed = entry.adapter.transform(raw, entry.contentType);
            if (!Array.isArray(transformed)) throw new Error('Adapter transform must return an array');
            taggedByType[entry.contentType].push(...transformed.map(item => ({
                provider: entry.provider,
                item,
            })));
        } catch (error) {
            errors.push({
                provider: entry.provider,
                content_type: entry.contentType,
                error_type: error?.name || 'Error',
            });
        }
    }

    const grouped = {};
    const structuredItems = [];
    for (const contentType of CONTENT_TYPE_ORDER) {
        const tagged = taggedByType[contentType];
        // Keep the exact legacy comparator semantics: invalid dates produce NaN,
        // which stable Array#sort treats as equality instead of moving the item.
        tagged.sort((left, right) => (
            new Date(right.item?.published_date).getTime()
            - new Date(left.item?.published_date).getTime()
        ));
        grouped[contentType] = tagged.map(entry => entry.item);
        structuredItems.push(...tagged.map(entry => ({
            ...entry.item,
            provider: entry.provider,
        })));
    }

    return {
        grouped,
        structuredItems,
        errors,
        sourceCounts: Object.fromEntries(
            CONTENT_TYPE_ORDER.map(type => [type, grouped[type].length]),
        ),
    };
}
