// src/handlers/incrementalDailyWorkflow.js
import { fetchAllData } from '../dataFetchers.js';
import { resolveFoloCookie } from '../folo.js';
import { getFromKV, storeInKV } from '../kv.js';
import { stripHtml, extractSummaryText, removeMarkdownCodeBlock, formatDateToChinese, formatMarkdownText } from '../helpers.js';
import { callChatAPIStream } from '../chatapi.js';
import { callGitHubApi } from '../github.js';
import {
    createSnapshotReader,
    isCommitIncluded,
    publishFilesAtomically,
    resolveBranchSnapshot,
    resolvePublicationAlias,
    resolvePublicationSnapshot,
} from '../daily/gitAtomic.js';
import { readTriggerMarker, storeTriggerMarker } from '../daily/runState.js';
import {
    resolveHistoryEpochStartDate,
    runStructuredDailyWorkflow,
} from '../daily/structuredWorkflow.js';
import { runStructuredShadow } from '../daily/shadowWorkflow.js';
import { fetchProviderPreservingData } from '../daily/structuredFetch.js';
import { resolveScheduledRun } from '../daily/scheduleContract.js';
import {
    getSystemPromptArticleEvaluation,
    getSystemPromptBatchSection,
    getSystemPromptDailyOverview
} from '../prompt/incrementalDailyPrompt.js';

const KV_TTL = 86400 * 14;
const DEFAULT_ARTICLE_MAX_CHARS = 20000;
const DEFAULT_EVAL_MAX_PER_RUN = 12;

function getBeijingParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);
    return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function getDateDaysAgo(dateStr, days) {
    const date = new Date(`${dateStr}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() - days);
    return getBeijingDateString(date);
}

function getBeijingDateString(date = new Date()) {
    const p = getBeijingParts(date);
    return `${p.year}-${p.month}-${p.day}`;
}

function resolveBatch(date = new Date(), forcedBatch = null, forcedDate = null) {
    if (forcedBatch && forcedDate) return { reportDate: forcedDate, batch: forcedBatch };

    if (!forcedBatch) {
        try {
            const scheduled = resolveScheduledRun(date);
            return {
                reportDate: scheduled.report_date,
                batch: scheduled.batch_id,
            };
        } catch {
            // Manual runs outside the production schedule keep the legacy
            // clock-based mapping below.
        }
    }

    const p = getBeijingParts(date);
    const hour = Number(p.hour);
    const today = `${p.year}-${p.month}-${p.day}`;

    if (forcedBatch) {
        const reportDate = forcedBatch === 'lateNight' ? getDateDaysAgo(today, 1) : today;
        return { reportDate, batch: forcedBatch };
    }

    if (hour >= 2 && hour < 5) return { reportDate: getDateDaysAgo(today, 1), batch: 'lateNight' };
    if (hour >= 22 || hour < 2) return { reportDate: today, batch: 'night' };
    if (hour >= 13 && hour < 18) return { reportDate: today, batch: 'afternoon' };
    return { reportDate: today, batch: 'morning' };
}

function nominalBatchContentCutoff(reportDate, batch) {
    const localInstant = batch === 'lateNight'
        ? `${getDateDaysAgo(reportDate, -1)}T03:00:00+08:00`
        : `${reportDate}T${({ morning: '10', afternoon: '15', night: '23' })[batch]}:00:00+08:00`;
    const cutoff = new Date(localInstant);
    if (Number.isNaN(cutoff.getTime())) throw new Error('Invalid batch content cutoff');
    return cutoff;
}

function resolveContentCutoff(options, reportDate, batch, runAt) {
    if (options.contentCutoff) return options.contentCutoff;
    if (!options.date && !options.batch) return runAt;
    const runDate = new Date(runAt);
    if (Number.isNaN(runDate.getTime())) throw new Error('Invalid runAt');
    const nominalCutoff = nominalBatchContentCutoff(reportDate, batch);
    return new Date(Math.min(runDate.getTime(), nominalCutoff.getTime())).toISOString();
}

function batchLabel(batch) {
    return ({
        morning: '08:00 更新',
        afternoon: '14:00 更新',
        night: '22:00 更新',
        lateNight: '次日 02:00 补充更新'
    })[batch] || `${batch} 更新`;
}

function batchOrder(batch) {
    return ({ morning: 1, afternoon: 2, night: 3, lateNight: 4 })[batch] || 99;
}

function normalizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'from', 'ref', 'fbclid', 'gclid'];
        removeParams.forEach(p => u.searchParams.delete(p));
        u.hash = '';
        return u.toString().replace(/\/$/, '');
    } catch {
        return String(url).trim().replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/, '');
    }
}

function normalizeTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, '')
        .slice(0, 120);
}

function stableItemKey(type, item) {
    const url = normalizeUrl(item.url);
    if (url) return `url:${url}`;
    if (item.id !== undefined && item.id !== null) return `${type}:${item.id}`;
    return `title:${normalizeTitle(item.title)}`;
}

function countFetchedByType(allUnifiedData) {
    const counts = {};
    for (const type in allUnifiedData) counts[type] = (allUnifiedData[type] || []).length;
    return counts;
}

function flattenFetchedData(allUnifiedData) {
    const items = [];
    for (const type in allUnifiedData) {
        for (const item of allUnifiedData[type] || []) {
            const contentHtml = item.details?.content_html || item.content_html || item.description || '';
            items.push({
                id: `${type}:${item.id}`,
                type,
                source_id: item.id,
                title: item.title || '',
                url: item.url || '',
                source: item.source || item.feed_title || item.authors || type,
                published_date: item.published_date || '',
                description: item.description || '',
                content_html: contentHtml,
                content_text: stripHtml(contentHtml),
                dedupe_key: stableItemKey(type, item)
            });
        }
    }
    return items;
}

function mergeRawItems(existing, incoming) {
    const byKey = new Map();
    for (const item of existing || []) byKey.set(item.dedupe_key, item);
    const fresh = [];
    for (const item of incoming) {
        if (byKey.has(item.dedupe_key)) continue;
        byKey.set(item.dedupe_key, item);
        fresh.push(item);
    }
    return { merged: Array.from(byKey.values()), fresh };
}

async function streamChat(env, userPrompt, systemPrompt) {
    let out = '';
    for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) out += chunk;
    return removeMarkdownCodeBlock(out);
}

function parseJsonLoose(text, fallback) {
    const cleaned = removeMarkdownCodeBlock(text || '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { /* ignore */ }
        }
    }
    return fallback;
}

function truncateText(text, maxChars) {
    const str = String(text || '').trim();
    return str.length > maxChars ? str.slice(0, maxChars) + '……' : str;
}

async function evaluateItem(env, item) {
    const maxChars = Number(env.INCREMENTAL_ARTICLE_MAX_CHARS || DEFAULT_ARTICLE_MAX_CHARS);
    const articleText = truncateText(item.content_text || stripHtml(item.content_html || item.description), maxChars);
    const prompt = `标题：${item.title}\n来源：${item.source}\n发布时间：${item.published_date}\nURL：${item.url}\n类型：${item.type}\n\n全文：\n${articleText}`;
    const raw = await streamChat(env, prompt, getSystemPromptArticleEvaluation());
    const evaluation = parseJsonLoose(raw, {
        is_ai_related: false,
        is_publish_worthy: false,
        score: 0,
        category: '未知',
        event_key: item.dedupe_key,
        flash_summary: '',
        reason: 'AI 评估 JSON 解析失败。',
        suggested_title: item.title
    });
    return { ...item, evaluation, evaluated_at: new Date().toISOString() };
}

function selectBatchItems(evaluatedNewItems, publishedEvents) {
    const selectedIds = [];
    const rejected = [];

    for (const item of evaluatedNewItems) {
        const evaluation = item.evaluation || {};
        const isQualified = evaluation.is_ai_related === true && evaluation.is_publish_worthy === true;

        if (isQualified) {
            selectedIds.push(item.id);
            continue;
        }

        rejected.push({
            id: item.id,
            reason: evaluation.reason || (evaluation.is_ai_related === false ? '非 AI 相关内容' : 'AI 评估认为不适合发布')
        });
    }

    const duplicateCount = selectedIds.filter(id => {
        const item = evaluatedNewItems.find(i => i.id === id);
        const eventKey = item?.evaluation?.event_key || item?.dedupe_key;
        return Boolean(eventKey && publishedEvents[eventKey]);
    }).length;

    return {
        batch_summary: `本批评估 ${evaluatedNewItems.length} 条新内容，符合 AI 相关且值得发布条件的 ${selectedIds.length} 条${duplicateCount > 0 ? `，其中 ${duplicateCount} 条为已发布事件的相关来源` : ''}。`,
        selected_ids: selectedIds,
        rejected
    };
}

function sourceLink(item) {
    return item.url ? `[${item.source || '原文'}](${item.url})` : (item.source || '原文链接缺失');
}

async function generateBatchSection(env, reportDate, batch, selectedItems) {
    const label = batchLabel(batch);
    if (selectedItems.length === 0) {
        return `### ${label}\n\n本批暂无抓取到新的资讯。\n`;
    }

    const lines = selectedItems.map((item, index) => {
        const title = item.title || '未命名资讯';
        const source = item.source || item.type || '未知来源';
        const date = item.published_date ? ` · ${item.published_date}` : '';
        const description = extractSummaryText(
            item.description || item.content_text || item.details?.content_html || item.content_html,
            220
        );
        const descriptionLine = description ? `\n   - 摘要：${description}` : '';
        return `${index + 1}. **${title}** — ${source}${date}\n   - 链接：${sourceLink(item)}${descriptionLine}`;
    });

    return `### ${label}\n\n本批共抓取 ${selectedItems.length} 条资讯，以下全部推送：\n\n${lines.join('\n\n')}\n`;
}

