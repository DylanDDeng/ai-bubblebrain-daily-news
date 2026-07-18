import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	assertPinnedProcessEnvironment,
	assertPinnedToolchain,
	contentContractFromManifest,
	readNpmVersion,
} from '../../scripts/content-route-build-contract.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const astroRoot = resolve(scriptDir, '..');
const repoRoot = resolve(astroRoot, '..');
const releaseId = process.env.CONTENT_RELEASE_ID?.trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function runRenderer(environment = {}) {
	const result = spawnSync('npm', ['run', 'build:renderer'], {
		cwd: astroRoot,
		stdio: 'inherit',
		env: { ...process.env, ...environment },
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function nextDate(value) {
	const date = new Date(`${value}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

async function latestStructuredDate(directory) {
	const dates = (await readdir(directory))
		.map((name) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1])
		.filter(Boolean)
		.sort();
	if (!dates.length) throw new Error('No structured date is available for the deterministic UI');
	return dates.at(-1);
}

function stub(report, locale) {
	const english = locale === 'en';
	const suffix = english ? '.en' : '';
	return {
		name: `${report.date}${suffix}.md`,
		body: `---
title: "${english ? 'Bubble’s Brain Daily' : "Bubble's Brain"} - ${report.date}"
date: ${report.date}T10:00:00+08:00
lastmod: ${report.generated_at}
description: "${english ? 'Release-pinned AI daily brief' : '不可变发布版本 AI 资讯日报'}"
categories:
  - ${english ? 'Daily' : '日报'}
tags:
  - AI
draft: false
---

${english ? 'This page is rendered from the pinned structured report.' : '本页由固定内容版本的结构化日报渲染。'}
`,
	};
}

async function exactJson(
	url,
	expectedHash,
	expectedLength,
	headers = { Accept: 'application/json' },
) {
	const response = await fetch(url, { headers });
	if (!response.ok) throw new Error(`Pinned content fetch failed (${response.status}): ${url}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (expectedLength !== undefined && bytes.byteLength !== expectedLength) {
		throw new Error(`Pinned content byte length mismatch: ${url}`);
	}
	const actualHash = sha256(bytes);
	if (expectedHash && actualHash !== expectedHash)
		throw new Error(`Pinned content hash mismatch: ${url}`);
	return { bytes, value: JSON.parse(bytes.toString('utf8')), hash: actualHash };
}

if (!releaseId) {
	runRenderer({ SITE_DISPLAY_DATE: await latestStructuredDate(resolve(repoRoot, 'data', 'daily')) });
	process.exit(0);
}
assertPinnedToolchain(process.version, readNpmVersion());
assertPinnedProcessEnvironment();
if (!UUID.test(releaseId))
	throw new Error('CONTENT_RELEASE_ID must be an immutable site release UUID');
const buildApiOrigin = process.env.CONTENT_BUILD_API_ORIGIN?.trim();
const buildApiSecret = process.env.CONTENT_BUILD_API_SECRET?.trim();
if (!buildApiOrigin || !buildApiSecret) {
	throw new Error(
		'CONTENT_BUILD_API_ORIGIN and CONTENT_BUILD_API_SECRET are required for a pinned content build',
	);
}
const origin = new URL(buildApiOrigin);
if (
	origin.protocol !== 'https:' &&
	origin.hostname !== '127.0.0.1' &&
	origin.hostname !== 'localhost'
) {
	throw new Error('CONTENT_BUILD_API_ORIGIN must use HTTPS');
}
const publicContentApiOrigin = process.env.PUBLIC_CONTENT_API_ORIGIN?.trim();
if (!publicContentApiOrigin) {
	throw new Error('PUBLIC_CONTENT_API_ORIGIN is required for release-pinned historical search');
}
const publicApiOrigin = new URL(publicContentApiOrigin);
if (publicApiOrigin.protocol !== 'https:' || publicApiOrigin.pathname !== '/') {
	throw new Error('PUBLIC_CONTENT_API_ORIGIN must be an HTTPS origin');
}

const buildHeaders = {
	Accept: 'application/json',
	Authorization: `Bearer ${buildApiSecret}`,
};

const manifestResponse = await fetch(
	`${origin.origin}/internal/build/releases/${releaseId}/manifest`,
	{
		headers: buildHeaders,
	},
);
if (!manifestResponse.ok)
	throw new Error(`Site manifest fetch failed (${manifestResponse.status})`);
const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
const manifestHash = sha256(manifestBytes);
const etag = manifestResponse.headers.get('etag');
if (etag !== `"sha256-${manifestHash}"`) throw new Error('Site manifest ETag/hash mismatch');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (
	manifest.site_release_id !== releaseId ||
	!Number.isSafeInteger(manifest.site_release_sequence)
) {
	throw new Error('Site manifest release identity mismatch');
}
if (!DATE.test(manifest.structured_cutover_date) || !Array.isArray(manifest.reports)) {
	throw new Error('Site manifest source contract is malformed');
}
const contentContract = contentContractFromManifest(manifest);

const workspace = resolve(astroRoot, '.content-release');
const dataDirectory = resolve(workspace, 'data');
const contentDirectory = resolve(workspace, 'content');
await rm(workspace, { recursive: true, force: true });
await mkdir(dataDirectory, { recursive: true });
await mkdir(contentDirectory, { recursive: true });

const legacyDirectory = resolve(repoRoot, 'content', 'daily');
for (const name of await readdir(legacyDirectory)) {
	const match = /^(\d{4}-\d{2}-\d{2})(?:\.en)?\.md$/.exec(name);
	if (!match || match[1] >= manifest.structured_cutover_date) continue;
	await cp(resolve(legacyDirectory, name), resolve(contentDirectory, name));
}

const reportDates = new Set();
const reportDocuments = new Map();
const sortedReports = [...manifest.reports].sort((left, right) =>
	String(left.report_date).localeCompare(String(right.report_date)),
);
for (const reference of sortedReports) {
	if (
		!DATE.test(reference.report_date) ||
		reference.report_date < manifest.structured_cutover_date
	) {
		throw new Error(`Manifest assigns an invalid DB-owned date: ${reference.report_date}`);
	}
	if (reportDates.has(reference.report_date))
		throw new Error(`Duplicate DB-owned date: ${reference.report_date}`);
	reportDates.add(reference.report_date);
	const report = await exactJson(
		`${origin.origin}/internal/build/releases/${releaseId}/reports/${reference.report_date}`,
		reference.byte_sha256,
		reference.byte_length,
		buildHeaders,
	);
	if (report.value.date !== reference.report_date)
		throw new Error('Report filename/date identity mismatch');
	reportDocuments.set(reference.report_date, report.value);
	await writeFile(resolve(dataDirectory, `${reference.report_date}.json`), report.bytes);
	for (const locale of ['zh-CN', 'en']) {
		const generated = stub(report.value, locale);
		await writeFile(resolve(contentDirectory, generated.name), generated.body, 'utf8');
	}
}

const editorialPreviewInputUrl = process.env.EDITORIAL_PREVIEW_INPUT_URL?.trim();
if (editorialPreviewInputUrl) {
	const draftId = process.env.EDITORIAL_DRAFT_ID?.trim();
	const previewSha256 = process.env.EDITORIAL_PREVIEW_SHA256?.trim();
	const previewToken = process.env.EDITORIAL_PREVIEW_INPUT_SECRET?.trim();
	if (!UUID.test(draftId || '') || !/^[a-f0-9]{64}$/.test(previewSha256 || '') || !previewToken) {
		throw new Error('Editorial Preview environment is incomplete');
	}
	const inputResponse = await fetch(editorialPreviewInputUrl, {
		headers: { Accept: 'application/json', Authorization: `Bearer ${previewToken}` },
	});
	if (!inputResponse.ok)
		throw new Error(`Editorial Preview input failed (${inputResponse.status})`);
	const input = await inputResponse.json();
	if (
		input.draft_id !== draftId ||
		input.base_site_release_id !== releaseId ||
		input.preview_sha256 !== previewSha256 ||
		!Array.isArray(input.items)
	) {
		throw new Error('Editorial Preview identity mismatch');
	}
	const allowed = new Set([
		'title',
		'summary',
		'category',
		'featured',
		'score',
		'reason',
		'topic_ids',
		'entity_ids',
		'report_hidden',
		'report_date',
	]);
	for (const draftItem of input.items) {
		if (
			!draftItem ||
			typeof draftItem.item_id !== 'string' ||
			!draftItem.patch ||
			typeof draftItem.patch !== 'object' ||
			!draftItem.base_document ||
			typeof draftItem.base_document !== 'object'
		) {
			throw new Error('Editorial Preview item is malformed');
		}
		for (const key of Object.keys(draftItem.patch)) {
			if (!allowed.has(key)) throw new Error(`Editorial Preview field is not allowed: ${key}`);
		}
		if (draftItem.patch.report_hidden !== undefined || draftItem.patch.report_date !== undefined) {
			if (
				draftItem.patch.report_hidden !== true ||
				typeof draftItem.patch.report_date !== 'string' ||
				Object.keys(draftItem.patch).some((key) => !['report_hidden', 'report_date'].includes(key))
			) {
				throw new Error('Editorial Preview report hide patch is malformed');
			}
			const document = reportDocuments.get(draftItem.patch.report_date);
			if (!document) throw new Error('Editorial Preview report hide date is absent');
			const before = document.items.length;
			document.items = document.items
				.filter((item) => item.id !== draftItem.item_id)
				.map((item) => ({
					...item,
					related_source_ids: Array.isArray(item.related_source_ids)
						? item.related_source_ids.filter((id) => id !== draftItem.item_id)
						: item.related_source_ids,
				}));
			if (document.items.length !== before - 1) {
				throw new Error('Editorial Preview hidden item is not uniquely present');
			}
			for (const batch of document.batches || []) {
				if (!Array.isArray(batch.item_ids)) throw new Error('Editorial Preview batch is malformed');
				batch.item_ids = batch.item_ids.filter((id) => id !== draftItem.item_id);
			}
			document.overview = {
				text: '本期日报已根据报告级隐藏请求更新。',
				kind: 'fallback',
				provenance: { method: 'template', model: null, prompt_version: null },
			};
			continue;
		}
		let matches = 0;
		for (const document of reportDocuments.values()) {
			for (const item of document.items || []) {
				if (item.id !== draftItem.item_id) continue;
				matches += 1;
				for (const [key, value] of Object.entries(draftItem.patch)) {
					item[key] = value === null ? draftItem.base_document[key] : value;
				}
			}
		}
		if (matches === 0)
			throw new Error(
				`Editorial Preview item is absent from the base release: ${draftItem.item_id}`,
			);
	}
	for (const [date, document] of reportDocuments) {
		await writeFile(
			resolve(dataDirectory, `${date}.json`),
			`${JSON.stringify(document, null, 2)}\n`,
			'utf8',
		);
	}
}

const noReportDays = new Set(manifest.no_report_days || []);
const finalDate = sortedReports.at(-1)?.report_date;
if (finalDate) {
	for (let date = manifest.structured_cutover_date; date <= finalDate; date = nextDate(date)) {
		if (!reportDates.has(date) && !noReportDays.has(date)) {
			throw new Error(`Unexplained DB-owned report gap: ${date}`);
		}
	}
}
for (const date of noReportDays) {
	if (!DATE.test(date) || reportDates.has(date))
		throw new Error(`Invalid no_report_days entry: ${date}`);
}

await writeFile(
	resolve(workspace, 'build-input.json'),
	`${JSON.stringify(
		{
			code_sha: process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || null,
			site_release_id: releaseId,
			site_release_sequence: manifest.site_release_sequence,
			content_sha256: manifest.content_root_sha256,
			manifest_sha256: manifestHash,
			build_environment_version: process.env.BUILD_ENVIRONMENT_VERSION || null,
			...contentContract,
		},
		null,
		2,
	)}\n`,
);

await rm(resolve(astroRoot, '.astro'), { recursive: true, force: true });
runRenderer({
	DAILY_DATA_DIR: dataDirectory,
	DAILY_CONTENT_DIR: contentDirectory,
	CONTENT_RELEASE_ID: releaseId,
	CONTENT_MANIFEST_SHA256: manifestHash,
	CONTENT_ROOT_SHA256: manifest.content_root_sha256,
	CONTENT_RELEASE_SEQUENCE: String(manifest.site_release_sequence),
	CONTENT_SCHEMA_VERSION: String(contentContract.content_schema_version),
	CONTENT_TAXONOMY_VERSION: String(contentContract.content_taxonomy_version),
	CONTENT_SERIALIZER_VERSION: contentContract.content_serializer_version,
	CONTENT_SEARCH_CONTRACT_VERSION: contentContract.content_search_contract_version,
	CONTENT_SOURCE_CONTRACT_VERSION: contentContract.content_source_contract_version,
	STRUCTURED_CUTOVER_DATE: manifest.structured_cutover_date,
	PUBLIC_CONTENT_API_ORIGIN: publicApiOrigin.origin,
	SITE_DISPLAY_DATE: finalDate || manifest.structured_cutover_date,
	EDITORIAL_PREVIEW_SHA256: process.env.EDITORIAL_PREVIEW_SHA256 || '',
});
