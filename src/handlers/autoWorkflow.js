// src/handlers/autoWorkflow.js
import { getISODate, stripHtml, removeMarkdownCodeBlock, formatDateToChinese, formatMarkdownText, formatDateToGMT12WithTime } from '../helpers.js';

/**
 * 清洗 project 描述中的热度数字，避免 LLM 在筛选阶段被星数等量化指标吸引。
 * 仅用于筛选输入构建，不影响 Step 3 的内容生成（那里会正确显示 totalStars）。
 */
function cleanProjectDescription(desc) {
    if (!desc) return '';
    return desc
        .replace(/\b\d{1,3}(,\d{3})*\+?\s*(stars?|⭐|stargazers?|star_count)\b/gi, '')
        .replace(/\b\d{1,3}(,\d{3})*\+?\s*(forks?|forked)\b/gi, '')
        .replace(/\b\d{1,3}(,\d{3})*\+?\s*(下载|安装|使用|引用|cite|downloads?|installs?)\b/gi, '')
        .replace(/\b(\d+\.?\d*[kKmM]?)\s*(stars?|⭐|star)\b/gi, '')
        .replace(/\b(over|超过|超过)\s*\d{2,}[kKmM]?\s*(stars?|⭐|star|下载|安装)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,\s]+/g, '')
        .trim();
}

/**
 * 构建自动筛选阶段给 LLM 阅读的正文。
 * 以前这里只取前 200 字，导致 AI 只能凭标题和极短摘要排序；
 * 现在尽量提供数据源里可用的全文，同时保留一个较高上限避免候选池过大时超出模型上下文。
 */
function buildFilterContent(item, type, maxLength = 6000) {
    const rawContent = item.details?.content_html || item.description || item.summary || '';
    let content = stripHtml(rawContent)
        .replace(/\s+/g, ' ')
        .trim();

    if (type === 'project') {
        content = cleanProjectDescription(content);
    }

    if (content.length > maxLength) {
        return content.slice(0, maxLength) + '……';
    }

    return content;
}

/**
 * 统计各类别选中数量并输出日志。
 */
function logFilterResults(selectedIds, label) {
    const counts = { news: 0, socialMedia: 0, project: 0, paper: 0, unknown: 0 };
    for (const sel of selectedIds) {
        const type = sel.split(':')[0];
        if (counts.hasOwnProperty(type)) {
            counts[type]++;
        } else {
            counts.unknown++;
        }
    }
    const total = selectedIds.length;
    const mainPct = total > 0 ? ((counts.news + counts.socialMedia) / total * 100).toFixed(0) : 0;
    const auxCount = counts.project + counts.paper;
    console.log(`[AutoWorkflow] ${label}: total=${total}, news=${counts.news}, socialMedia=${counts.socialMedia}, project=${counts.project}, paper=${counts.paper}, unknown=${counts.unknown}, mainPct=${mainPct}%`);
    if (auxCount > 3) {
        console.warn(`[AutoWorkflow] ⚠️  WARNING: project+paper count (${auxCount}) exceeds recommended maximum 3!`);
    }
    if (counts.news + counts.socialMedia < 5) {
        console.warn(`[AutoWorkflow] ⚠️  WARNING: news+socialMedia count (${counts.news + counts.socialMedia}) is low!`);
    }
    return counts;
}
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { getFoloCookie } from '../folo.js';
import { callChatAPIStream } from '../chatapi.js';
import { getSystemPromptAutoFilter, getSystemPromptPrimaryFilter, getSystemPromptSecondaryFilter } from '../prompt/autoFilterPrompt.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepOne";
import { getSystemPromptSummarizationStepTwo } from "../prompt/summarizationPromptStepTwo";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { getSystemPromptPodcastFormatting, getSystemPromptShortPodcastFormatting } from '../prompt/podcastFormattingPrompt.js';
import { getSystemPromptDailyAnalysis } from '../prompt/dailyAnalysisPrompt.js';
import { createOrUpdateGitHubFile, getGitHubFileSha } from '../github.js';
import { marked } from '../marked.esm.js';

