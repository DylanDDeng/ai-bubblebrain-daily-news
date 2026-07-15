#!/bin/bash

echo "🔐 环境变量配置助手"
echo "==================="
echo ""

# 检查是否存在 .dev.vars
if [ -f ".dev.vars" ]; then
    echo "✅ 已找到 .dev.vars 文件"
    echo ""
    read -p "是否要重新配置？(y/n): " RECONFIGURE
    if [ "$RECONFIGURE" != "y" ] && [ "$RECONFIGURE" != "Y" ]; then
        echo "保持现有配置"
        exit 0
    fi
else
    echo "📝 创建新的 .dev.vars 文件..."
    cp .dev.vars.example .dev.vars
fi

echo ""
echo "请输入您的 API 密钥和配置："
echo ""

# Gemini API Key
read -p "Gemini API Key (留空跳过): " GEMINI_KEY
if [ ! -z "$GEMINI_KEY" ]; then
    sed -i.bak "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=$GEMINI_KEY/" .dev.vars
fi

# GitHub Token
read -p "GitHub Token (ghp_...): " GITHUB_TOKEN
if [ ! -z "$GITHUB_TOKEN" ]; then
    sed -i.bak "s/GITHUB_TOKEN=.*/GITHUB_TOKEN=$GITHUB_TOKEN/" .dev.vars
fi

# 登录密码
read -p "管理界面用户名: " LOGIN_USER
if [ ! -z "$LOGIN_USER" ]; then
    sed -i.bak "s/LOGIN_USERNAME_SECRET=.*/LOGIN_USERNAME_SECRET=$LOGIN_USER/" .dev.vars
fi

read -s -p "管理界面密码: " LOGIN_PASS
echo ""
if [ ! -z "$LOGIN_PASS" ]; then
    sed -i.bak "s/LOGIN_PASSWORD_SECRET=.*/LOGIN_PASSWORD_SECRET=$LOGIN_PASS/" .dev.vars
fi

# 管理 API Token
ADMIN_TOKEN=$(openssl rand -hex 32)
sed -i.bak "s/ADMIN_API_TOKEN=.*/ADMIN_API_TOKEN=$ADMIN_TOKEN/" .dev.vars

# 清理备份文件
rm -f .dev.vars.bak

echo ""
echo "✅ 配置完成！"
echo ""
echo "📌 下一步："
echo "1. 本地开发：wrangler dev"
echo "2. 生产环境：在 Cloudflare Dashboard 设置相同的变量"
echo ""
echo "🔒 安全提醒：.dev.vars 文件包含敏感信息，不要提交到 Git！"
