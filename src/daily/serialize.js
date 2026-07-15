function escapeMarkdown(value) {
    return String(value).replace(/([\\`*_[\]<>])/g, '\\$1');
}

function compareKeys(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function canonicalizeObjectKeys(value) {
    if (Array.isArray(value)) return value.map(canonicalizeObjectKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort(compareKeys)
            .map(key => [key, canonicalizeObjectKeys(value[key])]),
    );
}

export function serializeDailyReportJson(report) {
    return `${JSON.stringify(canonicalizeObjectKeys(report), null, 2)}\n`;
}

export function renderDailyReportMarkdown(report) {
    const sections = report.batches.map(batch => {
        const items = batch.item_ids
            .map(id => report.items.find(item => item.id === id))
            .filter(Boolean);
        if (items.length === 0) return '';
        const lines = items.map(item => {
            const title = escapeMarkdown(item.title);
            const linkedTitle = item.canonical_url ? `[${title}](<${item.canonical_url}>)` : `**${title}**`;
            const summary = item.summary ? `\n  - 摘要：${escapeMarkdown(item.summary)}` : '';
            return `- ${linkedTitle} — ${escapeMarkdown(item.source.name)}${summary}`;
        });
        return `### ${batch.label}\n\n${lines.join('\n')}`;
    }).filter(Boolean);

    return `---
title: "Bubble's Brain - ${report.date}"
date: ${report.date}T10:00:00+08:00
lastmod: ${report.generated_at}
description: "Bubble's Brain - ${report.date} AI 增量日报"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

## AI资讯 ${report.date}

> AI 日报 · 分时段增量更新

<!-- overview:start -->
### 今日总览

${escapeMarkdown(report.overview.text)}
<!-- overview:end -->

${sections.join('\n\n')}
`;
}

export function createDailyReportArtifacts(report) {
    const json = serializeDailyReportJson(report);
    const markdown = renderDailyReportMarkdown(report);
    return {
        json,
        markdown,
        files: [
            { path: `data/daily/${report.date}.json`, content: json },
            { path: `daily/${report.date}.md`, content: markdown },
            { path: `content/daily/${report.date}.md`, content: markdown },
        ],
    };
}
