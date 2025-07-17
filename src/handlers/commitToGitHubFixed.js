// 修复版本的 commitToGitHub 处理器
// 这个版本会更好地处理目录不存在的情况

import { getISODate, formatMarkdownText, replaceImageProxy, formatDateToGMT12WithTime } from '../helpers.js';
import { getGitHubFileSha, createOrUpdateGitHubFile } from '../github.js';
import { storeInKV } from '../kv.js';
import { marked } from '../marked.esm.js';

async function commitFileWithRetry(env, filePath, content, commitMessage, existingSha = null) {
    try {
        // 尝试提交文件
        await createOrUpdateGitHubFile(env, filePath, content, commitMessage, existingSha);
        return { success: true };
    } catch (error) {
        console.error(`First attempt failed for ${filePath}:`, error.message);
        
        // 如果是 404 错误且路径包含子目录，尝试创建目录
        if (error.message.includes('404') && filePath.includes('/') && !existingSha) {
            const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
            console.log(`Attempting to create directory structure: ${dirPath}`);
            
            try {
                // 创建一个 .gitkeep 文件来确保目录存在
                const gitkeepPath = `${dirPath}/.gitkeep`;
                await createOrUpdateGitHubFile(
                    env, 
                    gitkeepPath, 
                    '', 
                    `Create directory ${dirPath}`, 
                    null
                );
                
                // 再次尝试创建原文件
                await createOrUpdateGitHubFile(env, filePath, content, commitMessage, existingSha);
                return { success: true, directoryCreated: true };
            } catch (retryError) {
                console.error(`Retry with directory creation also failed:`, retryError.message);
                return { success: false, error: error.message, retryError: retryError.message };
            }
        }
        
        return { success: false, error: error.message };
    }
}

export async function handleCommitToGitHubFixed(request, env) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), { 
            status: 405, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
    
    try {
        const formData = await request.formData();
        const dateStr = formData.get('date') || getISODate();
        const dailyMd = formData.get('daily_summary_markdown');
        const podcastMd = formData.get('podcast_script_markdown');
        
        const yearMonth = dateStr.substring(0, 7);
        const report = {
            report_date: dateStr,
            title: dateStr + '日刊',
            link: '/' + yearMonth + '/' + dateStr + '/',
            content_html: null,
            published_date: formatDateToGMT12WithTime(new Date())
        };

        const filesToCommit = [];
        const results = [];

        if (dailyMd) {
            // Generate Hugo front matter
            const hugoFrontMatter = `---
title: "AI 洞察日报 - ${dateStr}"
date: ${dateStr}T09:00:00+08:00
description: "AI 洞察日报 - ${new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

`;
            const formattedContent = formatMarkdownText(dailyMd);
            
            // 提交到 daily/ 目录
            const dailyPath = `daily/${dateStr}.md`;
            const dailySha = await getGitHubFileSha(env, dailyPath);
            const dailyResult = await commitFileWithRetry(
                env,
                dailyPath,
                formattedContent,
                `${dailySha ? 'Update' : 'Create'} daily summary for ${dateStr}`,
                dailySha
            );
            
            results.push({
                file: dailyPath,
                status: dailyResult.success ? 'Success' : 'Failed',
                message: dailyResult.success 
                    ? `Successfully ${dailySha ? 'updated' : 'created'}.`
                    : `Error: ${dailyResult.error}`
            });
            
            // 提交到 content/daily/ 目录
            const contentPath = `content/daily/${dateStr}.md`;
            const contentSha = await getGitHubFileSha(env, contentPath);
            const contentResult = await commitFileWithRetry(
                env,
                contentPath,
                hugoFrontMatter + formattedContent,
                `${contentSha ? 'Update' : 'Create'} Hugo daily summary for ${dateStr}`,
                contentSha
            );
            
            results.push({
                file: contentPath,
                status: contentResult.success ? 'Success' : 'Failed',
                message: contentResult.success 
                    ? `Successfully ${contentSha ? 'updated' : 'created'}.${contentResult.directoryCreated ? ' (Directory was created)' : ''}`
                    : `Error: ${contentResult.error}`
            });
            
            // 保存到 KV
            report.content_html = marked.parse(formatMarkdownText(env.IMG_PROXY, dailyMd));
            await storeInKV(env.DATA_KV, `${dateStr}-report`, report);
        }

        if (podcastMd) {
            const podcastPath = `podcast/${dateStr}.md`;
            const podcastSha = await getGitHubFileSha(env, podcastPath);
            const podcastResult = await commitFileWithRetry(
                env,
                podcastPath,
                podcastMd,
                `${podcastSha ? 'Update' : 'Create'} podcast script for ${dateStr}`,
                podcastSha
            );
            
            results.push({
                file: podcastPath,
                status: podcastResult.success ? 'Success' : 'Failed',
                message: podcastResult.success 
                    ? `Successfully ${podcastSha ? 'updated' : 'created'}.`
                    : `Error: ${podcastResult.error}`
            });
        }

        if (results.length === 0) {
            throw new Error("No markdown content provided for GitHub commit.");
        }

        // 检查是否有失败的提交
        const hasFailures = results.some(r => r.status === 'Failed');
        
        return new Response(JSON.stringify({ 
            status: hasFailures ? 'partial' : 'success', 
            date: dateStr, 
            results: results 
        }), { 
            headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });

    } catch (error) {
        console.error("Error in /commitToGitHub:", error);
        return new Response(JSON.stringify({ 
            status: 'error', 
            message: error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });
    }
}