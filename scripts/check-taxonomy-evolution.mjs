import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
    validateTaxonomyEvolution,
    validateTaxonomyRegistry,
} from '../src/knowledge/taxonomy.js';

const taxonomyPath = 'data/knowledge/taxonomy.json';
const current = JSON.parse(await readFile(resolve(taxonomyPath), 'utf8'));
validateTaxonomyRegistry(current);

const baseRef = process.env.TAXONOMY_BASE_REF
    || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD^');

let previousText;
try {
    previousText = execFileSync('git', ['show', `${baseRef}:${taxonomyPath}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
} catch {
    console.log(`Taxonomy evolution baseline is absent at ${baseRef}; validating initial registry only.`);
    process.exit(0);
}

validateTaxonomyEvolution(JSON.parse(previousText), current);
console.log(`Taxonomy evolution is append-only relative to ${baseRef}.`);
