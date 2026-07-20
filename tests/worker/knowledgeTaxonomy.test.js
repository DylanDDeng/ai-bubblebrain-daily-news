import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    classifyKnowledgeItem,
    resolveCanonicalTaxonomyId,
    taxonomy,
    validateKnowledgeReport,
    validateTaxonomyEvolution,
    validateTaxonomyRegistry,
} from '../../src/knowledge/taxonomy.js';
import { SOURCE_REGISTRY } from '../../src/daily/sourceRegistry.js';

let validateSchema;

function registry() {
    return structuredClone(taxonomy);
}

beforeAll(async () => {
    const schema = JSON.parse(await readFile(
        new URL('../../schemas/knowledge-taxonomy.schema.json', import.meta.url),
        'utf8',
    ));
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    validateSchema = ajv.compile(schema);
});

describe('knowledge taxonomy registry', () => {
    it('is JSON Schema valid and passes semantic validation', () => {
        expect(validateSchema(taxonomy), validateSchema.errors).toBe(true);
        expect(validateTaxonomyRegistry()).toBe(true);
    });

    it('rejects duplicate IDs and canonical or historical slug collisions', () => {
        const duplicateId = registry();
        duplicateId.topics[1].id = duplicateId.topics[0].id;
        expect(() => validateTaxonomyRegistry(duplicateId)).toThrow('duplicate_topic_id');

        const duplicateSlug = registry();
        duplicateSlug.topics[1].slug_aliases.push(duplicateSlug.topics[0].slug);
        expect(() => validateTaxonomyRegistry(duplicateSlug)).toThrow('duplicate_topic_slug');

        const canonicalRepeated = registry();
        canonicalRepeated.entities[0].slug_aliases.push(canonicalRepeated.entities[0].slug);
        expect(() => validateTaxonomyRegistry(canonicalRepeated)).toThrow(
            'duplicate_entity_slug',
        );
    });

    it('enforces tombstones and same-registry active merge targets', () => {
        const merged = registry();
        merged.entities.find(entry => entry.id === 'entity_xai').status = 'merged';
        merged.entities.find(entry => entry.id === 'entity_xai').redirect_to_id = 'entity_openai';
        expect(validateTaxonomyRegistry(merged)).toBe(true);

        const missingTarget = registry();
        missingTarget.entities.find(entry => entry.id === 'entity_xai').status = 'merged';
        missingTarget.entities.find(entry => entry.id === 'entity_xai').redirect_to_id = 'entity_missing';
        expect(() => validateTaxonomyRegistry(missingTarget)).toThrow(
            'invalid_merge_target:entity_xai',
        );

        const deprecatedRedirect = registry();
        deprecatedRedirect.entities[0].status = 'deprecated';
        deprecatedRedirect.entities[0].redirect_to_id = 'entity_anthropic';
        expect(() => validateTaxonomyRegistry(deprecatedRedirect)).toThrow(
            'deprecated_redirect:entity_openai',
        );
    });

    it('rejects dangling provider mappings and normalized mapping collisions', () => {
        const dangling = registry();
        dangling.provider_mappings.aibase.topics.models = ['topic_missing'];
        expect(() => validateTaxonomyRegistry(dangling)).toThrow(
            'unknown_provider_topic:aibase:topic_missing',
        );

        const collision = registry();
        collision.provider_mappings.aibase.topics.Models = ['topic_models'];
        expect(() => validateTaxonomyRegistry(collision)).toThrow(
            'duplicate_provider_mapping:aibase:topics',
        );

        const nonActiveTarget = registry();
        nonActiveTarget.topics[0].status = 'merged';
        nonActiveTarget.topics[0].redirect_to_id = 'topic_agents';
        expect(() => validateTaxonomyRegistry(nonActiveTarget)).toThrow(
            'non_active_provider_topic:aibase:topic_models',
        );
    });

    it('requires provider mappings to exactly cover the structured source registry', () => {
        expect(Object.keys(taxonomy.provider_mappings).sort()).toEqual(
            Object.keys(SOURCE_REGISTRY).sort(),
        );
        const missing = registry();
        delete missing.provider_mappings.reddit;
        expect(() => validateTaxonomyRegistry(missing)).toThrow(
            'missing_provider_mapping:reddit',
        );

        const extra = registry();
        extra.provider_mappings.caixin = { topics: {}, entities: {} };
        expect(() => validateTaxonomyRegistry(extra)).toThrow(
            'unknown_provider_mapping:caixin',
        );
    });

    it('rejects destructive identity, slug, alias, and entity-type evolution', () => {
        const removedId = registry();
        removedId.entities = removedId.entities.filter(entry => entry.id !== 'entity_xai');
        expect(() => validateTaxonomyEvolution(taxonomy, removedId)).toThrow(
            'removed_entity_id:entity_xai',
        );

        const removedAlias = registry();
        removedAlias.topics[0].slug_aliases = [];
        expect(() => validateTaxonomyEvolution(taxonomy, removedAlias)).toThrow(
            'removed_topic_slug_alias:topic_models:foundation-models',
        );

        const changedType = registry();
        changedType.entities[0].entity_type = 'model';
        expect(() => validateTaxonomyEvolution(taxonomy, changedType)).toThrow(
            'changed_entity_type:entity_openai',
        );

        const previousTombstone = registry();
        previousTombstone.entities.find(entry => entry.id === 'entity_xai').status = 'deprecated';
        expect(() => validateTaxonomyEvolution(previousTombstone, taxonomy)).toThrow(
            'reactivated_entity_tombstone:entity_xai',
        );
    });
});

