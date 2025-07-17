# 🔍 Hugo 站点内容不显示 - 调试指南

## 常见原因

### 1. **Front Matter 格式问题** ⚠️
**问题**：标题包含特殊字符
```yaml
title: "# AI洞察日报 2025/7/16"  # ❌ 包含 # 符号
title: "AI洞察日报 2025/7/16"     # ✅ 正确格式
```

### 2. **目录结构问题**
确保文件在正确位置：
- ✅ `content/daily/2025-07-16.md`
- ❌ `daily/2025-07-16.md` (Hugo 不会读取)

### 3. **主题配置问题**
当前配置禁用了主题：
```toml
# theme = 'hextra'  # 被注释掉了
```

如果自定义布局不完整，可能导致内容不显示。

### 4. **构建命令问题**
确保 Cloudflare Pages 运行了同步脚本：
```bash
bash scripts/sync-daily-to-hugo.sh && hugo --minify
```

## 立即修复步骤

### 1️⃣ 本地测试
```bash
# 运行测试脚本
./scripts/test-hugo-build.sh

# 查看是否有错误
hugo server -D --verbose
```

### 2️⃣ 检查 Cloudflare Pages 日志
1. 登录 Cloudflare Dashboard
2. Pages → 您的项目 → 查看构建日志
3. 查找错误信息

### 3️⃣ 验证文件格式
```bash
# 检查 front matter
head -n 15 content/daily/2025-07-16.md

# 确保标题没有特殊字符
grep "title:" content/daily/*.md
```

### 4️⃣ 临时启用主题
编辑 `hugo.toml`：
```toml
theme = 'hextra'  # 取消注释
```

## 调试检查清单

- [ ] Front matter 格式正确（无特殊字符）
- [ ] 文件在 `content/daily/` 目录
- [ ] 同步脚本正常运行
- [ ] Hugo 构建无错误
- [ ] baseURL 配置正确
- [ ] 主题文件存在

## 快速修复命令

```bash
# 1. 清理并重新同步
rm -rf content/daily/*.md
bash scripts/sync-daily-to-hugo.sh

# 2. 本地构建测试
hugo --verbose

# 3. 检查输出
ls -la public/daily/

# 4. 推送修复
git add .
git commit -m "修复 Hugo front matter 格式问题"
git push
```

## 如果还是不行

1. **查看 Cloudflare Pages 环境变量**
   - 确保 `HUGO_VERSION = 0.147.9`

2. **尝试简单的测试文件**
   创建 `content/test.md`：
   ```markdown
   ---
   title: "测试页面"
   date: 2025-07-16
   ---
   
   测试内容
   ```

3. **检查 404 页面**
   访问 `https://bubblenews.today/404.html` 看是否有样式