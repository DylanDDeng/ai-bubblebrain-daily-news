import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import {
	assertRouteBuildContract,
	contentContractFromEnvironment,
	PINNED_BUILD_LOCALE,
	PINNED_BUILD_TIMEZONE,
	PINNED_TOOLCHAIN,
	readNpmVersion,
} from '../../scripts/content-route-build-contract.mjs';

const astroRoot = process.cwd();
const distRoot = resolve(astroRoot, 'dist');
const manifestRelativePath = 'release-manifests/site-route-manifest.json';
const ownership = JSON.parse(await readFile(resolve(astroRoot, 'route-ownership.json'), 'utf8'));
const legacyManifest = JSON.parse(
	await readFile(resolve(distRoot, 'release-manifests', 'legacy-compat-manifest.json'), 'utf8'),
);

async function walk(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else files.push(path);
	}
	return files;
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

async function artifactFingerprint() {
	const aggregate = createHash('sha256');
	const files = (await walk(distRoot))
		.map((file) => ({ file, path: relative(distRoot, file).replaceAll('\\', '/') }))
		.filter((entry) => entry.path !== manifestRelativePath)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const entry of files) {
		aggregate.update(entry.path);
		aggregate.update('\0');
		aggregate.update(sha256(await readFile(entry.file)));
		aggregate.update('\n');
	}
	return aggregate.digest('hex');
}

function sourceSha() {
	const value =
		process.env.CF_PAGES_COMMIT_SHA ||
		process.env.GITHUB_SHA ||
		execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: resolve(astroRoot, '..'),
			encoding: 'utf8',
		}).trim();
	if (!/^[\da-f]{40}$/i.test(value)) throw new Error(`Invalid build source SHA: ${value}`);
	return value.toLowerCase();
}

function optionalHash(name, length) {
	const value = process.env[name];
	if (!value) return null;
	if (!new RegExp(`^[\\da-f]{${length}}$`, 'i').test(value)) throw new Error(`Invalid ${name}`);
	return value.toLowerCase();
}

function contentReleaseMetadata() {
	const id = process.env.CONTENT_RELEASE_ID || null;
	if (
		id &&
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
	) {
		throw new Error('Invalid CONTENT_RELEASE_ID');
	}
	const sequenceText = process.env.CONTENT_RELEASE_SEQUENCE;
	const sequence = sequenceText === undefined ? null : Number(sequenceText);
	if (sequence !== null && (!Number.isSafeInteger(sequence) || sequence < 1)) {
		throw new Error('Invalid CONTENT_RELEASE_SEQUENCE');
	}
	const metadata = {
		site_release_id: id,
		site_release_sequence: sequence,
		content_sha256: optionalHash('CONTENT_ROOT_SHA256', 64),
		manifest_sha256: optionalHash('CONTENT_MANIFEST_SHA256', 64),
		build_environment_version:
			process.env.BUILD_ENVIRONMENT_VERSION || 'node22.17-astro7-hugo0.147.9-v1',
		editorial_preview_sha256: optionalHash('EDITORIAL_PREVIEW_SHA256', 64),
	};
	return id ? { ...metadata, ...contentContractFromEnvironment() } : metadata;
}

function routeFromPath(path) {
	const normalized = path.replaceAll('\\', '/');
	if (normalized === 'index.html') return '/';
	if (normalized.endsWith('/index.html')) return `/${normalized.slice(0, -'index.html'.length)}`;
	return `/${normalized}`;
}

function patternRegex(pattern) {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(
		`^${escaped.replaceAll('**', '§§').replaceAll('*', '[^/]*').replaceAll('§§', '.*')}$`,
	);
}

function matches(route, patterns) {
	return patterns.some((pattern) => patternRegex(pattern).test(route));
}

function contentType(path) {
	if (path.endsWith('.html')) return 'text/html';
	if (path.endsWith('.xml')) return 'application/xml';
	if (path.endsWith('.json')) return 'application/json';
	if (path.endsWith('.css')) return 'text/css';
	if (path.endsWith('.js')) return 'application/javascript';
	if (path.endsWith('.mp4')) return 'video/mp4';
	if (path.endsWith('.png')) return 'image/png';
	if (path.endsWith('.svg')) return 'image/svg+xml';
	if (path.endsWith('.woff2')) return 'font/woff2';
	if (path.endsWith('.woff')) return 'font/woff';
	if (path.endsWith('.ttf')) return 'font/ttf';
	if (path.endsWith('.ico')) return 'image/vnd.microsoft.icon';
	if (path.endsWith('.txt')) return 'text/plain';
	if (!path.includes('.')) return 'application/octet-stream';
	throw new Error(`Unknown release artifact content type: ${path}`);
}