export async function handleAutoWorkflow(request, env) {
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date') || getISODate();
    
    try {
        const result = await runAutoWorkflow(env, dateStr);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
        console.error("Auto Workflow failed:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function runAutoWorkflow(env, dateStr) {
    if (!dateStr) dateStr = getISODate();
    console.log(`[AutoWorkflow] Starting for date: ${dateStr}`);
    
    // 1. Fetch Data
    const foloCookie = getFoloCookie(env);
    const allUnifiedData = await fetchAllData(env, foloCookie);
    
    // Store in KV first (consistent with manual workflow)
    for (const sourceType in allUnifiedData) {
        await storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, allUnifiedData[sourceType]);
    }
    
    // 2. AI Auto-Filter — 分桶筛选：主资讯桶 (news+socialMedia) + 补充桶 (project+paper)
    const itemsForFilter = [];
    for (const type in allUnifiedData) {
        allUnifiedData[type].forEach(item => {
            const content = buildFilterContent(item, type);
            itemsForFilter.push({
                id: `${type}:${item.id}`,
                type: type,
                title: item.title,
                content: content
            });
        });
    }
    
    if (itemsForFilter.length === 0) {
        return { success: false, message: "No items fetched to filter." };
    }

    // 输出候选池统计
    const poolCounts = {};
    itemsForFilter.forEach(i => { poolCounts[i.type] = (poolCounts[i.type] || 0) + 1; });
    console.log(`[AutoWorkflow] Filter candidate pool: ${JSON.stringify(poolCounts)}`);

    // 2a. 分桶
    const primaryItems = itemsForFilter.filter(i => i.type === 'news' || i.type === 'socialMedia');
    const secondaryItems = itemsForFilter.filter(i => i.type === 'project' || i.type === 'paper');
    console.log(`[AutoWorkflow] Buckets: primary(news+socialMedia)=${primaryItems.length}, secondary(project+paper)=${secondaryItems.length}`);

    if (primaryItems.length === 0) {
        return { success: false, message: "No news or socialMedia items to filter." };
    }

    // 通用的 ID 格式化 + 校验 + 去重
    const validIdPattern = /^(news|socialMedia|project|paper):.+$/;
    function parseAndValidateIds(rawResponse, label) {
        const rawIds = rawResponse.split(',').map(s => s.trim()).filter(s => s);
        const seen = new Set();
        const valid = [];
        for (const id of rawIds) {
            if (!validIdPattern.test(id)) {
                console.warn(`[AutoWorkflow] ⚠️  [${label}] Skipping invalid ID: "${id}"`);
                continue;
            }
            if (seen.has(id)) {
                console.warn(`[AutoWorkflow] ⚠️  [${label}] Skipping duplicate ID: "${id}"`);
                continue;
            }
            seen.add(id);
            valid.push(id);
        }
        return valid;
    }

    function buildFilterInput(items) {
        return items.map(item =>
            `[ID]: ${item.id}\n[Type]: ${item.type}\n[Title]: ${item.title}\n[Content]: ${item.content}`
        ).join('\n\n---\n\n');
    }

    // 2b. 主资讯桶：AI 排序
    const primaryFilterInput = buildFilterInput(primaryItems);
    let primaryResponse = "";
    for await (const chunk of callChatAPIStream(env, primaryFilterInput, getSystemPromptPrimaryFilter())) {
        primaryResponse += chunk;
    }
    const primaryRankedIds = parseAndValidateIds(primaryResponse, 'Primary');
    console.log(`[AutoWorkflow] Primary bucket ranked ${primaryRankedIds.length}/${primaryItems.length} IDs`);

    if (primaryRankedIds.length === 0) {
        return { success: false, message: "AI ranked no primary items." };
    }

    // 2c. 补充桶：AI 排序（仅当有候选项时）
    let secondaryRankedIds = [];
    if (secondaryItems.length > 0) {
        const secondaryFilterInput = buildFilterInput(secondaryItems);
        let secondaryResponse = "";
        for await (const chunk of callChatAPIStream(env, secondaryFilterInput, getSystemPromptSecondaryFilter())) {
            secondaryResponse += chunk;
        }
        secondaryRankedIds = parseAndValidateIds(secondaryResponse, 'Secondary');
        console.log(`[AutoWorkflow] Secondary bucket ranked ${secondaryRankedIds.length}/${secondaryItems.length} IDs`);
    }

    // 2d. 代码配额组装
    const PRIMARY_MIN = 7;
    const PRIMARY_MAX = 9;
    const SECONDARY_MAX = 3;
    const TOTAL_MAX = 12;

    // 主资讯：至少取 min(PRIMARY_MIN, available)，至多取 PRIMARY_MAX
    const primaryTake = Math.min(primaryRankedIds.length, PRIMARY_MAX);
    const secondaryTake = Math.min(secondaryRankedIds.length, SECONDARY_MAX);

    // 如果主资讯不足 PRIMARY_MIN，允许总量低于 8
    let selectedIds = [
        ...primaryRankedIds.slice(0, primaryTake),
        ...secondaryRankedIds.slice(0, secondaryTake)
    ];

    if (selectedIds.length > TOTAL_MAX) {
        selectedIds = selectedIds.slice(0, TOTAL_MAX);
    }

    const primaryCount = selectedIds.filter(id => id.startsWith('news:') || id.startsWith('socialMedia:')).length;
    if (primaryCount < PRIMARY_MIN) {
        console.warn(`[AutoWorkflow] ⚠️  Primary count (${primaryCount}) below minimum (${PRIMARY_MIN}) — pool may be insufficient today.`);
    }

    logFilterResults(selectedIds, 'Bucket filter results');
    console.log(`[AutoWorkflow] Final selection: ${selectedIds.length} items (primary=${primaryCount}, secondary=${selectedIds.length - primaryCount})`);
    
    if (selectedIds.length === 0) {
        return { success: false, message: "AI selected no items." };
    }
    
    // 3. Process Selected Items
    const selectedContentItems = [];
    for (const selection of selectedIds) {
        const [type, idStr] = selection.split(':');
        const itemsOfType = allUnifiedData[type];
        const item = itemsOfType ? itemsOfType.find(dataItem => String(dataItem.id) === idStr) : null;
        if (item) {
            let itemText = "";
            switch (item.type) {
                case 'news':
                    itemText = `News Title: ${item.title}\nPublished: ${item.published_date}\nContent Summary: ${stripHtml(item.details.content_html)}`;
                    break;
                case 'project':
                    itemText = `Project Name: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nDescription: ${item.description}\nStars: ${item.details.totalStars}`;
                    break;
                case 'paper':
                    itemText = `Papers Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nAbstract/Content Summary: ${stripHtml(item.details.content_html)}`;
                    break;
                case 'socialMedia':
                    itemText = `socialMedia Post by ${item.authors}：Published: ${item.published_date}\nUrl: ${item.url}\nContent: ${stripHtml(item.details.content_html)}`;
                    break;
                default:
                    itemText = `Type: ${item.type}\nTitle: ${item.title || 'N/A'}\nDescription: ${item.description || 'N/A'}\nURL: ${item.url || 'N/A'}`;
                    break;
            }
            selectedContentItems.push(itemText);
        }
    }
    
    // 4. AI Generation (Summary & Analysis)
    // Step 1: Summarization
    const summarizationSystemPrompt = getSystemPromptSummarizationStepOne();
    const summarizationInput = selectedContentItems.join('\n\n------\n\n');
    let summaryOutput = "";
    for await (const chunk of callChatAPIStream(env, summarizationInput, summarizationSystemPrompt)) {
        summaryOutput += chunk;
    }
    summaryOutput = removeMarkdownCodeBlock(summaryOutput);
    
    // Step 2: Formatting
    const formattingSystemPrompt = getSystemPromptSummarizationStepTwo();
    let formattedOutput = "";
    for await (const chunk of callChatAPIStream(env, summaryOutput, formattingSystemPrompt)) {
        formattedOutput += chunk;
    }
    formattedOutput = removeMarkdownCodeBlock(formattedOutput);
    
    // Step 3: AI Abstract
    const abstractSystemPrompt = getSystemPromptSummarizationStepThree();
    let abstractOutput = "";
    for await (const chunk of callChatAPIStream(env, formattedOutput, abstractSystemPrompt)) {
        abstractOutput += chunk;
    }
    abstractOutput = removeMarkdownCodeBlock(abstractOutput);
    
    // 5. Podcast Script
    const podcastSystemPrompt = getSystemPromptPodcastFormatting(env);
    let podcastScript = "";
    for await (const chunk of callChatAPIStream(env, summaryOutput, podcastSystemPrompt)) {
        podcastScript += chunk;
    }
    podcastScript = removeMarkdownCodeBlock(podcastScript);
    
    
    // 7. Prepare Final Markdown

    let dailyMdContent = `## ${env.DAILY_TITLE} ${formatDateToChinese(dateStr)}\n\n`;
    dailyMdContent += `> ${env.DAILY_TITLE_MIN}\n\n`;
    dailyMdContent += `### **AI内容摘要**\n\n${abstractOutput}\n\n`;
    dailyMdContent += `### **今日AI新闻**\n\n${formattedOutput}\n\n`;
    
    // 8. Commit to GitHub

    const filesToCommit = [];
    const hugoFrontMatter = `---
title: "Bubble's Brain - ${dateStr}"
date: ${dateStr}T09:00:00+08:00
description: "Bubble's Brain - ${new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

`;
    const formattedContent = formatMarkdownText(dailyMdContent);
    filesToCommit.push({ path: `daily/${dateStr}.md`, content: formattedContent });
    filesToCommit.push({ path: `content/daily/${dateStr}.md`, content: hugoFrontMatter + formattedContent });
    filesToCommit.push({ path: `podcast/${dateStr}.md`, content: podcastScript });
    
    const commitResults = [];
    for (const file of filesToCommit) {
        const existingSha = await getGitHubFileSha(env, file.path);
        const commitMessage = `Auto update ${file.path} for ${dateStr}`;
        await createOrUpdateGitHubFile(env, file.path, file.content, commitMessage, existingSha);
        commitResults.push({ path: file.path, success: true });
    }
    
    // Update KV report
    const yearMonth = dateStr.substring(0, 7);
    const report = {
        report_date: dateStr,
        title: dateStr + '日刊',
        link: '/' + yearMonth + '/' + dateStr + '/',
        content_html: marked.parse(formatMarkdownText(env.IMG_PROXY, dailyMdContent)),
        published_date: formatDateToGMT12WithTime(new Date())
    };
    await storeInKV(env.DATA_KV, `${dateStr}-report`, report);
    
    console.log(`[AutoWorkflow] Completed successfully for ${dateStr}`);
    return {
        success: true,
        date: dateStr,
        selectedCount: selectedIds.length,
        commits: commitResults
    };
}
