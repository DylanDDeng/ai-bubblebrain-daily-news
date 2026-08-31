import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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

const skills = defineCollection({
	loader: glob({
		base: '../content/skills',
		pattern: '**/*.md',
		generateId: ({ entry }) => entry.replace(/\.md$/, ''),
	}),
	schema: z.object({
		name: z.string().min(1),
		author: z.string().min(1),
		sourceUrl: z.url(),
		install: z.string().min(1),
		category: z.string().min(1),
		order: z.number().optional().default(0),
	}),
});

const legacy = defineCollection({
	loader: glob({
		base: '../content',
		pattern: [
			'about/**/*.md',
			'ai-tools/**/*.md',
			'codex-tutorials/**/*.md',
			'deepseek-harness-tutorials/**/*.md',
			'pi-agent-tutorials/**/*.md',
			'newbie-tutorials/**/*.md',
			'workbuddy-tutorials/**/*.md',
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

export const collections = { highlights, skills, legacy };
