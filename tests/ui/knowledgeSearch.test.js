import { describe, expect, it } from 'vitest';

import {
    itemMatchesKnowledgeState,
    knowledgeSearchForState,
    parseKnowledgeSearchState,
} from '../../static/js/knowledge-search.js';

const options = {
    topicIds: ['topic_agents', 'topic_models'],
    entityIds: ['entity_openai'],
};

describe('knowledge search URL state', () => {
    it('parses shareable stable IDs and drops unknown filters', () => {
        expect(parseKnowledgeSearchState(
            '?q=%20Claude%20&type=paper&topic=topic_agents&entity=entity_openai',
            options,
        )).toEqual({
            query: 'Claude',
            type: 'paper',
            topicId: 'topic_agents',
            entityId: 'entity_openai',
        });
        expect(parseKnowledgeSearchState(
            '?type=invalid&topic=topic_missing&entity=entity_missing',
            options,
        )).toEqual({ query: '', type: 'all', topicId: '', entityId: '' });
    });

    it('preserves unrelated parameters and removes default state', () => {
        expect(knowledgeSearchForState('?ref=nav&q=old', {
            query: '模型',
            type: 'news',
            topicId: 'topic_models',
            entityId: '',
        })).toBe('?ref=nav&q=%E6%A8%A1%E5%9E%8B&type=news&topic=topic_models');
        expect(knowledgeSearchForState('?ref=nav&q=old&type=news', {
            query: '',
            type: 'all',
            topicId: '',
            entityId: '',
        })).toBe('?ref=nav');
    });

    it('matches query, type, topic, and entity together', () => {
        const item = {
            dataset: {
                search: 'Claude Agent benchmark',
                contentType: 'paper',
                topics: 'topic_agents topic_research',
                entities: 'entity_anthropic',
            },
        };
        expect(itemMatchesKnowledgeState(item, {
            query: 'CLAUDE',
            type: 'paper',
            topicId: 'topic_agents',
            entityId: '',
        })).toBe(true);
        expect(itemMatchesKnowledgeState(item, {
            query: 'Claude',
            type: 'paper',
            topicId: 'topic_models',
            entityId: '',
        })).toBe(false);
    });
});
