const BRANCH_PATTERN = /^automation\/daily\/(\d{4}-\d{2}-\d{2})-(morning|afternoon|night|lateNight)-(legacy|structured)\/([a-f0-9]{12})$/;
const COMMIT_MESSAGE_PATTERN = /^(Incremental|Structured) daily (\d{4}-\d{2}-\d{2}) (morning|afternoon|night|lateNight)$/;

export function parsePublicationCommit(message) {
    const match = COMMIT_MESSAGE_PATTERN.exec(message || '');
    if (!match) return null;
    return {
        mode: match[1] === 'Structured' ? 'structured' : 'legacy',
        reportDate: match[2],
        batch: match[3],
    };
}

export function expectedPublicationPaths(reportDate, mode) {
    const paths = [`content/daily/${reportDate}.md`, `daily/${reportDate}.md`];
    if (mode === 'structured') paths.push(`data/daily/${reportDate}.json`);
    return paths.sort();
}

function validateStructuredReport(report, reportDate, batch) {
    if (!report || report.date !== reportDate || !Array.isArray(report.batches)) {
        throw new Error(`Structured publication report is invalid for ${reportDate}`);
    }
    const batchState = report.batches.find(candidate => candidate?.id === batch);
    if (batchState?.status !== 'completed') {
        throw new Error(`Structured publication batch is not completed: ${reportDate} ${batch}`);
    }
}

export function validatePublicationPull({
    baseSha,
    mergeBaseSha,
    headSha,
    headRef,
    body,
    commitChain,
    changedPaths,
}) {
    const effectiveMergeBaseSha = mergeBaseSha || baseSha;
    if (!/^[a-f0-9]{40}$/.test(baseSha || '')
        || !/^[a-f0-9]{40}$/.test(effectiveMergeBaseSha || '')
        || !/^[a-f0-9]{40}$/.test(headSha || '')) {
        throw new Error('Publication pull requires full base and head SHAs');
    }
    const match = BRANCH_PATTERN.exec(headRef || '');
    if (!match) throw new Error('Invalid publication branch name');
    const [, reportDate, headBatch, mode, suffix] = match;
    if (suffix !== headSha.slice(0, 12)) {
        throw new Error('Publication branch suffix does not match head SHA');
    }
    if (!String(body || '').includes('<!-- bubble-daily-publication -->')) {
        throw new Error('Publication pull marker is missing');
    }
    if (!Array.isArray(commitChain) || commitChain.length < 1 || commitChain.length > 8) {
        throw new Error('Publication candidate chain must contain between one and eight commits');
    }
    let expectedParent = effectiveMergeBaseSha;
    let lastCommitDate = null;
    let lastCommitBatch = null;
    for (const commit of commitChain) {
        if (!/^[a-f0-9]{40}$/.test(commit?.sha || '')
            || commit.parents?.length !== 1
            || commit.parents[0] !== expectedParent) {
            throw new Error('Publication commits must form one linear chain from the pull base');
        }
        const details = parsePublicationCommit(commit.message);
        if (!details) throw new Error('Invalid publication commit message');
        if (details.mode !== mode) {
            throw new Error('Publication commit mode does not match branch mode');
        }
        const commitPaths = [...new Set(commit.changedPaths || [])].sort();
        const expectedPaths = expectedPublicationPaths(details.reportDate, mode);
        if (commitPaths.length !== expectedPaths.length
            || expectedPaths.some((path, index) => commitPaths[index] !== path)) {
            throw new Error(`Publication commit paths do not match ${details.reportDate} ${mode} policy`);
        }
        if (mode === 'structured') {
            validateStructuredReport(commit.report, details.reportDate, details.batch);
        }
        lastCommitDate = details.reportDate;
        lastCommitBatch = details.batch;
        expectedParent = commit.sha;
    }
    if (expectedParent !== headSha) throw new Error('Publication chain does not end at pull head');
    if (lastCommitDate !== reportDate || lastCommitBatch !== headBatch) {
        throw new Error('Publication branch date and batch do not match the head commit');
    }

    const actual = [...new Set(changedPaths || [])].sort();
    const groups = new Map();
    for (const path of actual) {
        const pathMatch = /^(content\/daily|daily|data\/daily)\/(\d{4}-\d{2}-\d{2})\.(md|json)$/.exec(path);
        if (!pathMatch) throw new Error(`Publication path is not allowed: ${path}`);
        const [, root, date, extension] = pathMatch;
        const kind = root === 'data/daily' ? 'json' : root === 'content/daily' ? 'content' : 'daily';
        if ((kind === 'json') !== (extension === 'json')) {
            throw new Error(`Publication path extension is invalid: ${path}`);
        }
        if (!groups.has(date)) groups.set(date, new Set());
        groups.get(date).add(kind);
    }
    if (groups.size < 1 || groups.size > 3 || !groups.has(reportDate)) {
        throw new Error('Publication must contain one to three complete report dates including head date');
    }
    const expectedKinds = mode === 'structured' ? ['content', 'daily', 'json'] : ['content', 'daily'];
    for (const kinds of groups.values()) {
        if (kinds.size !== expectedKinds.length
            || expectedKinds.some(kind => !kinds.has(kind))) {
            throw new Error(`Publication paths do not match ${mode} policy`);
        }
    }
    return {
        reportDate,
        mode,
        changedPaths: actual,
        commitCount: commitChain.length,
        baseAdvanced: effectiveMergeBaseSha !== baseSha,
    };
}
