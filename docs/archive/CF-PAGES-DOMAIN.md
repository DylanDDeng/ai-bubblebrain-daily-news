# 🌐 Cloudflare Pages 自定义域名配置

## 步骤说明

### 1. 在 Pages 项目中添加域名

1. 访问您的 Pages 项目：[ai-bubblebrain-daily-news](https://dash.cloudflare.com/pages/ai-bubblebrain-daily-news)
2. 在项目概览页面，找到 **Custom domains** 部分
3. 点击 **Set up a custom domain** 按钮
4. 输入域名：`bubblenews.today`
5. 点击 **Continue**

### 2. 选择域名配置方式

由于您的域名已经在 Cloudflare 管理，系统会显示：
- "This domain is already configured in Cloudflare"
- 选择 **Activate domain**

### 3. 自动 DNS 更新

Cloudflare 会自动：
- 删除冲突的 A 记录
- 添加正确的 CNAME 记录指向 Pages
- 配置 SSL 证书

### 4. 等待激活

- 域名激活：1-2 分钟
- SSL 证书：自动配置，立即生效
- DNS 传播：5-10 分钟

## 验证配置

```bash
# 检查 DNS
dig bubblenews.today

# 检查 HTTPS
curl -I https://bubblenews.today

# 应该看到状态码 200 而不是 404
```

## 最终配置

添加域名后，您可以通过以下地址访问：
- 主域名：https://bubblenews.today
- www 域名：https://www.bubblenews.today
- Pages 域名：https://ai-bubblebrain-daily-news.pages.dev

## 常见问题

### Q: 需要手动删除 A 记录吗？
A: 不需要，Cloudflare Pages 会自动处理

### Q: SSL 证书需要配置吗？
A: 不需要，自动提供并配置

### Q: 如果显示 "Domain is not available"？
A: 检查域名是否在同一个 Cloudflare 账户下

## 成功标志

✅ Custom domains 显示 "Active"
✅ 可以访问 https://bubblenews.today
✅ SSL 证书正常（浏览器显示锁图标）
✅ 内容正确显示（不是 404）