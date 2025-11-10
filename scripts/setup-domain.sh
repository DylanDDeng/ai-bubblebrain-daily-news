#!/bin/bash

# 域名配置脚本

echo "🌐 Bubble's Brain 阅读手册 - 域名配置助手"
echo "================================"
echo ""

# 读取用户输入的域名
read -p "请输入您的域名（例如：ai-daily.com）: " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "❌ 错误：域名不能为空"
    exit 1
fi

echo ""
echo "您输入的域名是：$DOMAIN"
read -p "确认正确吗？(y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "已取消配置"
    exit 0
fi

echo ""
echo "📝 开始配置..."

# 1. 更新 CNAME 文件
echo "1️⃣ 更新 CNAME 文件..."
echo "$DOMAIN" > static/CNAME
echo "✅ CNAME 文件已更新"

# 2. 更新 Hugo 配置
echo "2️⃣ 更新 Hugo 配置..."
if [ -f "hugo.toml" ]; then
    # 备份原配置
    cp hugo.toml hugo.toml.bak
    # 更新 baseURL
    sed -i.tmp "s|baseURL = .*|baseURL = 'https://$DOMAIN/'|" hugo.toml
    rm hugo.toml.tmp
    echo "✅ Hugo 配置已更新"
else
    echo "❌ 错误：找不到 hugo.toml 文件"
    exit 1
fi

# 3. 显示 DNS 配置说明
echo ""
echo "3️⃣ Cloudflare DNS 配置"
echo "请在 Cloudflare Dashboard 中添加以下 DNS 记录："
echo ""
echo "📋 CNAME 记录（推荐）："
echo "┌──────┬──────┬──────────────────────────┬──────────┬──────┐"
echo "│ Type │ Name │ Content                  │ Proxy    │ TTL  │"
echo "├──────┼──────┼──────────────────────────┼──────────┼──────┤"
echo "│ CNAME│ @    │ chengshengdeng.github.io │ Proxied  │ Auto │"
echo "│ CNAME│ www  │ chengshengdeng.github.io │ Proxied  │ Auto │"
echo "└──────┴──────┴──────────────────────────┴──────────┴──────┘"
echo ""
echo "或使用 A 记录："
echo "┌──────┬──────┬─────────────────┬──────────┬──────┐"
echo "│ Type │ Name │ Content         │ Proxy    │ TTL  │"
echo "├──────┼──────┼─────────────────┼──────────┼──────┤"
echo "│ A    │ @    │ 185.199.108.153 │ Proxied  │ Auto │"
echo "│ A    │ @    │ 185.199.109.153 │ Proxied  │ Auto │"
echo "│ A    │ @    │ 185.199.110.153 │ Proxied  │ Auto │"
echo "│ A    │ @    │ 185.199.111.153 │ Proxied  │ Auto │"
echo "│ CNAME│ www  │ $DOMAIN         │ Proxied  │ Auto │"
echo "└──────┴──────┴─────────────────┴──────────┴──────┘"

# 4. 提示下一步操作
echo ""
echo "4️⃣ 下一步操作："
echo "1. 提交更改到 GitHub："
echo "   git add ."
echo "   git commit -m \"配置自定义域名: $DOMAIN\""
echo "   git push origin main"
echo ""
echo "2. 在 GitHub 仓库设置中配置自定义域名："
echo "   Settings → Pages → Custom domain → 输入: $DOMAIN"
echo ""
echo "3. 在 Cloudflare 中设置 SSL/TLS 为 'Full'"
echo ""
echo "✨ 配置完成！等待 DNS 传播后即可通过 https://$DOMAIN 访问您的站点"
echo ""
echo "📖 详细说明请查看 DOMAIN-SETUP.md 文件"