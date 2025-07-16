# 🔐 环境变量配置指南

本指南说明如何安全地配置 API 密钥和其他敏感信息。

## 📋 配置方式

### 1️⃣ 本地开发环境

#### 使用 `.dev.vars` 文件（推荐）

1. **复制示例文件**
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **编辑 `.dev.vars` 文件**
   ```bash
   # 编辑文件并填入实际的 API 密钥
   nano .dev.vars
   ```

3. **填入您的密钥**
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key
   GITHUB_TOKEN=ghp_your_actual_github_token
   LOGIN_PASSWORD=your_secure_password
   ```

4. **启动开发服务器**
   ```bash
   wrangler dev
   # Wrangler 会自动加载 .dev.vars 文件
   ```

### 2️⃣ 生产环境（Cloudflare Dashboard）

#### 在 Cloudflare Workers 中设置

1. **登录 Cloudflare Dashboard**
   - 访问 [dash.cloudflare.com](https://dash.cloudflare.com/)
   - 进入 Workers & Pages → 选择您的项目

2. **添加环境变量**
   - 点击 **Settings** → **Variables**
   - 点击 **Add variable**
   - 添加以下变量：

   | 变量名 | 说明 | 示例值 |
   |--------|------|--------|
   | `GEMINI_API_KEY` | Google Gemini API 密钥 | `AIza...` |
   | `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_...` |
   | `LOGIN_USERNAME` | 管理界面用户名 | `admin` |
   | `LOGIN_PASSWORD` | 管理界面密码 | `secure_password` |

3. **保存并部署**
   - 点击 **Save and deploy**
   - 变量会加密存储

### 3️⃣ 使用 Wrangler CLI 设置（可选）

```bash
# 设置单个变量
wrangler secret put GEMINI_API_KEY
# 输入密钥值（不会显示在屏幕上）

# 批量设置
wrangler secret put GITHUB_TOKEN
wrangler secret put LOGIN_PASSWORD
```

## 🔍 验证配置

### 本地测试
```bash
# 启动开发服务器
wrangler dev

# 访问管理界面
open http://localhost:8787/getContentHtml
```

### 生产环境测试
- 访问您的 Workers 域名
- 使用配置的用户名密码登录

## 📝 需要配置的变量

### 必需变量
- `GEMINI_API_KEY` - AI 内容生成
- `GITHUB_TOKEN` - 推送到 GitHub
- `LOGIN_PASSWORD` - 管理界面密码

### 可选变量
- `OPENAI_API_KEY` - 如果使用 OpenAI/DeepSeek
- `FOLO_COOKIE` - 如果使用 Folo 数据源
- `LOGIN_USERNAME` - 默认为 "root"

## 🚨 安全提醒

1. **永远不要**将密钥提交到 Git
2. **确保** `.dev.vars` 在 `.gitignore` 中
3. **定期**轮换您的 API 密钥
4. **使用**强密码保护管理界面

## 🆘 故障排查

### 问题：API 调用失败
- 检查环境变量是否正确设置
- 验证 API 密钥是否有效
- 查看 `wrangler tail` 日志

### 问题：无法登录管理界面
- 确认用户名密码正确
- 检查是否在生产环境设置了变量

### 问题：GitHub 推送失败
- 验证 GitHub Token 权限（需要 repo 权限）
- 检查仓库名称是否正确

## 📊 环境变量清单

- [ ] 创建 `.dev.vars` 文件（本地）
- [ ] 设置 `GEMINI_API_KEY`
- [ ] 设置 `GITHUB_TOKEN`
- [ ] 设置 `LOGIN_PASSWORD`
- [ ] 在 Cloudflare Dashboard 配置生产环境变量
- [ ] 测试本地开发环境
- [ ] 测试生产环境