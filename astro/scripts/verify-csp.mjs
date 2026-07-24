import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'client');

async function walk(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(absolute)));
		else files.push(absolute);
	}
	return files;
}

const headers = await readFile(path.join(dist, '_headers'), 'utf8');
const globalHeaders = headers
	.split(/\n\s*\n/)
	.find((block) => block.trimStart().startsWith('/*\n'));
assert(globalHeaders, 'global /* header block is missing');
assert.match(globalHeaders, /^\s*Content-Security-Policy:/m, 'global enforced CSP is missing');
assert.doesNotMatch(
	globalHeaders,
	/Content-Security-Policy-Report-Only:/i,
	'global CSP must be enforced',
);
assert.doesNotMatch(
	globalHeaders,
	/script-src[^\n;]*'unsafe-inline'/i,
	'global script-src must not allow unsafe-inline',
);

for (const asset of ['js/theme-bootstrap.js', 'js/site-shell.js']) {
	assert((await readFile(path.join(dist, asset))).length > 0, `${asset} is missing or empty`);
}

const violations = [];
const inertTypes = new Set(['application/json', 'application/ld+json']);
for (const file of await walk(dist)) {
	if (!file.endsWith('.html')) continue;
	const relative = path.relative(dist, file).split(path.sep).join('/');
	if (relative.startsWith('eval-demos/')) continue;
	const html = await readFile(file, 'utf8');
	if (/\son[a-z]+\s*=/i.test(html)) violations.push(`${relative} (inline event handler)`);
	if (/\b(?:href|src)\s*=\s*["']\s*javascript:/i.test(html))
		violations.push(`${relative} (javascript URL)`);
	for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
		const attributes = match[1];
		if (/\bsrc\s*=/i.test(attributes)) continue;
		const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
		if (type && inertTypes.has(type)) continue;
		violations.push(relative);
	}
}

assert.deepEqual(
	[...new Set(violations)],
	[],
	'executable inline scripts violate the global CSP outside eval-demos',
);

console.log('Verified enforced CSP and external executable scripts.');
