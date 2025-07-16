#!/bin/bash

# DNS 检查脚本

DOMAIN="bubblenews.today"

echo "🔍 检查 DNS 配置 - $DOMAIN"
echo "================================"
echo ""

# 检查 A 记录
echo "📍 A 记录检查："
dig +short A $DOMAIN
echo ""

# 检查 CNAME 记录
echo "📍 CNAME 记录检查："
dig +short CNAME $DOMAIN
echo ""

# 检查 DNS 解析
echo "📍 完整 DNS 信息："
nslookup $DOMAIN
echo ""

# 检查 SSL 证书
echo "🔐 SSL 证书检查："
echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -issuer -subject -dates 2>/dev/null || echo "无法获取 SSL 证书信息"
echo ""

# 检查 HTTP 响应
echo "🌐 HTTP 响应检查："
curl -I https://$DOMAIN 2>/dev/null | head -n 5 || echo "无法连接到 HTTPS"
echo ""

# 检查 GitHub Pages 状态
echo "📊 GitHub Pages 检查："
GITHUB_USER="DylanDDeng"
GITHUB_REPO="ai-bubblebrain-daily-news"
curl -s https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO/pages | jq '.status, .cname' 2>/dev/null || echo "无法获取 GitHub Pages 状态"
echo ""

echo "✅ 检查完成！"
echo ""
echo "💡 提示："
echo "1. 确保 Cloudflare SSL/TLS 设置为 'Full'"
echo "2. 确保 DNS 记录已正确配置"
echo "3. 等待 DNS 传播（可能需要 5-30 分钟）"