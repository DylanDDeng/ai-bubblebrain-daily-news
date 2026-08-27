# Hugo 集成说明

本项目已集成 Hugo 静态站点生成器，可以将每日 AI 洞察内容以更美观的方式展示。

## 快速开始

### 1. 安装 Hugo

```bash
# macOS
brew install hugo

# Windows (使用 Chocolatey)
choco install hugo-extended

# Linux
snap install hugo
```

### 2. 本地预览

```bash
# 同步每日内容到 Hugo
bash scripts/sync-daily-to-hugo.sh

# 启动 Hugo 开发服务器
hugo server -D

# 访问 http://localhost:1313 查看效果
```

### 3. 构建静态站点

```bash
# 构建站点（输出到 public/ 目录）
hugo --minify
```

## 项目结构

```
.
├── content/          # Hugo 内容目录
│   ├── _index.md    # 主页内容
│   └── daily/       # 每日洞察内容
├── layouts/         # 自定义布局模板
│   └── daily/       # 日报专用模板
├── static/          # 静态资源
├── themes/          # Hugo 主题
│   └── hextra/      # Hextra 主题
├── hugo.toml        # Hugo 配置文件
└── scripts/         # 辅助脚本
    └── sync-daily-to-hugo.sh  # 同步脚本
```

## 工作流程

1. **内容生成**：Cloudflare Worker 生成的日报保存在 `daily/` 目录
2. **内容同步**：运行同步脚本将内容复制到 Hugo 的 `content/daily/` 目录，并添加必要的 front matter
3. **站点构建**：Hugo 读取内容并生成静态网站
4. **自动部署**：GitHub Actions 自动构建并部署到 GitHub Pages

## 自定义配置

### 修改站点信息

编辑 `hugo.toml` 文件：

```toml
baseURL = 'https://your-domain.com/'  # 你的域名
title = 'Bubble's Brain'                   # 站点标题
```

### 修改主题样式

- 自定义布局：编辑 `layouts/` 目录下的模板文件
- 主题配置：查看 `themes/hextra/` 目录了解更多主题选项

### 添加新内容

1. 在 `content/` 目录下创建新的 markdown 文件
2. 添加 Hugo front matter（标题、日期、标签等）
3. 编写内容

## GitHub Actions 集成

项目包含自动化构建和部署工作流程（`.github/workflows/build-and-deploy.yml`）：

- 每日定时构建（北京时间上午 10 点）
- 推送到 main 分支时自动构建
- 同时构建 mdBook 和 Hugo（保持向后兼容）
- 自动部署到 GitHub Pages

## 注意事项

1. **兼容性**：项目同时支持 mdBook 和 Hugo，确保平滑过渡
2. **主题更新**：Hextra 主题作为 git submodule 管理，使用 `git submodule update --remote` 更新
3. **内容格式**：确保 markdown 文件符合 Hugo 的 front matter 格式要求

## 故障排查

### Hugo 构建失败

1. 检查 markdown 文件的 front matter 格式是否正确
2. 确保日期格式为 `YYYY-MM-DD`
3. 运行 `hugo --verbose` 查看详细错误信息

### 主题问题

1. 确保已正确初始化 git submodules：`git submodule init && git submodule update`
2. 检查 `hugo.toml` 中的主题名称是否正确

### 内容不显示

1. 运行同步脚本：`bash scripts/sync-daily-to-hugo.sh`
2. 检查 `content/daily/` 目录是否有文件
3. 确保文件名格式为 `YYYY-MM-DD.md`