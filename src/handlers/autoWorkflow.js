// src/handlers/autoWorkflow.js
import { getISODate, stripHtml, removeMarkdownCodeBlock, formatDateToChinese, formatMarkdownText, formatDateToGMT12WithTime } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { getFoloCookie } from '../folo.js';
import { callChatAPIStream } from '../chatapi.js';
import { getSystemPromptAutoFilter } from '../prompt/autoFilterPrompt.js';
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
    
    // 2. AI Auto-Filter
    const itemsForFilter = [];
    for (const type in allUnifiedData) {
        allUnifiedData[type].forEach(item => {
            itemsForFilter.push({
                id: `${type}:${item.id}`,
                type: type,
                title: item.title,
                summary: stripHtml(item.description || item.details?.content_html || "").substring(0, 200)
            });
        });
    }
    
    if (itemsForFilter.length === 0) {
        return { success: false, message: "No items fetched to filter." };
    }
    
    const filterInput = itemsForFilter.map(item => `[ID]: ${item.id}\n[Type]: ${item.type}\n[Title]: ${item.title}\n[Summary]: ${item.summary}`).join('\n\n---\n\n');
    const filterSystemPrompt = getSystemPromptAutoFilter();
    
    let filterResponse = "";
    for await (const chunk of callChatAPIStream(env, filterInput, filterSystemPrompt)) {
        filterResponse += chunk;
    }
    
    const selectedIds = filterResponse.split(',').map(s => s.trim()).filter(s => s);
    console.log(`[AutoWorkflow] AI selected ${selectedIds.length} items.`);
    
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
