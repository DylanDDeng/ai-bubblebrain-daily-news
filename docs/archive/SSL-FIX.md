# 🔧 修复 SSL_VERSION_OR_CIPHER_MISMATCH 错误

## 快速解决方案

### 1. Cloudflare SSL 设置（最重要！）
- 登录 Cloudflare Dashboard
- SSL/TLS → Overview
- **必须选择 "Full"** （不是 "Full (strict)"）
- 原因：GitHub Pages 为 *.github.io 提供 SSL，但不为自定义域名提供严格的 SSL 证书

### 2. 检查 DNS 记录
运行诊断脚本：
```bash
./scripts/check-dns.sh
```

### 3. 验证 GitHub 配置
- 确保仓库 Settings → Pages → Custom domain 已设置为 `bubblenews.today`
- 确保 `static/CNAME` 文件内容为 `bubblenews.today`

### 4. 清除缓存
在 Cloudflare：
- Caching → Configuration → Purge Everything

### 5. 等待时间
- SSL 设置更改：立即生效
- DNS 传播：5-30 分钟
- GitHub Pages SSL 证书：最多 24 小时

## 如果仍有问题

### 临时解决方案
1. 在 Cloudflare 暂时关闭代理（灰色云朵）
2. 直接访问测试：`https://DylanDDeng.github.io/ai-bubblebrain-daily-news/`
3. 如果直连正常，说明是 Cloudflare 配置问题

### 备选方案
考虑使用 Cloudflare Pages 部署：
1. 在 Cloudflare Dashboard 创建 Pages 项目
2. 连接 GitHub 仓库
3. 自动获得 SSL 证书和更好的性能

## 常见错误原因
- ❌ SSL 模式设置为 "Full (strict)" 或 "Flexible"
- ❌ DNS 记录未正确指向 GitHub Pages
- ❌ CNAME 文件缺失或内容错误
- ❌ GitHub Pages 还在生成 SSL 证书

## 成功标志
- ✅ 可以访问 https://bubblenews.today
- ✅ 浏览器显示安全连接（锁图标）
- ✅ 网站正常加载内容