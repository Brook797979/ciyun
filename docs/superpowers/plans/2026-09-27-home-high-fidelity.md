# 瓷韵首页高保真 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据参考图完成真实可交互的微信小程序首页高保真界面。

**Architecture:** 首页数据独立存放，首页专用展示组件负责视频和资讯卡片；全局主题仅增加语义化设计变量；本地生成图片承载氛围，文字和交互保留在原生 WXML。

**Tech Stack:** 原生微信小程序、WXML、WXSS、CommonJS、本地 PNG/JPG 资源。

---

### Task 1: 首页行为测试

**Files:**
- Modify: `tests/project-structure.test.js`
- Create: `data/home.js`

- [ ] 写失败测试，检查四个入口、AI入口、三条视频、三条资讯及目标路由。
- [ ] 运行测试，确认因首页数据尚不存在而失败。
- [ ] 创建最小首页数据模块并让数据测试通过。

### Task 2: 首页视觉资源

**Files:**
- Create: `assets/banners/home-hero.png`
- Create: `assets/backgrounds/home-paper.png`
- Create: `assets/ceramics/home-feature-*.png`
- Create: `assets/banners/home-ai-assistant.png`
- Create: `assets/videos/home-video-*.png`
- Create: `assets/banners/home-news-*.png`
- Create: `assets/icons/tab-*.png`

- [ ] 依据参考图生成无文字视觉资源。
- [ ] 检查图片比例、主体安全区和风格一致性。
- [ ] 生成统一的原生 TabBar 图标。

### Task 3: 首页组件与页面

**Files:**
- Create: `components/home-section-title/index.*`
- Create: `components/home-video-card/index.*`
- Create: `components/home-news-card/index.*`
- Modify: `pages/home/index.js`
- Modify: `pages/home/index.json`
- Modify: `pages/home/index.wxml`
- Modify: `pages/home/index.wxss`

- [ ] 实现品牌区和错落核心入口。
- [ ] 实现 AI 助手横卡。
- [ ] 实现视频与资讯横向滚动模块。
- [ ] 连接全部首页跳转。

### Task 4: 主题与 TabBar

**Files:**
- Modify: `styles/theme.wxss`
- Modify: `app.json`

- [ ] 补充青花首页设计变量。
- [ ] 为五个 Tab 配置普通与选中图标。
- [ ] 保持其他页面现有结构不变。

### Task 5: 验证

**Files:**
- Modify: `scripts/validate-project.js`

- [ ] 运行 `npm test`，预期全部通过。
- [ ] 运行 `npm run validate`，预期全部通过。
- [ ] 检查所有 JS 语法、图片尺寸、路由目标、Git 变更范围和空白错误。

