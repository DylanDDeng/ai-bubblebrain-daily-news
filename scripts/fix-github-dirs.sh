#!/bin/bash

echo "🔧 修复 GitHub 目录结构"
echo "======================="
echo ""

# 创建必要的目录和占位文件
mkdir -p content/daily
mkdir -p daily
mkdir -p podcast

# 创建 .gitkeep 文件以确保目录被提交
touch content/daily/.gitkeep
touch daily/.gitkeep
touch podcast/.gitkeep

# 创建 README 说明文件
cat > content/README.md << 'EOF'
# Content Directory

This directory contains Hugo-formatted content with front matter.

- `daily/` - Daily AI insights with Hugo front matter
EOF

# 提交更改
git add content/
git add daily/.gitkeep podcast/.gitkeep

git commit -m "创建必要的目录结构 for CloudFlare Worker

- content/daily/ - Hugo formatted daily reports
- daily/ - Raw daily reports
- podcast/ - Podcast scripts"

echo ""
echo "✅ 目录结构已创建"
echo ""
echo "📤 推送到 GitHub："
echo "git push origin main"
echo ""
echo "推送后，CloudFlare Worker 就能正常保存文件了！"