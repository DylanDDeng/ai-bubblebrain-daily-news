#!/usr/bin/env node

// Script to sync daily markdown files to Hugo content directory
// This script adds Hugo front matter and copies files from daily/ to content/daily/

const fs = require('fs').promises;
const path = require('path');

async function syncDailyToHugo() {
    const dailyDir = path.join(process.cwd(), 'daily');
    const hugoContentDir = path.join(process.cwd(), 'content', 'daily');
    
    try {
        // Ensure directories exist
        await fs.mkdir(dailyDir, { recursive: true });
        await fs.mkdir(hugoContentDir, { recursive: true });
        
        // Read all files from daily directory
        const files = await fs.readdir(dailyDir);
        const mdFiles = files.filter(file => file.endsWith('.md') && file !== 'SUMMARY.md');
        
        console.log(`Found ${mdFiles.length} markdown files to process`);
        
        for (const file of mdFiles) {
            const filePath = path.join(dailyDir, file);
            const hugoFilePath = path.join(hugoContentDir, file);
            
            // Extract date from filename (format: YYYY-MM-DD.md)
            const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})\.md$/);
            if (!dateMatch) {
                console.log(`Skipping ${file} - doesn't match date pattern`);
                continue;
            }
            
            const date = dateMatch[1];
            
            // Read original content
            const content = await fs.readFile(filePath, 'utf-8');
            
            // Extract title from content (usually first # heading)
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : `AI 洞察日报 - ${date}`;
            
            // Create Hugo front matter
            const frontMatter = `---
title: "${title}"
date: ${date}T09:00:00+08:00
description: "AI 洞察日报 - ${new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

`;
            
            // Check if file already has front matter
            if (content.startsWith('---')) {
                console.log(`${file} already has front matter, skipping`);
                continue;
            }
            
            // Combine front matter with content
            const hugoContent = frontMatter + content;
            
            // Write to Hugo content directory
            await fs.writeFile(hugoFilePath, hugoContent, 'utf-8');
            console.log(`Processed ${file} -> ${hugoFilePath}`);
        }
        
        console.log('Sync complete!');
        
    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
}

// Run the sync
syncDailyToHugo();