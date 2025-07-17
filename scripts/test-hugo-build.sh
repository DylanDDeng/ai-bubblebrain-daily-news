#!/bin/bash

echo "🧪 测试 Hugo 构建"
echo "=================="
echo ""

# 清理并重新同步
echo "1️⃣ 清理 content/daily 目录..."
rm -rf content/daily/*.md
echo ""

echo "2️⃣ 运行同步脚本..."
bash scripts/sync-daily-to-hugo.sh
echo ""

echo "3️⃣ 检查生成的文件..."
echo "content/daily/ 中的文件："
ls -la content/daily/
echo ""

# 检查 front matter
if [ -f "content/daily/2025-07-16.md" ]; then
    echo "4️⃣ 检查 front matter："
    head -n 15 content/daily/2025-07-16.md
    echo ""
fi

echo "5️⃣ 构建 Hugo..."
hugo --verbose

echo ""
echo "6️⃣ 检查输出..."
if [ -d "public" ]; then
    echo "public/ 目录内容："
    ls -la public/
    echo ""
    if [ -d "public/daily" ]; then
        echo "public/daily/ 目录内容："
        ls -la public/daily/
    fi
else
    echo "❌ 没有找到 public 目录！"
fi

echo ""
echo "7️⃣ 启动本地服务器测试..."
echo "运行: hugo server -D"
echo "然后访问: http://localhost:1313"