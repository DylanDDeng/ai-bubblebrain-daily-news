import { describe, expect, it } from 'vitest';
import { validatePublicationPull } from '../../scripts/verify-publication-pr.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);

function report(date, completedBatch) {
    return {
        date,
        batches: [
            { id: 'morning', status: completedBatch === 'morning' ? 'completed' : 'pending' },
            { id: 'afternoon', status: completedBatch === 'afternoon' ? 'completed' : 'pending' },
            { id: 'night', status: completedBatch === 'night' ? 'completed' : 'pending' },
            { id: 'lateNight', status: completedBatch === 'lateNight' ? 'completed' : 'pending' },
        ],
    };
}

function structuredCommit({
    sha = headSha,
    parent = baseSha,
    date = '2026-07-14',
    batch = 'morning',
} = {}) {
    return {
        sha,
        parents: [parent],
        message: `Structured daily ${date} ${batch}`,
        changedPaths: [
            `content/daily/${date}.md`,
            `daily/${date}.md`,
            `data/daily/${date}.json`,
        ],
        report: report(date, batch),
    };
}

function candidate(overrides = {}) {
    return {
        baseSha,
        headSha,
        headRef: `automation/daily/2026-07-14-morning-structured/${headSha.slice(0, 12)}`,
        body: '<!-- bubble-daily-publication -->',
        commitChain: [structuredCommit()],
        changedPaths: [
            'content/daily/2026-07-14.md',
            'daily/2026-07-14.md',
            'data/daily/2026-07-14.json',
        ],
        ...overrides,
    };
}

describe('publication pull promotion policy', () => {
    it('accepts exact structured and legacy artifact sets', () => {
        expect(validatePublicationPull(candidate())).toMatchObject({
            reportDate: '2026-07-14',
            mode: 'structured',
        });
        expect(validatePublicationPull(candidate({
            headRef: `automation/daily/2026-07-14-lateNight-legacy/${headSha.slice(0, 12)}`,
            commitChain: [{
                sha: headSha,
                parents: [baseSha],
                message: 'Incremental daily 2026-07-14 lateNight',
                changedPaths: [
                    'daily/2026-07-14.md',
                    'content/daily/2026-07-14.md',
                ],
            }],
            changedPaths: [
                'daily/2026-07-14.md',
                'content/daily/2026-07-14.md',
            ],
        }))).toMatchObject({ mode: 'legacy' });
    });

    it('accepts a bounded linear successor chain and complete multi-date backlog', () => {
        const middleSha = 'c'.repeat(40);
        expect(validatePublicationPull(candidate({
            commitChain: [
                structuredCommit({
                    sha: middleSha,
                    parent: baseSha,
                    date: '2026-07-13',
                    batch: 'night',
                }),
                structuredCommit({ sha: headSha, parent: middleSha }),
            ],
            changedPaths: [
                ...candidate().changedPaths,
                'content/daily/2026-07-13.md',
                'daily/2026-07-13.md',
                'data/daily/2026-07-13.json',
            ],
        }))).toMatchObject({ commitCount: 2 });
    });

    it('accepts a candidate rooted at the merge base after main advances', () => {
        const mergeBaseSha = 'd'.repeat(40);
        expect(validatePublicationPull(candidate({
            baseSha,
            mergeBaseSha,
            commitChain: [structuredCommit({ parent: mergeBaseSha })],
        }))).toMatchObject({ baseAdvanced: true });
    });

    it('rejects extra paths, nonlinear commits, missing markers, and mismatched SHAs', () => {
        const variants = [
            candidate({ changedPaths: [...candidate().changedPaths, 'src/index.js'] }),
            candidate({ commitChain: [{
                ...structuredCommit(),
                parents: [baseSha, 'c'.repeat(40)],
            }] }),
            candidate({ commitChain: [structuredCommit({ sha: 'c'.repeat(40) })] }),
            candidate({ body: 'unmarked' }),
            candidate({ headRef: 'automation/daily/2026-07-14-morning-structured/cccccccccccc' }),
            candidate({ headRef: `feature/${headSha.slice(0, 12)}` }),
            candidate({ commitChain: [{ ...structuredCommit(), message: 'docs: harmless' }] }),
            candidate({ commitChain: [{
                ...structuredCommit(),
                changedPaths: ['content/daily/2026-07-14.md'],
            }] }),
            candidate({ commitChain: [{
                ...structuredCommit(),
                report: report('2026-07-14', 'afternoon'),
            }] }),
            candidate({ commitChain: [structuredCommit({ batch: 'afternoon' })] }),
        ];
        for (const input of variants) {
            expect(() => validatePublicationPull(input)).toThrow();
        }
    });
});
