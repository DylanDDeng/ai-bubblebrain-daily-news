#!/bin/bash

# Bubble's Brain 阅读手册快速启动脚本

echo "🚀 Bubble's Brain 阅读手册 - 快速启动"
echo "========================="
echo ""

# 显示菜单
echo "请选择操作："
echo "1) 启动 CloudFlare Worker (抓取新闻)"
echo "2) 启动 Hugo 本地预览"
echo "3) 从远程仓库拉取历史内容"
echo "4) 同步本地内容到 Hugo"
echo "5) 构建 Hugo 站点"
echo "6) 一键启动 (Worker + Hugo)"
echo "0) 退出"
echo ""

read -p "请输入选项 [0-6]: " choice

case $choice in
    1)
        echo "🌐 启动 CloudFlare Worker..."
        echo "提示：访问 http://localhost:8787/getContentHtml 管理内容"
        wrangler dev
        ;;
    2)
        echo "📖 启动 Hugo 预览服务器..."
        echo "提示：访问 http://localhost:1313 查看站点"
        hugo server -D
        ;;
    3)
        echo "📥 从远程仓库拉取内容..."
        bash scripts/pull-daily-content.sh
        ;;
    4)
        echo "🔄 同步内容到 Hugo..."
        bash scripts/sync-daily-to-hugo.sh
        ;;
    5)
        echo "🏗️  构建 Hugo 站点..."
        hugo --minify
        echo "✅ 构建完成！输出目录：public/"
        ;;
    6)
        echo "🎯 一键启动模式"
        echo "1️⃣ 同步现有内容..."
        bash scripts/sync-daily-to-hugo.sh
        
        echo "2️⃣ 在新终端启动 Hugo..."
        osascript -e 'tell app "Terminal" to do script "cd \"'$(pwd)'\" && hugo server -D"' 2>/dev/null || {
            echo "请手动在新终端运行: hugo server -D"
        }
        
        sleep 2
        echo "3️⃣ 启动 CloudFlare Worker..."
        echo ""
        echo "📌 重要提示："
        echo "- Worker: http://localhost:8787/getContentHtml"
        echo "- Hugo: http://localhost:1313"
        echo "- 用户名: root / 密码: toor"
        echo ""
        wrangler dev
        ;;
    0)
        echo "👋 再见！"
        exit 0
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac