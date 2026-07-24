import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
	access,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const astroRoot = process.cwd();
const repoRoot = resolve(astroRoot, '..');
const distRoot = resolve(astroRoot, 'dist', 'client');
const ownershipPath = resolve(astroRoot, 'route-ownership.json');
const ownershipBytes = await readFile(ownershipPath);
const ownership = JSON.parse(ownershipBytes.toString('utf8'));
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'bubble-hugo-compat-'));
const hugoRoot = resolve(temporaryRoot, 'public');

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function walk(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else files.push(path);
	}
	return files;
}

function routeFromHtmlPath(path) {
	const normalized = `/${path.replaceAll('\\', '/')}`;
	if (normalized.endsWith('/index.html')) return normalized.slice(0, -'index.html'.length);
	return normalized;
}

function compatibilityRoots(patterns) {
	const roots = patterns.map((pattern) => {
		if (!/^\/(?:en\/)?[a-z0-9-]+\/\*\*$/.test(pattern)) {
			throw new Error(`Unsupported Hugo compatibility ownership pattern: ${pattern}`);
		}
		return pattern.slice(1, -3);
	});
	if (new Set(roots).size !== roots.length) throw new Error('Duplicate Hugo compatibility roots');
	return roots;
}

const roots = compatibilityRoots(ownership.hugo_compat ?? []);
const extensions = new Set(ownership.hugo_compat_extensions ?? []);
if (extensions.size !== 2 || !extensions.has('.html') || !extensions.has('.mp4')) {
	throw new Error('Hugo compatibility overlay must be restricted to HTML and bundled MP4 files');
}

const redirectSources = new Set(
	(await readFile(resolve(distRoot, '_redirects'), 'utf8'))
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'))
		.map((line) => line.split(/\s+/)[0]),
);


const copied = [];
const skippedRedirects = [];
try {
	if (roots.length > 0) {
		const { stdout: hugoVersion } = await execFileAsync('hugo', ['version']);
		if (!hugoVersion.includes('v0.147.9')) {
			throw new Error(
				`Hugo 0.147.9 is required for the compatibility build; received: ${hugoVersion.trim()}`,
			);
		}
		await execFileAsync(
			'hugo',
			[
				'--source',
				repoRoot,
				'--destination',
				hugoRoot,
				'--minify',
				'--panicOnWarning',
				'--printPathWarnings',
			],
			{ maxBuffer: 16 * 1024 * 1024 },
		);
	}

	for (const root of roots) {
		const sourceRoot = resolve(hugoRoot, root);
		if (!(await exists(sourceRoot)))
			throw new Error(`Declared Hugo compatibility root is missing: ${root}`);
		for (const sourcePath of await walk(sourceRoot)) {
			const extension = sourcePath.slice(sourcePath.lastIndexOf('.')).toLowerCase();
			if (!extensions.has(extension)) continue;
			const outputPath = relative(hugoRoot, sourcePath).replaceAll('\\', '/');
			const route = extension === '.html' ? routeFromHtmlPath(outputPath) : `/${outputPath}`;
			if (extension === '.html' && redirectSources.has(route)) {
				skippedRedirects.push(route);
				continue;
			}
			const destination = resolve(distRoot, outputPath);
			if (await exists(destination)) {
				throw new Error(
					`Hugo compatibility overlay would overwrite an Astro-owned file: ${outputPath}`,
				);
			}
			const bytes = await readFile(sourcePath);
			await mkdir(dirname(destination), { recursive: true });
			await copyFile(sourcePath, destination);
			copied.push({
				path: outputPath,
				route,
				kind: extension === '.html' ? 'page' : 'asset',
				sha256: sha256(bytes),
			});
		}
	}

	copied.sort((a, b) => a.path.localeCompare(b.path));
	skippedRedirects.sort();
	// Cloudflare Pages omits dot-directories from the deployed artifact, so release
	// evidence must live at a normal public path that survives the upload step.
	const manifestDirectory = resolve(distRoot, 'release-manifests');
	await mkdir(manifestDirectory, { recursive: true });
	await writeFile(
		resolve(manifestDirectory, 'legacy-compat-manifest.json'),
		`${JSON.stringify(
			{
				schema_version: 1,
				hugo_version: roots.length > 0 ? '0.147.9' : null,
				ownership_sha256: sha256(ownershipBytes),
				copied,
				skipped_redirect_routes: skippedRedirects,
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	console.log(
		`Merged ${copied.length} declared Hugo compatibility files into Astro dist; skipped ${skippedRedirects.length} redirect sources.`,
	);
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
