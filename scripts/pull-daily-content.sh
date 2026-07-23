#!/bin/bash

# 从远程仓库拉取每日内容到本地
# 用于同步之前推送到 ai-bubblebrain-daily-news 仓库的内容

set -e

echo "🔄 从远程仓库拉取每日内容..."

# 临时目录
TEMP_DIR="/tmp/ai-daily-pull"
REMOTE_REPO="https://github.com/DylanDDeng/ai-bubblebrain-daily-news.git"
LOCAL_DAILY_DIR="daily"

# 保存当前目录
ORIGINAL_DIR=$(pwd)

# 清理并创建临时目录
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 克隆远程仓库（只克隆 daily 目录）
echo "📥 正在克隆远程仓库..."
git clone --depth 1 --filter=blob:none --sparse "$REMOTE_REPO" "$TEMP_DIR"
cd "$TEMP_DIR"
git sparse-checkout set daily

# 确保本地 daily 目录存在
mkdir -p "$ORIGINAL_DIR/$LOCAL_DAILY_DIR"

# 复制 daily 目录内容到本地
if [ -d "daily" ] && [ "$(ls -A daily)" ]; then
    echo "📄 找到以下日报文件："
    ls -la daily/*.md 2>/dev/null || echo "暂无 .md 文件"
    
    # 复制文件
    cp -r daily/* "$ORIGINAL_DIR/$LOCAL_DAILY_DIR/" 2>/dev/null || true
    echo "✅ 内容已复制到本地 daily 目录"
else
    echo "⚠️  远程仓库中没有找到 daily 目录或内容"
fi

# 返回原目录
cd "$ORIGINAL_DIR"

# 清理临时目录
rm -rf "$TEMP_DIR"

echo "✨ 完成！现在可以运行 'npm run dev --prefix astro' 查看内容"