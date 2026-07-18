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

const legacy = defineCollection({
	loader: glob({
		base: '../content',
		pattern: [
			'about/**/*.md',
			'ai-tools/**/*.md',
			'curations/**/*.md',
			'highlights/**/*.md',
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

export const collections = { daily, legacy };
