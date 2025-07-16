#!/bin/bash

echo "🚀 Cloudflare Pages 迁移助手"
echo "==========================="
echo ""

echo "📋 迁移前检查："
echo ""

# 检查当前配置
echo "1️⃣ 当前 Hugo 配置："
grep "baseURL" hugo.toml
echo ""

echo "2️⃣ 检查不需要的文件："
[ -f ".github/workflows/build-and-deploy.yml" ] && echo "✓ 找到 GitHub Actions 文件（迁移后可删除）"
[ -f "static/CNAME" ] && echo "✓ 找到 CNAME 文件（迁移后可删除）"
echo ""

echo "📝 迁移步骤："
echo ""
echo "1. 在 Cloudflare Dashboard 创建 Pages 项目："
echo "   https://dash.cloudflare.com/ → Workers & Pages → Create"
echo ""
echo "2. 连接 GitHub 仓库并使用以下配置："
echo "   ┌─────────────────────┬─────────────────┐"
echo "   │ 设置项              │ 值              │"
echo "   ├─────────────────────┼─────────────────┤"
echo "   │ 项目名称            │ ai-daily        │"
echo "   │ 生产分支            │ main            │"
echo "   │ 构建命令            │ hugo --minify   │"
echo "   │ 构建输出目录        │ public          │"
echo "   │ HUGO_VERSION        │ 0.147.9         │"
echo "   └─────────────────────┴─────────────────┘"
echo ""
echo "3. 部署成功后，添加自定义域名 bubblenews.today"
echo ""
echo "4. 删除 DNS 中的 A 记录（185.199.x.x）"
echo ""

read -p "是否要清理不需要的文件？(y/n): " CLEANUP

if [ "$CLEANUP" = "y" ] || [ "$CLEANUP" = "Y" ]; then
    echo ""
    echo "🗑️  清理文件..."
    
    # 备份文件
    [ -f ".github/workflows/build-and-deploy.yml" ] && {
        mv .github/workflows/build-and-deploy.yml .github/workflows/build-and-deploy.yml.bak
        echo "✓ 已备份 GitHub Actions 文件"
    }
    
    [ -f "static/CNAME" ] && {
        mv static/CNAME static/CNAME.bak
        echo "✓ 已备份 CNAME 文件"
    }
    
    echo ""
    echo "✅ 清理完成！备份文件带有 .bak 后缀"
fi

echo ""
echo "📖 详细说明请查看 CLOUDFLARE-PAGES-SETUP.md"
echo ""
echo "🎯 迁移后的优势："
echo "   • 自动构建和部署"
echo "   • 更快的全球访问速度"
echo "   • 自动 SSL 证书"
echo "   • PR 预览功能"