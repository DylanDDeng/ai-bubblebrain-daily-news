import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const daily = defineCollection({
	loader: glob({
		base: process.env.DAILY_CONTENT_DIR || '../content/daily',
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

const highlights = defineCollection({
	loader: glob({
		base: '../content/highlights',
		pattern: ['**/*.md', '!**/_index*.md'],
		generateId: ({ entry }) => entry.replace(/\.md$/, ''),
	}),
	schema: z.object({
		externalId: z.string().min(1),
		kind: z.enum(['bookmark', 'article']),
		title: z.string().min(1),
		description: z.string().optional().default(''),
		date: z.coerce.date().optional(),
		updatedAt: z.coerce.date().optional(),
		sourceUrl: z.url(),
		cover: z.string().optional(),
		tags: z.array(z.string()).optional().default([]),
		featured: z.boolean().optional().default(false),
		draft: z.boolean().optional().default(false),
	}),
});

const legacy = defineCollection({
	loader: glob({
		base: '../content',
		pattern: [
			'about/**/*.md',
			'ai-tools/**/*.md',
			'curations/**/*.md',
			'highlights/_index*.md',
			'model-evals/**/*.md',
			'my-publish/**/*.md',
			'prompts/**/*.md',
			'x-trending/**/*.md',
		],
		generateId: ({ entry }) => entry.replace(/\.md$/, ''),
	}),
	schema: z
		.object({
			title: z.string().optional(),
			description: z.string().optional().default(''),
			date: z.coerce.date().optional(),
			lastmod: z.coerce.date().optional(),
			draft: z.boolean().optional().default(false),
			tags: z.array(z.string()).optional().default([]),
			aliases: z.array(z.string()).optional().default([]),
			slug: z.string().optional(),
			layout: z.string().optional(),
			model: z.string().optional(),
			tone: z.string().optional(),
		})
		.loose(),
});

export const collections = { daily, highlights, legacy };
