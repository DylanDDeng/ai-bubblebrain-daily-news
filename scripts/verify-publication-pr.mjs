import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
    parsePublicationCommit,
    validatePublicationPull,
} from '../src/daily/publicationPolicy.js';

export { validatePublicationPull } from '../src/daily/publicationPolicy.js';

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function verifyPublicationPullFromEnvironment(env = process.env) {
    const baseSha = env.PR_BASE_SHA;
    const headSha = env.PR_HEAD_SHA;
    const mergeBaseSha = git('merge-base', baseSha, headSha);
    const chainText = git('rev-list', '--reverse', '--parents', `${mergeBaseSha}..${headSha}`);
    const commitChain = chainText ? chainText.split('\n').map(line => {
        const [sha, ...parents] = line.trim().split(/\s+/);
        const message = git('show', '-s', '--format=%s', sha);
        const commitPathsText = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha);
        const changedPaths = commitPathsText ? commitPathsText.split('\n') : [];
        const messageDetails = parsePublicationCommit(message);
        let report;
        if (messageDetails?.mode === 'structured') {
            const reportText = git('show', `${sha}:data/daily/${messageDetails.reportDate}.json`);
            try {
                report = JSON.parse(reportText);
            } catch {
                throw new Error(`Structured publication JSON is invalid at ${sha}`);
            }
        }
        return { sha, parents, message, changedPaths, report };
    }) : [];
    const changed = git('diff', '--name-only', `${baseSha}...${headSha}`);
    return validatePublicationPull({
        baseSha,
        mergeBaseSha,
        headSha,
        headRef: env.PR_HEAD_REF,
        body: env.PR_BODY,
        commitChain,
        changedPaths: changed ? changed.split('\n') : [],
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    const result = verifyPublicationPullFromEnvironment();
    console.log(`Verified ${result.mode} publication for ${result.reportDate}.`);
}
