import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const daily = defineCollection({
	loader: glob({
		base: '../content/daily',
		pattern: ['????-??-??.md', '????-??-??.en.md'],
		generateId: ({ entry }) => entry.replace(/\.md$/, ''),
	}),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		lastmod: z.coerce.date().optional(),
		description: z.string().optional().default(''),
		categories: z.array(z.string()).optional().default([]),
		tags: z.array(z.string()).optional().default([]),
		draft: z.boolean().optional().default(false),
	}),
});

export const collections = { daily };
