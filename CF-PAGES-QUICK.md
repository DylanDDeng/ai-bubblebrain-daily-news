# 🚀 Cloudflare Pages 5分钟快速部署

## 为什么选择 Cloudflare Pages？
- ✅ 无需配置 SSL（自动处理）
- ✅ 无需管理 DNS A 记录
- ✅ 构建更快，部署更简单
- ✅ 自动 PR 预览

## 快速步骤

### 1️⃣ 创建项目（2分钟）
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 选择您的仓库

### 2️⃣ 配置构建（1分钟）
```
项目名称: ai-daily
构建命令: hugo --minify
输出目录: public
环境变量: HUGO_VERSION = 0.147.9
```

### 3️⃣ 部署（自动）
点击 **Save and Deploy** - 等待构建完成

### 4️⃣ 添加域名（1分钟）
1. 项目设置 → **Custom domains**
2. 添加 `bubblenews.today`
3. 完成！

### 5️⃣ 清理 DNS（1分钟）
删除所有 A 记录（185.199.x.x）

## ✨ 完成！
您的网站现在由 Cloudflare Pages 托管，享受：
- 🚀 全球 CDN 加速
- 🔒 自动 SSL 证书
- 📱 自动移动优化
- ⚡ HTTP/3 支持

## 🆘 遇到问题？
运行诊断脚本：
```bash
./scripts/migrate-to-cf-pages.sh
```