function tagAttribute(tag, name) {
	const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
	return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function htmlMetadata(html) {
	const links = html.match(/<link\b[^>]*>/gi) ?? [];
	const canonicalTag = links.find((tag) => tagAttribute(tag, 'rel') === 'canonical');
	const canonical = canonicalTag ? tagAttribute(canonicalTag, 'href') : null;
	const hreflang = links
		.filter((tag) => tagAttribute(tag, 'rel') === 'alternate' && tagAttribute(tag, 'hreflang'))
		.map((tag) => ({
			locale: tagAttribute(tag, 'hreflang'),
			href: tagAttribute(tag, 'href'),
		}))
		.sort((a, b) => a.locale.localeCompare(b.locale));
	const robots = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] ?? null;
	const noindex = robots ? /noindex/i.test(tagAttribute(robots, 'content') ?? '') : false;
	return { canonical, hreflang, noindex };
}

for (const file of await walk(distRoot)) {
	if (file.endsWith('/.DS_Store')) await rm(file, { force: true });
}

const legacyPaths = new Set(legacyManifest.copied.map((entry) => entry.path));
const records = [];
for (const file of await walk(distRoot)) {
	const path = relative(distRoot, file).replaceAll('\\', '/');
	if (path.startsWith('release-manifests/')) continue;
	if (path === '_headers' || path === '_redirects') continue;
	const fileRoute = routeFromPath(path);
	let owner;
	if (legacyPaths.has(path)) owner = 'hugo_compat';
	else if (matches(fileRoute, ownership.static ?? [])) owner = 'static';
	else if (matches(fileRoute, ownership.astro ?? [])) owner = 'astro';
	else throw new Error(`No declared route owner for ${fileRoute} (${path})`);

	const usesPagesCleanUrl =
		path.endsWith('.html') && path !== 'index.html' && !path.endsWith('/index.html');
	const route = usesPagesCleanUrl ? fileRoute.slice(0, -'.html'.length) : fileRoute;

	const record = {
		route,
		status: 200,
		owner,
		content_type: contentType(path),
		indexable: owner !== 'static' && path !== '404.html' && path !== 'en/404.html',
		output_path: path,
	};
	if (record.content_type === 'text/html') {
		const metadata = htmlMetadata(await readFile(file, 'utf8'));
		Object.assign(record, { canonical: metadata.canonical, hreflang: metadata.hreflang });
		if (metadata.noindex) record.indexable = false;
	}
	records.push(record);
	if (usesPagesCleanUrl) {
		records.push({
			route: fileRoute,
			status: 308,
			owner: 'cloudflare_pages',
			content_type: 'redirect',
			indexable: false,
			target: route,
		});
	}
}

for (const path of ['release-manifests/legacy-compat-manifest.json', manifestRelativePath]) {
	records.push({
		route: `/${path}`,
		status: 200,
		owner: 'astro',
		content_type: 'application/json',
		indexable: false,
		output_path: path,
	});
}

const redirectLines = (await readFile(resolve(distRoot, '_redirects'), 'utf8'))
	.split('\n')
	.map((line) => line.trim())
	.filter((line) => line && !line.startsWith('#'));
for (const line of redirectLines) {
	const [route, target, statusText] = line.split(/\s+/);
	const status = Number(statusText);
	if (status !== 301) throw new Error(`Only permanent redirects are allowed: ${line}`);
	records.push({
		route,
		status,
		owner: 'astro',
		content_type: 'redirect',
		indexable: false,
		target,
	});
}

records.sort((a, b) => a.route.localeCompare(b.route) || a.status - b.status);
const identities = new Set();
for (const record of records) {
	const identity = `${record.status}:${record.route}`;
	if (identities.has(identity)) throw new Error(`Duplicate site contract identity: ${identity}`);
	identities.add(identity);
}

const codeSha = sourceSha();
const build = {
	code_sha: codeSha,
	source_sha: codeSha,
	...contentReleaseMetadata(),
	artifact_sha256: await artifactFingerprint(),
	hash_algorithm: 'sha256-path-and-content-v1',
	node_version: process.version,
	npm_version: readNpmVersion(),
	astro_version: PINNED_TOOLCHAIN.astro_version,
	hugo_version: PINNED_TOOLCHAIN.hugo_version,
	build_timezone: process.env.TZ || PINNED_BUILD_TIMEZONE,
	build_locale: process.env.LC_ALL || process.env.LANG || PINNED_BUILD_LOCALE,
};
assertRouteBuildContract(build);

await writeFile(
	resolve(distRoot, manifestRelativePath),
	`${JSON.stringify(
		{
			schema_version: 3,
			build,
			records,
		},
		null,
		2,
	)}\n`,
	'utf8',
);
console.log(`Generated complete site route contract with ${records.length} records.`);
