import { describe, expect, it } from 'vitest';

import {
	classifyArticleImage,
	parseFigureTitle,
	responsiveVariantPath,
	responsiveWidths,
} from './articleFigures';

describe('article figure rendering', () => {
	it('classifies figures by useful reading width while respecting explicit overrides', () => {
		expect(classifyArticleImage(1_440, 760)).toBe('default');
		expect(classifyArticleImage(800, 800)).toBe('default');
		expect(classifyArticleImage(520, 900)).toBe('compact');
		expect(classifyArticleImage(1_440, 760, 'compact')).toBe('compact');
		expect(classifyArticleImage(1_440, 760, 'wide')).toBe('wide');
	});

	it('supports an optional editorial size prefix in Markdown image titles', () => {
		expect(parseFigureTitle('[wide] Agent execution flow')).toEqual({
			variant: 'wide',
			caption: 'Agent execution flow',
		});
		expect(parseFigureTitle('A focused screenshot')).toEqual({
			variant: null,
			caption: 'A focused screenshot',
		});
	});

	it('builds bounded responsive variants without upscaling the source', () => {
		expect(responsiveWidths(1_430)).toEqual([640, 960, 1_430]);
		expect(responsiveWidths(2_400)).toEqual([640, 960, 1_440]);
		expect(responsiveVariantPath('/media/demo/screen.png', 960, 'avif')).toBe(
			'/_responsive/media/demo/screen-960.avif',
		);
	});
});
