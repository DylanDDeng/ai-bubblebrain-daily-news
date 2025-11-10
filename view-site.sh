#!/bin/bash

# 快速查看站点脚本

echo "🚀 启动 Bubble's Brain 阅读手册 Hugo 站点..."
echo ""

# 检查是否有内容需要同步
if [ -d "daily" ] && [ "$(ls -A daily/*.md 2>/dev/null)" ]; then
    echo "🔄 同步最新内容..."
    bash scripts/sync-daily-to-hugo.sh
fi

# 尝试关闭占用端口的进程
lsof -ti:1313 | xargs kill -9 2>/dev/null || true

echo ""
echo "📖 启动 Hugo 预览服务器..."
echo "🌐 访问地址: http://localhost:1313"
echo ""
echo "📌 当前日报："
ls -1 content/daily/*.md | grep -v _index.md | sed 's/content\/daily\//  - /' | sed 's/\.md$//'
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动 Hugo
hugo server -D