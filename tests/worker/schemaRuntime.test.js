import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import validateSchema from '../../src/daily/generated/dailyReportValidator.js';

describe('Worker-safe schema validation', () => {
    it('uses a static precompiled validator without runtime code generation', async () => {
        const runtime = await readFile(
            new URL('../../src/daily/schemaValidate.js', import.meta.url),
            'utf8',
        );
        const generated = await readFile(
            new URL('../../src/daily/generated/dailyReportValidator.js', import.meta.url),
            'utf8',
        );
        expect(runtime).not.toMatch(/Ajv|\.compile\(/);
        expect(generated).not.toMatch(/new Function|\beval\s*\(/);
        expect(validateSchema({})).toBe(false);
        expect(validateSchema.errors?.length).toBeGreaterThan(0);
    });
});