describe('knowledge classification', () => {
    it('maps trusted provider values case-insensitively and keeps registry order', () => {
        expect(classifyKnowledgeItem(
            { category: 'MODELS', topics: ['Open Source'] },
            { provider: 'AIBASE', title: 'An agent release on GitHub', summary: '', sourceName: 'Feed' },
        )).toMatchObject({
            category: 'models',
            topicIds: ['topic_models', 'topic_agents', 'topic_open_source'],
        });
    });

    it('handles Chinese keywords and Latin word boundaries without substring noise', () => {
        expect(classifyKnowledgeItem(
            {},
            { provider: 'reddit', title: '新模型与多智能体研究', summary: '', sourceName: '' },
        ).topicIds).toEqual(['topic_models', 'topic_agents', 'topic_research']);

        expect(classifyKnowledgeItem(
            {},
            { provider: 'reddit', title: 'A modeling toolkit for an agent product', summary: '', sourceName: '' },
        ).topicIds).toEqual(['topic_agents', 'topic_products']);
    });

    it('uses search aliases as deterministic fallback terms', () => {
        expect(classifyKnowledgeItem(
            {},
            { provider: 'reddit', title: 'A new industry update', summary: '', sourceName: '' },
        ).topicIds).toEqual(['topic_business']);
    });

    it.each([
        ['aibase', { category: 'models' }, '', 'topic_models'],
        ['xiaohu', { category: 'agent' }, '', 'topic_agents'],
        ['qbit', { category: '模型' }, '', 'topic_models'],
        ['xinzhiyuan', { category: '研究' }, '', 'topic_research'],
        ['openai_newsroom', { category: 'product' }, '', 'topic_products'],
        ['anthropic_research', { category: 'research' }, '', 'topic_research'],
        ['github_trending', { category: 'github' }, '', 'topic_open_source'],
        ['huggingface_papers', { category: 'paper' }, '', 'topic_research'],
        ['jiqizhixin', { category: '研究' }, '', 'topic_research'],
        ['twitter', {}, 'agent workflow', 'topic_agents'],
        ['twitter_extra', {}, 'product launch', 'topic_products'],
        ['reddit', {}, 'research benchmark', 'topic_research'],
    ])('classifies the %s adapter through mapping or fallback', (provider, raw, title, expected) => {
        expect(classifyKnowledgeItem(
            raw,
            { provider, title, summary: '', sourceName: 'Feed' },
        ).topicIds).toContain(expected);
    });

    it('ignores unknown provider values, then applies deterministic fallback classification', () => {
        const input = {
            raw: { category: 'not-a-topic', topics: ['also-unknown'], entities: ['unknown-company'] },
            context: {
                provider: 'unknown-provider',
                title: 'Claude agent benchmark',
                summary: 'Research results',
                sourceName: 'Example',
            },
        };
        const first = classifyKnowledgeItem(input.raw, input.context);
        const second = classifyKnowledgeItem(input.raw, input.context);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
            topicIds: ['topic_models', 'topic_agents', 'topic_research'],
            entityIds: ['entity_anthropic'],
        });
    });

    it('uses topic_other only when no topic can be classified', () => {
        expect(classifyKnowledgeItem(
            {},
            { provider: 'reddit', title: 'Weekly digest', summary: '', sourceName: 'Example' },
        )).toMatchObject({ category: 'other', topicIds: ['topic_other'], entityIds: [] });
    });
});

describe('daily report taxonomy references', () => {
    const report = {
        taxonomy_version: 1,
        classifier_version: 1,
        items: [{ topic_ids: ['topic_products'], entity_ids: ['entity_openai'] }],
    };

    it('accepts active references and rejects version or referential drift', () => {
        expect(validateKnowledgeReport(report)).toBe(true);
        expect(() => validateKnowledgeReport({ ...report, taxonomy_version: 2 })).toThrow(
            'taxonomy_version_mismatch',
        );
        expect(() => validateKnowledgeReport({
            ...report,
            items: [{ topic_ids: ['topic_missing'], entity_ids: [] }],
        })).toThrow('unknown_topic_id:topic_missing');
        expect(() => validateKnowledgeReport({
            ...report,
            items: [{ topic_ids: ['topic_products'], entity_ids: ['entity_missing'] }],
        })).toThrow('unknown_entity_id:entity_missing');
    });

    it('accepts historical merged and deprecated IDs while resolving canonical aggregation', () => {
        const evolved = registry();
        const merged = evolved.entities.find(entry => entry.id === 'entity_xai');
        merged.status = 'merged';
        merged.redirect_to_id = 'entity_openai';
        const deprecated = evolved.entities.find(entry => entry.id === 'entity_qwen');
        deprecated.status = 'deprecated';

        expect(validateKnowledgeReport({
            ...report,
            items: [{
                topic_ids: ['topic_products'],
                entity_ids: ['entity_xai', 'entity_qwen'],
            }],
        }, evolved)).toBe(true);
        expect(resolveCanonicalTaxonomyId('entity_xai', 'entity', evolved)).toBe('entity_openai');
        expect(resolveCanonicalTaxonomyId('entity_qwen', 'entity', evolved)).toBe('entity_qwen');
    });
});
