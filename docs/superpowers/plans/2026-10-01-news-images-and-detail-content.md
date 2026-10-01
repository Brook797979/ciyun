# 资讯图片与详情内容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用用户提供的三张图片统一替换资讯封面，并补齐三篇可阅读的原创陶瓷文化资讯详情。

**Architecture:** `data/news.js` 保存完整资讯内容，`data/home.js` 保存首页精简展示字段，两者共享固定图片路径与资讯标识。资讯列表继续负责轮播和导航，详情页只按 `id` 读取并渲染本地数据。

**Tech Stack:** 微信小程序原生 WXML/WXSS/JavaScript、Node.js 内置测试运行器。

---

### Task 1: 定义资讯资源与内容契约

**Files:**
- Modify: `tests/project-structure.test.js`

- [ ] 添加测试，要求三张资讯图片存在，首页与完整资讯数据的标题和图片一致，详情数据包含作者、导语、图片说明及至少三段非占位正文。
- [ ] 运行 `npm test`，确认新增测试因旧图片路径和缺失字段而失败。

### Task 2: 导入图片并补齐资讯数据

**Files:**
- Create: `assets/banners/news-silk-road.jpeg`
- Create: `assets/banners/news-exhibition.jpeg`
- Create: `assets/banners/news-craftsmanship.jpeg`
- Modify: `data/home.js`
- Modify: `data/news.js`

- [ ] 将桌面三张原图复制到明确的项目资源路径，不修改原始图片。
- [ ] 在两份数据中统一图片、标题与日期；在 `data/news.js` 写入三篇 500–700 字左右的原创文化资讯。
- [ ] 运行 `npm test`，确认数据契约测试通过。

### Task 3: 完善资讯详情阅读页面

**Files:**
- Modify: `pages/news-detail/index.wxml`
- Modify: `pages/news-detail/index.wxss`
- Modify: `tests/project-structure.test.js`

- [ ] 添加失败测试，要求详情模板包含真实图片、图片说明、导语、正文和署名。
- [ ] 运行 `npm test`，确认测试因当前占位骨架而失败。
- [ ] 用语义清晰的 WXML 渲染详情内容，并使用项目主题变量完成 320–430px 自适应阅读布局。
- [ ] 运行 `npm test` 和 `npm run validate`，确认全部测试与项目校验通过。
- [ ] 检查 `git diff --check`，仅提交本任务文件且保留 `project.private.config.json` 未跟踪。
