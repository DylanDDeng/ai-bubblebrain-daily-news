#!/bin/bash

echo "🔍 检查 GitHub Pages 配置"
echo "========================"
echo ""

GITHUB_USER="DylanDDeng"
GITHUB_REPO="ai-bubblebrain-daily-news"

echo "📊 仓库信息："
echo "用户: $GITHUB_USER"
echo "仓库: $GITHUB_REPO"
echo ""

echo "🌐 检查 GitHub Pages API："
curl -s https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO/pages | jq '.' 2>/dev/null || echo "无法获取 Pages 信息"
echo ""

echo "🔍 检查分支："
curl -s https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO/branches | jq '.[].name' 2>/dev/null || echo "无法获取分支信息"
echo ""

echo "📝 请手动检查："
echo "1. 访问: https://github.com/$GITHUB_USER/$GITHUB_REPO/settings/pages"
echo "2. 确认 Source 设置："
echo "   - Deploy from a branch"
echo "   - Branch: gh-pages (或 main)"
echo "   - Folder: / (root)"
echo "3. Custom domain: bubblenews.today"
echo ""
echo "4. 如果没有 gh-pages 分支，需要："
echo "   - 推送构建后的内容到 gh-pages 分支"
echo "   - 或配置 GitHub Actions 自动部署"