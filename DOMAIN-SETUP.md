# 🌐 Cloudflare 自定义域名配置指南

本指南将帮助您为 AI 洞察日报配置 Cloudflare 自定义域名。

## 📋 配置步骤

### 步骤 1: 在 Cloudflare 购买域名

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧菜单的 "Domain Registration" → "Register Domain"
3. 搜索您想要的域名（建议）：
   - `ai-insights.com`
   - `ai-daily.com`
   - `aizhixun.com`
   - 或其他您喜欢的域名
4. 选择域名并完成购买流程

### 步骤 2: 更新项目配置

#### 2.1 更新 CNAME 文件

```bash
# 编辑 static/CNAME 文件，替换为您的域名
echo "your-domain.com" > static/CNAME
```

#### 2.2 更新 Hugo 配置

编辑 `hugo.toml` 文件：

```toml
baseURL = 'https://your-domain.com/'  # 替换为您的域名
```

#### 2.3 提交更改

```bash
git add .
git commit -m "配置自定义域名"
git push origin main
```

### 步骤 3: 配置 Cloudflare DNS

1. 在 Cloudflare Dashboard 中，选择您的域名
2. 进入 "DNS" → "Records"
3. 添加以下 DNS 记录：

#### 方式一：使用 CNAME 记录（推荐）

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| CNAME | @ | `chengshengdeng.github.io` | Proxied (🟠) | Auto |
| CNAME | www | `chengshengdeng.github.io` | Proxied (🟠) | Auto |

#### 方式二：使用 A 记录

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| A | @ | 185.199.108.153 | Proxied (🟠) | Auto |
| A | @ | 185.199.109.153 | Proxied (🟠) | Auto |
| A | @ | 185.199.110.153 | Proxied (🟠) | Auto |
| A | @ | 185.199.111.153 | Proxied (🟠) | Auto |
| CNAME | www | `your-domain.com` | Proxied (🟠) | Auto |

### 步骤 4: 配置 GitHub Pages

1. 进入您的 GitHub 仓库设置
2. 找到 "Settings" → "Pages"
3. 在 "Custom domain" 栏输入您的域名
4. 点击 "Save"
5. 等待 DNS 检查完成（可能需要几分钟）

### 步骤 5: 配置 Cloudflare SSL/TLS

1. 在 Cloudflare Dashboard 中，进入 "SSL/TLS" → "Overview"
2. 选择加密模式为 "Full" 或 "Full (strict)"
3. 确保 "Always Use HTTPS" 已启用

### 步骤 6: 配置页面规则（可选）

在 Cloudflare 中创建页面规则以优化性能：

1. 进入 "Rules" → "Page Rules"
2. 创建新规则：
   - URL: `*your-domain.com/*`
   - 设置：
     - Cache Level: Cache Everything
     - Edge Cache TTL: 1 month
     - Browser Cache TTL: 1 month

## 🔍 验证配置

### 检查 DNS 解析

```bash
# 检查域名解析
dig your-domain.com
nslookup your-domain.com
```

### 测试访问

1. 等待 DNS 传播（5-30 分钟）
2. 访问您的域名：
   - `https://your-domain.com`
   - `https://www.your-domain.com`

## 🛠️ 故障排查

### 问题 1: GitHub Pages 显示 404

**解决方案**：
- 确保 `static/CNAME` 文件存在且内容正确
- 检查 GitHub Actions 是否成功运行
- 在 GitHub 仓库设置中重新输入自定义域名

### 问题 2: SSL 证书错误

**解决方案**：
- 在 Cloudflare 中将 SSL/TLS 模式设置为 "Full"
- 等待 GitHub Pages 生成 SSL 证书（最多 24 小时）
- 确保 Cloudflare 的 "Always Use HTTPS" 已启用

### 问题 3: 域名无法访问

**解决方案**：
- 检查 DNS 记录是否正确配置
- 确认域名状态为 "Active"
- 清除浏览器缓存和 DNS 缓存

## 📊 配置检查清单

- [ ] 购买域名并激活
- [ ] 更新 `static/CNAME` 文件
- [ ] 更新 `hugo.toml` 中的 baseURL
- [ ] 推送更改到 GitHub
- [ ] 配置 Cloudflare DNS 记录
- [ ] 在 GitHub Pages 设置自定义域名
- [ ] 配置 SSL/TLS 设置
- [ ] 测试 HTTPS 访问
- [ ] 设置页面规则（可选）

## 🎉 完成！

配置完成后，您的 AI 洞察日报将通过自定义域名访问，享受 Cloudflare 的全球 CDN 加速和安全防护。

## 📌 后续维护

- 定期检查域名续费状态
- 监控网站访问速度和可用性
- 利用 Cloudflare Analytics 查看访问统计
- 根据需要调整缓存规则