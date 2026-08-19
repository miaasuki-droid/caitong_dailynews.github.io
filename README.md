# WSCN Today · GitHub Pages

一个不需要自建服务器的静态网站：

- 抓取 `https://wallstreetcn.com/live/global` 对应的「今日全球/要闻」快讯
- GitHub Actions 每 10 分钟抓取一次
- GitHub Pages 直接发布
- 网页支持关键词搜索、重要性筛选、复制当前结果
- 全部时间按北京时间（UTC+8）处理
- 不需要数据库，不需要 API Key

## 项目结构

```text
.
├─ .github/workflows/pages.yml   # 定时抓取 + 自动部署
├─ scripts/fetch_wscn.py         # 抓取脚本
└─ site/
   ├─ index.html
   ├─ styles.css
   ├─ app.js
   ├─ .nojekyll
   └─ data/latest.json
```

## 最简单的部署方法

### 1. 新建 GitHub 仓库

如果你希望网址就是：

```text
https://你的GitHub用户名.github.io/
```

仓库名必须写成：

```text
你的GitHub用户名.github.io
```

例如 GitHub 用户名是 `miaa123`，仓库名就是：

```text
miaa123.github.io
```

仓库设为 **Public**。

### 2. 把本项目全部文件上传到仓库根目录

一定要保留：

```text
.github/workflows/pages.yml
```

然后提交到 `main` 分支。

### 3. 打开 GitHub Pages

进入：

```text
Repository → Settings → Pages
```

在 **Build and deployment → Source** 选择：

```text
GitHub Actions
```

### 4. 手动跑第一次

进入：

```text
Repository → Actions → Refresh WSCN Today → Run workflow
```

成功后即可打开：

```text
https://你的GitHub用户名.github.io/
```

以后会每 10 分钟自动更新一次。

## 修改刷新频率

文件：

```text
.github/workflows/pages.yml
```

当前：

```yaml
- cron: "3,13,23,33,43,53 * * * *"
```

代表大约每 10 分钟执行一次。

GitHub Actions 的 schedule 不是严格实时任务，在平台繁忙时可能延迟。

## 本地预览

先抓一次数据：

```bash
python scripts/fetch_wscn.py
```

再启动本地静态服务器：

```bash
python -m http.server 8000 -d site
```

浏览器打开：

```text
http://localhost:8000
```

## 数据来源和注意事项

抓取脚本使用华尔街见闻网页前端当前使用的内部接口：

```text
https://api-one.wallstcn.com/apiv1/content/lives
```

频道：

```text
global-channel
```

该接口不是公开承诺长期兼容的官方 API，因此未来如果华尔街见闻改版，可能需要调整 `scripts/fetch_wscn.py`。

本项目适合作为个人信息整理工具。内容版权归原始来源所有。
