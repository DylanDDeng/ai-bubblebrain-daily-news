# 🚀 Cloudflare 域名配置快速指南

## 📋 5分钟快速配置

### 1️⃣ 购买域名
在 [Cloudflare](https://dash.cloudflare.com/) → Domain Registration → Register Domain

### 2️⃣ 运行配置脚本
```bash
./scripts/setup-domain.sh
# 输入您的域名，脚本会自动更新配置
```

### 3️⃣ 提交更改
```bash
git add .
git commit -m "配置自定义域名"
git push origin main
```

### 4️⃣ 配置 DNS（在 Cloudflare Dashboard）

**添加 CNAME 记录：**
- Type: `CNAME`, Name: `@`, Content: `chengshengdeng.github.io`
- Type: `CNAME`, Name: `www`, Content: `chengshengdeng.github.io`
- 都开启 Proxy (橙色云朵)

### 5️⃣ 配置 GitHub Pages
1. 进入仓库 Settings → Pages
2. Custom domain 输入您的域名
3. 点击 Save

### 6️⃣ 设置 SSL
Cloudflare → SSL/TLS → Overview → 选择 "Full"

## ✅ 完成！
等待 5-30 分钟 DNS 生效后，访问 `https://your-domain.com`

## 🆘 遇到问题？
- 查看详细指南：[DOMAIN-SETUP.md](./DOMAIN-SETUP.md)
- 清除浏览器缓存
- 使用 `dig your-domain.com` 检查 DNS