// src/handlers/commitToGitHub.js
import { getISODate, formatMarkdownText, replaceImageProxy,formatDateToGMT12WithTime } from '../helpers.js';
import { getGitHubFileSha, createOrUpdateGitHubFile } from '../github.js';
import { storeInKV } from '../kv.js';
import { marked } from '../marked.esm.js';
import { triggerGitHubWorkflow } from './triggerGitHubWorkflow.js';

export async function handleCommitToGitHub(request, env) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const formData = await request.formData();
        const dateStr = formData.get('date') || getISODate();
        const dailyMd = formData.get('daily_summary_markdown');
        const podcastMd = formData.get('podcast_script_markdown');
        // 从 "YYYY-MM-DD" 格式的 dateStr 中提取 "YYYY-MM"
        const yearMonth = dateStr.substring(0, 7);
        const report = {
                report_date: dateStr,
                title: dateStr+'日刊',
                link:  '/'+yearMonth+'/'+dateStr+'/',
                content_html: null,
                // 可以添加其他相關欄位，例如作者、來源等
                published_date: formatDateToGMT12WithTime(new Date()) // 記錄保存時間
        }

        const filesToCommit = [];

        if (dailyMd) {
            // Generate Hugo front matter
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
            // Commit to both daily/ (for backward compatibility) and content/daily/ (for Hugo)
            const formattedContent = formatMarkdownText(dailyMd);
            filesToCommit.push({ 
                path: `daily/${dateStr}.md`, 
                content: formattedContent, 
                description: "Daily Summary File" 
            });
            filesToCommit.push({ 
                path: `content/daily/${dateStr}.md`, 
                content: hugoFrontMatter + formattedContent, 
                description: "Hugo Daily Summary File" 
            });
            report.content_html = marked.parse(formatMarkdownText(env.IMG_PROXY, dailyMd));
            storeInKV(env.DATA_KV, `${dateStr}-report`, report);
        }
        if (podcastMd) {
            filesToCommit.push({ path: `podcast/${dateStr}.md`, content: podcastMd, description: "Podcast Script File" });
        }

        if (filesToCommit.length === 0) {
            throw new Error("No markdown content provided for GitHub commit.");
        }

        const results = [];
        for (const file of filesToCommit) {
            try {
                const existingSha = await getGitHubFileSha(env, file.path);
                const commitMessage = `${existingSha ? 'Update' : 'Create'} ${file.description.toLowerCase()} for ${dateStr}`;
                await createOrUpdateGitHubFile(env, file.path, file.content, commitMessage, existingSha);
                results.push({ file: file.path, status: 'Success', message: `Successfully ${existingSha ? 'updated' : 'created'}.` });
                console.log(`GitHub commit success for ${file.path}`);
            } catch (err) {
                console.error(`Failed to commit ${file.path} to GitHub:`, err);
                results.push({ file: file.path, status: 'Failed', message: err.message });
            }
        }
        
        // Optionally trigger GitHub workflow for immediate deployment
        const triggerWorkflow = formData.get('trigger_workflow');
        let workflowResult = null;
        if (triggerWorkflow === 'true' && results.some(r => r.status === 'Success')) {
            workflowResult = await triggerGitHubWorkflow(env);
        }
        
        return new Response(JSON.stringify({ 
            status: 'success', 
            date: dateStr, 
            results: results,
            workflow: workflowResult 
        }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /commitToGitHub:", error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
}