function createInitialMarkdown(reportDate, updatedAt) {
    return `---
title: "Bubble's Brain - ${reportDate}"
date: ${reportDate}T10:00:00+08:00
lastmod: ${updatedAt}
description: "Bubble's Brain - ${new Date(reportDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} AI 增量日报"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

## AI资讯 ${formatDateToChinese(reportDate)}

> AI 日报 · 分时段增量更新

<!-- overview:start -->
### 今日总览

今日 AI 增量日报正在更新中。
<!-- overview:end -->

`;
}

function updateFrontMatterLastmod(markdown, now) {
    if (/^---[\s\S]*?\nlastmod:/m.test(markdown)) {
        return markdown.replace(/(\nlastmod:\s*).*/, `$1${now}`);
    }
    return markdown.replace(/^---\n/, `---\nlastmod: ${now}\n`);
}

function upsertBatchSection(markdown, batch, section) {
    const start = `<!-- batch:${batch}:start -->`;
    const end = `<!-- batch:${batch}:end -->`;
    const block = `${start}\n${section.trim()}\n${end}`;
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    if (re.test(markdown)) return markdown.replace(re, block);

    const insertionOrder = ['morning', 'afternoon', 'night', 'lateNight'];
    const later = insertionOrder.slice(insertionOrder.indexOf(batch) + 1).find(b => markdown.includes(`<!-- batch:${b}:start -->`));
    if (later) return markdown.replace(`<!-- batch:${later}:start -->`, `${block}\n\n<!-- batch:${later}:start -->`);
    return markdown.trimEnd() + `\n\n${block}\n`;
}

async function generateOverview(env, markdown) {
    const body = markdown.replace(/^---[\s\S]*?---\s*/, '').replace(/<!-- overview:start -->[\s\S]*?<!-- overview:end -->/, '');
    const overview = await streamChat(env, body, getSystemPromptDailyOverview());
    return `### 今日总览\n\n${overview.trim()}`;
}

function upsertOverview(markdown, overview) {
    const start = '<!-- overview:start -->';
    const end = '<!-- overview:end -->';
    const block = `${start}\n${overview.trim()}\n${end}`;
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    if (re.test(markdown)) return markdown.replace(re, block);
    return markdown.replace(/> AI 日报 · 分时段增量更新\n/, `> AI 日报 · 分时段增量更新\n\n${block}\n`);
}

async function commitDailyFiles(env, snapshot, reportDate, markdown, batch, committedAt, api) {
    const formatted = formatMarkdownText(markdown);
    const files = [
        { path: `daily/${reportDate}.md`, content: formatted },
        { path: `content/daily/${reportDate}.md`, content: formatted }
    ];
    const publication = await publishFilesAtomically(env, {
        snapshot,
        files,
        message: `Incremental daily ${reportDate} ${batch}`,
        committedAt,
        reportDate,
        batch,
        mode: 'legacy',
    }, { api });
    return {
        ...publication,
        files: files.map(file => ({ path: file.path, success: true })),
    };
}

