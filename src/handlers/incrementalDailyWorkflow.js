// src/handlers/incrementalDailyWorkflow.js
import { fetchAllData } from '../dataFetchers.js';
import { resolveFoloCookie } from '../folo.js';
import { getFromKV, storeInKV } from '../kv.js';
import { stripHtml, extractSummaryText, removeMarkdownCodeBlock, formatDateToChinese, formatMarkdownText } from '../helpers.js';
import { callChatAPIStream } from '../chatapi.js';
import { callGitHubApi, createOrUpdateGitHubFile, getGitHubFileSha } from '../github.js';
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

function batchLabel(batch) {
    return ({
        morning: '10:00 更新',
        afternoon: '15:00 更新',
        night: '23:00 更新',
        lateNight: '次日 03:00 补充更新'
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

function createInitialMarkdown(reportDate) {
    return `---
title: "Bubble's Brain - ${reportDate}"
date: ${reportDate}T10:00:00+08:00
lastmod: ${new Date().toISOString()}
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

function updateFrontMatterLastmod(markdown) {
    const now = new Date().toISOString();
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

async function getGitHubTextFile(env, path) {
    try {
        const branch = env.GITHUB_BRANCH || 'main';
        const data = await callGitHubApi(env, `/contents/${path}?ref=${branch}`);
        if (!data?.content) return null;
        return decodeURIComponent(atob(data.content.replace(/\n/g, '')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    } catch (error) {
        if (error.message.includes('404') || error.message.toLowerCase().includes('not found')) return null;
        throw error;
    }
}

async function commitDailyFiles(env, reportDate, markdown, batch) {
    const formatted = formatMarkdownText(markdown);
    const files = [
        { path: `daily/${reportDate}.md`, content: formatted },
        { path: `content/daily/${reportDate}.md`, content: formatted }
    ];
    const results = [];
    for (const file of files) {
        const sha = await getGitHubFileSha(env, file.path);
        await createOrUpdateGitHubFile(env, file.path, file.content, `Incremental daily ${reportDate} ${batch}`, sha);
        results.push({ path: file.path, success: true });
    }
    return results;
}

export async function runIncrementalDailyWorkflow(env, options = {}) {
    const { reportDate, batch } = resolveBatch(options.date ? new Date(`${options.date}T12:00:00+08:00`) : new Date(), options.batch, options.date);
    console.log(`[IncrementalDaily] Start reportDate=${reportDate}, batch=${batch}`);

    const foloCookie = await resolveFoloCookie(env);

    const fetched = await fetchAllData(env, foloCookie);
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

    const contentPath = `content/daily/${reportDate}.md`;
    let markdown = await getGitHubTextFile(env, contentPath) || createInitialMarkdown(reportDate);
    markdown = updateFrontMatterLastmod(markdown);
    markdown = upsertBatchSection(markdown, batch, section);
    const overview = await generateOverview(env, markdown);
    markdown = upsertOverview(markdown, overview);

    const commits = await commitDailyFiles(env, reportDate, markdown, batch);
    console.log(`[IncrementalDaily] Completed reportDate=${reportDate}, batch=${batch}, fetched=${incoming.length}, selected=${selected.length}`);

    return {
        success: true,
        reportDate,
        batch,
        batchOrder: batchOrder(batch),
        fetchedCount: incoming.length,
        sourceCounts,
        freshCount: incoming.length,
        pendingCount: 0,
        evaluatedCount: 0,
        selectedCount: selected.length,
        commits
    };
}

export async function handleIncrementalDailyWorkflow(request, env) {
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const batch = url.searchParams.get('batch');
    try {
        const result = await runIncrementalDailyWorkflow(env, { date, batch });
        return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
        console.error('[IncrementalDaily] Failed:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
}
