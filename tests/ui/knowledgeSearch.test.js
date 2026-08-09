import { describe, expect, it } from 'vitest';

import {
    itemMatchesKnowledgeState,
    knowledgeSearchForState,
    parseKnowledgeSearchState,
} from '../../static/js/knowledge-search.js';

const sections = ['highlights', 'prompts', 'model-evals'];

describe('knowledge search URL state', () => {
    it('parses a query and known knowledge section', () => {
        expect(parseKnowledgeSearchState('?q=%20Claude%20&section=prompts', sections)).toEqual({
            query: 'Claude',
            section: 'prompts',
        });
        expect(parseKnowledgeSearchState('?section=daily', sections)).toEqual({
            query: '',
            section: '',
        });
    });

    it('preserves unrelated parameters and removes empty state', () => {
        expect(knowledgeSearchForState('?ref=nav&q=old', {
            query: '模型',
            section: 'model-evals',
        })).toBe('?ref=nav&q=%E6%A8%A1%E5%9E%8B&section=model-evals');
        expect(knowledgeSearchForState('?ref=nav&q=old&section=prompts', {
            query: '',
            section: '',
        })).toBe('?ref=nav');
    });

    it('matches normalized text and section together', () => {
        const item = {
            dataset: {
                search: 'Claude Agent benchmark',
                section: 'model-evals',
            },
        };
        expect(itemMatchesKnowledgeState(item, {
            query: 'CLAUDE',
            section: 'model-evals',
        })).toBe(true);
        expect(itemMatchesKnowledgeState(item, {
            query: 'Claude',
            section: 'prompts',
        })).toBe(false);
    });
});