async function confirmedLegacyTriggerResult(env, triggerId, reportDate, batch, deps) {
    if (!triggerId) return null;
    let marker;
    try {
        marker = await deps.readMarker(env.DATA_KV, triggerId);
    } catch (error) {
        console.warn('[IncrementalDaily] legacy trigger marker read failed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
    if (!marker?.commit_sha
        || marker.mode !== 'legacy'
        || marker.reportDate !== reportDate
        || marker.batch !== batch) return null;
    try {
        let confirmedSha = marker.commit_sha;
        let successor = null;
        if (marker.pending === true && Number.isInteger(marker?.pull_request?.number)) {
            const pull = await deps.api(env, `/pulls/${marker.pull_request.number}`);
            if (pull?.state === 'open') return { ...marker, idempotent: true };
            if (pull?.state === 'closed' && !pull?.merged_at) {
                successor = await deps.resolveAlias(
                    env,
                    marker.commit_sha,
                    env.GITHUB_BRANCH || 'main',
                    { api: deps.api },
                );
                if (successor) {
                    confirmedSha = successor.commitSha;
                    if (successor.pull.state === 'open') {
                        return {
                            ...marker,
                            commit_sha: confirmedSha,
                            pull_request: {
                                number: successor.pull.number,
                                url: successor.pull.url,
                            },
                            idempotent: true,
                        };
                    }
                }
            }
        }
        const snapshot = await deps.resolveBaseSnapshot(env, { api: deps.api });
        if (!await deps.commitIncluded(env, confirmedSha, snapshot.headSha, {
            api: deps.api,
        })) return null;
        return {
            ...marker,
            commit_sha: confirmedSha,
            ...(successor ? {
                pull_request: { number: successor.pull.number, url: successor.pull.url },
            } : {}),
            pending: false,
            publication_status: 'published',
            idempotent: true,
        };
    } catch (error) {
        console.warn('[IncrementalDaily] legacy trigger marker could not be confirmed', {
            errorType: error?.name || 'Error',
        });
        return null;
    }
}

async function storeLegacyMarker(env, triggerId, response, storeMarker) {
    if (!triggerId) return;
    try {
        await storeMarker(env.DATA_KV, triggerId, response);
    } catch (error) {
        console.warn('[IncrementalDaily] legacy trigger marker write failed', {
            errorType: error?.name || 'Error',
        });
    }
}

export async function runLegacyIncrementalDailyWorkflow(env, options = {}, dependencies = {}) {
    const deps = {
        api: dependencies.api || callGitHubApi,
        commitIncluded: dependencies.commitIncluded || isCommitIncluded,
        readMarker: dependencies.readMarker || readTriggerMarker,
        resolveAlias: dependencies.resolveAlias || resolvePublicationAlias,
        resolveBaseSnapshot: dependencies.resolveBaseSnapshot || resolveBranchSnapshot,
        resolveSnapshot: dependencies.resolveSnapshot || ((targetEnv, resolveOptions) => (
            resolvePublicationSnapshot(targetEnv, { ...resolveOptions, expectedMode: 'legacy' })
        )),
        storeMarker: dependencies.storeMarker || storeTriggerMarker,
    };
    const runAt = options.runAt || new Date().toISOString();
    const targetClock = options.date
        ? new Date(`${options.date}T12:00:00+08:00`)
        : options.runAt ? new Date(options.runAt) : new Date();
    const { reportDate, batch } = resolveBatch(targetClock, options.batch, options.date);
    console.log(`[IncrementalDaily] Start reportDate=${reportDate}, batch=${batch}`);

    const confirmed = await confirmedLegacyTriggerResult(
        env, options.triggerId || null, reportDate, batch, deps,
    );
    if (confirmed) return confirmed;

    let fetched = options.fetchedOverride;
    if (!fetched) {
        const foloCookie = await resolveFoloCookie(env);
        fetched = await fetchAllData(env, foloCookie);
    }
    const sourceCounts = countFetchedByType(fetched);
    const incoming = flattenFetchedData(fetched);

    const rawKey = `incremental:raw:${reportDate}`;
    const batchKey = `incremental:batch:${reportDate}:${batch}`;

    const existingRaw = await getFromKV(env.DATA_KV, rawKey) || [];
    const mergedRaw = existingRaw.concat(incoming);
    await storeInKV(env.DATA_KV, rawKey, mergedRaw, KV_TTL);

    const selected = incoming;
    const selection = {
        batch_summary: `本批抓取 ${incoming.length} 条资讯，未评估、未去重，全部推送。`,
        selected_ids: selected.map(i => i.id),
        rejected: []
    };

    const section = await generateBatchSection(env, reportDate, batch, selected);
    await storeInKV(env.DATA_KV, batchKey, { reportDate, batch, label: batchLabel(batch), selected_ids: selected.map(i => i.id), section, selection, updated_at: new Date().toISOString() }, KV_TTL);

    const snapshot = await deps.resolveSnapshot(env, { api: deps.api });
    const reader = createSnapshotReader(env, snapshot, { api: deps.api });
    const contentPath = `content/daily/${reportDate}.md`;
    let markdown = await reader.readText(contentPath) || createInitialMarkdown(reportDate, runAt);
    markdown = updateFrontMatterLastmod(markdown, runAt);
    markdown = upsertBatchSection(markdown, batch, section);
    const overview = await generateOverview(env, markdown);
    markdown = upsertOverview(markdown, overview);

    const publication = await commitDailyFiles(
        env, snapshot, reportDate, markdown, batch, runAt, deps.api,
    );
    console.log(`[IncrementalDaily] Completed reportDate=${reportDate}, batch=${batch}, fetched=${incoming.length}, selected=${selected.length}`);

    const response = {
        success: true,
        mode: 'legacy',
        reportDate,
        batch,
        batchOrder: batchOrder(batch),
        fetchedCount: incoming.length,
        sourceCounts,
        freshCount: incoming.length,
        pendingCount: 0,
        evaluatedCount: 0,
        selectedCount: selected.length,
        commits: publication.files,
        commit_sha: publication.commitSha,
        pending: publication.pending === true,
        publication_status: publication.pending === true ? 'pending' : 'published',
        ...(publication.branch ? { publication_branch: publication.branch } : {}),
        ...(publication.pullRequest ? { pull_request: publication.pullRequest } : {}),
    };
    await storeLegacyMarker(env, options.triggerId || null, response, deps.storeMarker);
    return response;
}

function assertExternalWritesEnabled(env) {
    if (String(env.EXTERNAL_WRITES_ENABLED).toLowerCase() !== 'true') {
        throw new Error('External writes are disabled');
    }
}

export async function runIncrementalDailyWorkflow(env, options = {}, dependencies = {}) {
    assertExternalWritesEnabled(env);
    const mode = env.DAILY_PUBLISH_MODE;
    if (!['legacy', 'shadow', 'structured'].includes(mode)) {
        throw new Error('DAILY_PUBLISH_MODE must be legacy, shadow, or structured');
    }

    const runLegacy = dependencies.runLegacy || runLegacyIncrementalDailyWorkflow;
    if (mode === 'legacy') return runLegacy(env, options);

    const runAt = options.runAt || new Date().toISOString();
    const targetClock = options.date
        ? new Date(`${options.date}T12:00:00+08:00`)
        : new Date(runAt);
    const { reportDate, batch } = resolveBatch(targetClock, options.batch, options.date);
    const contentCutoff = resolveContentCutoff(options, reportDate, batch, runAt);

    if (mode === 'structured') {
        resolveHistoryEpochStartDate(env, reportDate);
        if (String(env.DAILY_STRUCTURED_WRITES_ENABLED).toLowerCase() !== 'true') {
            throw new Error('Structured writes are disabled');
        }
        const runStructured = dependencies.runStructured || runStructuredDailyWorkflow;
        return runStructured(env, {
            reportDate,
            batch,
            triggerId: options.triggerId || null,
            runAt,
            contentCutoff,
        });
    }

    const getFoloCookie = dependencies.getFoloCookie || resolveFoloCookie;
    const fetchStructured = dependencies.fetchStructured || fetchProviderPreservingData;
    const foloCookie = await getFoloCookie(env);
    const fetched = await fetchStructured(env, foloCookie);
    const legacyResult = await runLegacy(env, {
        ...options,
        fetchedOverride: fetched.grouped,
    });

    try {
        const structuredStartDate = resolveHistoryEpochStartDate(env, reportDate);
        if (fetched.errors.length > 0) {
            const error = new Error('One or more shadow providers failed');
            error.name = 'StructuredShadowSourceError';
            error.sourceErrors = fetched.errors;
            throw error;
        }
        const runShadow = dependencies.runShadow || runStructuredShadow;
        const shadow = await runShadow(env, {
            reportDate,
            batch,
            runAt,
            contentCutoff,
            rawItems: fetched.structuredItems,
            structuredStartDate,
            producer: {
                version: env.DAILY_PRODUCER_VERSION,
                commitSha: env.DAILY_PRODUCER_COMMIT_SHA || null,
            },
        });
        return { ...legacyResult, mode: 'shadow', shadow };
    } catch (error) {
        console.warn('[IncrementalDaily] structured shadow failed', {
            errorType: error?.name || 'Error',
        });
        return {
            ...legacyResult,
            mode: 'shadow',
            shadow: {
                status: 'failed',
                error_type: error?.name || 'Error',
                ...(error?.sourceErrors ? { source_errors: error.sourceErrors } : {}),
            },
        };
    }
}

export async function handleIncrementalDailyWorkflow({ date, batch }, env) {
    const result = await runIncrementalDailyWorkflow(env, { date, batch });
    return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}
