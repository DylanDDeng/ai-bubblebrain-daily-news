import { describe, expect, it } from 'vitest';

import type { KnowledgeSearchItem } from '../lib/searchIndex';
import { commandSearchMatches, normalizeCommandQuery } from './commandSearch';

const items: KnowledgeSearchItem[] = [
	{
		key: '/highlights/cursor-icons/',
		href: '/highlights/cursor-icons/',
		title: 'Cursor 图标是怎样做出来的',
		summary: '一套图标设计系统的完整复盘',
		section: 'highlights',
		section_label: '精选阅读',
		date: '2026-08-19',
		tags: ['Cursor', '设计系统'],
		external: false,
		search_text: 'cursor 图标是怎样做出来的 一套图标设计系统的完整复盘 精选阅读 设计系统',
	},
	{
		key: '/codex-tutorials/beginner/',
		href: '/codex-tutorials/beginner/',
		title: 'Codex App 新手入门',
		summary: '从界面到第一次任务',
		section: 'codex-tutorials',
		section_label: 'Codex 教程',
		date: '2026-05-04',
		tags: ['Codex'],
		external: false,
		search_text: 'codex app 新手入门 从界面到第一次任务 codex 教程',
	},
];

describe('command search ranking', () => {
	it('normalizes full-width and surrounding characters', () => {
		expect(normalizeCommandQuery('  Ｃｏｄｅｘ  ')).toBe('codex');
	});

	it('prioritizes title matches and keeps recent items for an empty query', () => {
		expect(commandSearchMatches(items, 'Codex').map((item) => item.href)).toEqual([
			'/codex-tutorials/beginner/',
		]);
		expect(commandSearchMatches(items, '')).toEqual(items);
	});

	it('matches section labels and tags through the shared search text', () => {
		expect(commandSearchMatches(items, '精选阅读')[0]?.title).toContain('Cursor');
		expect(commandSearchMatches(items, '设计系统')[0]?.title).toContain('Cursor');
	});
});
