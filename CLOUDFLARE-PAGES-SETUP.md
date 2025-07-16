# 🚀 迁移到 Cloudflare Pages

使用 Cloudflare Pages 部署 Hugo 站点，比 GitHub Pages 更简单、更快速！

## ✨ 优势

- ✅ **原生支持 Hugo** - 自动检测并构建
- ✅ **自动 SSL** - 无需额外配置
- ✅ **更快的构建** - 全球边缘网络
- ✅ **预览部署** - 每个 PR 都有预览链接
- ✅ **简化的 DNS** - 自动配置

## 📋 快速设置步骤

### 1️⃣ 创建 Cloudflare Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击 **Workers & Pages** → **Create application** → **Pages**
3. 选择 **Connect to Git**
4. 授权 GitHub 并选择仓库：
   - 选择 `justlovemaki/CloudFlare-AI-Insight-Daily`（当前仓库）
   - 或 `DylanDDeng/ai-bubblebrain-daily-news`（如果要用那个）

### 2️⃣ 配置构建设置

在创建项目时，使用以下设置：

```
项目名称: ai-daily（或您喜欢的名称）
生产分支: main
构建命令: hugo --minify
构建输出目录: public
环境变量:
  HUGO_VERSION: 0.147.9
```

### 3️⃣ 部署

点击 **Save and Deploy**，Cloudflare 会自动：
- 克隆您的仓库
- 安装 Hugo
- 运行构建命令
- 部署到全球 CDN

### 4️⃣ 配置自定义域名

部署成功后：

1. 在 Pages 项目设置中，点击 **Custom domains**
2. 添加 `bubblenews.today`
3. Cloudflare 会自动更新 DNS 记录

### 5️⃣ 删除旧的 DNS 记录

在 DNS 设置中：
1. **删除**所有指向 GitHub Pages 的 A 记录（185.199.x.x）
2. Cloudflare Pages 会自动添加正确的 CNAME 记录

## 🛠️ 项目配置

### 已创建的配置文件

**cloudflare-pages.toml**（可选，Cloudflare 会自动检测 Hugo）
```toml
[build]
  command = "hugo --minify"
  publish = "public"

[build.environment]
  HUGO_VERSION = "0.147.9"
```

### 删除不需要的文件

由于使用 Cloudflare Pages，可以删除：
- `.github/workflows/build-and-deploy.yml`（GitHub Actions 不再需要）
- `static/CNAME`（Cloudflare Pages 不需要）

```bash
rm .github/workflows/build-and-deploy.yml
rm static/CNAME
```

## 🔄 工作流程变化

### 之前（GitHub Pages）
```
推送代码 → GitHub Actions 构建 → 部署到 gh-pages → GitHub Pages 服务
```

### 现在（Cloudflare Pages）
```
推送代码 → Cloudflare 自动构建 → 部署到全球 CDN
```

## 🎯 完成后

- 主域名：`https://bubblenews.today`
- Cloudflare 提供的域名：`https://ai-daily.pages.dev`
- 每个 PR 的预览：`https://<pr-number>.ai-daily.pages.dev`

## ⚡ 性能优化

Cloudflare Pages 自动提供：
- 全球 CDN 加速
- HTTP/3 支持
- 自动图片优化
- Brotli 压缩

## 🆘 故障排查

### 构建失败？
检查构建日志中的 Hugo 版本是否正确

### 404 错误？
确保 `hugo.toml` 中的 `baseURL` 设置正确：
```toml
baseURL = 'https://bubblenews.today/'
```

### DNS 问题？
等待 5-10 分钟让 DNS 更新完成

## 📊 迁移检查清单

- [ ] 在 Cloudflare Pages 创建项目
- [ ] 连接 GitHub 仓库
- [ ] 配置构建设置
- [ ] 添加自定义域名
- [ ] 删除旧的 A 记录
- [ ] 测试网站访问
- [ ] 删除不需要的 GitHub Actions 文件