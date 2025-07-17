#!/bin/bash

echo "🧪 测试未来日期内容构建"
echo "======================"
echo ""

# 显示当前时间
echo "📅 当前时间："
date "+%Y-%m-%d %H:%M:%S %z"
echo ""

# 检查文件
echo "📁 检查 content/daily/ 目录："
ls -la content/daily/*.md
echo ""

# 测试不同的构建方式
echo "1️⃣ 默认构建（不包含未来内容）："
hugo list all | grep -E "daily.*2025-07-1[67]" || echo "没有找到相关内容"
echo ""

echo "2️⃣ 使用 buildFuture 构建："
hugo list all --buildFuture | grep -E "daily.*2025-07-1[67]"
echo ""

echo "3️⃣ 构建站点："
rm -rf public/
hugo --buildFuture
echo ""

echo "4️⃣ 检查生成的文件："
if [ -d "public/daily/2025/07" ]; then
    echo "生成的日报文件："
    ls -la public/daily/2025/07/
else
    echo "❌ 没有找到生成的目录"
fi
echo ""

echo "5️⃣ 检查各文件的日期设置："
for file in content/daily/2025-07-*.md; do
    if [ -f "$file" ]; then
        echo "📄 $(basename $file):"
        grep "^date:" "$file"
    fi
done