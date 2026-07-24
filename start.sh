#!/bin/bash

# Bubble's Brain 阅读手册快速启动脚本

echo "🚀 Bubble's Brain 阅读手册 - 快速启动"
echo "========================="
echo ""

# 显示菜单
echo "请选择操作："
echo "1) 启动 CloudFlare Worker (抓取新闻)"
echo "2) 启动 Astro 本地预览"
echo "3) 从远程仓库拉取历史内容"
echo "4) 构建 Astro 站点"
echo "0) 退出"
echo ""

read -p "请输入选项 [0-4]: " choice

case $choice in
    1)
        echo "🌐 启动 CloudFlare Worker..."
        echo "提示：访问 http://localhost:8787/getContentHtml 管理内容"
        wrangler dev
        ;;
    2)
        echo "📖 启动 Astro 预览服务器..."
        echo "提示：访问 http://localhost:4321 查看站点"
        npm run dev --prefix astro
        ;;
    3)
        echo "📥 从远程仓库拉取内容..."
        bash scripts/pull-daily-content.sh
        ;;
    4)
        echo "🏗️  构建 Astro 站点..."
        npm run build --prefix astro
        echo "✅ 构建完成！输出目录：astro/dist/"
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
