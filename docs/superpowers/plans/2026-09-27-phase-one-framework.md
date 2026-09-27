# 瓷韵微信小程序第一阶段框架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可由微信开发者工具直接导入、包含五个 Tab 和必要二级路由的原生微信小程序框架。

**Architecture:** 使用原生 JavaScript/WXML/WXSS/JSON；业务数据集中在 `data/`，公共行为在 `utils/`，视觉基础在 `styles/`，可复用骨架在 `components/`。仅为真实导航链路创建二级页面，“我的”其余项目只保留入口状态与本地数据。

**Tech Stack:** 微信小程序原生运行时、CommonJS 模块、Node.js 内置测试与校验能力。

---

### Task 1: 建立结构校验基线

**Files:**
- Create: `tests/project-structure.test.js`
- Create: `scripts/validate-project.js`
- Create: `package.json`

- [ ] **Step 1: 写失败的结构测试**

测试应读取 `app.json`，断言五个 Tab 路由、必需二级路由、主题样式文件、公共组件、模拟数据目录和资源目录存在。

- [ ] **Step 2: 运行测试并确认因项目文件尚不存在而失败**

Run: `node --test tests/project-structure.test.js`
Expected: FAIL，错误明确指向缺少 `app.json` 或目标目录。

- [ ] **Step 3: 创建最小测试命令与校验脚本入口**

`package.json` 仅声明 `test` 与 `validate` 命令，不安装依赖。`scripts/validate-project.js` 负责 JSON、页面四件套、Tab 图标、组件引用、资源目录和数据引用校验。

- [ ] **Step 4: 保留测试失败状态进入工程实现**

Run: `npm test`
Expected: FAIL，原因仍为工程骨架缺失，而非测试语法错误。

### Task 2: 创建应用配置、主题与资源目录

**Files:**
- Create: `app.js`
- Create: `app.json`
- Create: `app.wxss`
- Create: `project.config.json`
- Create: `sitemap.json`
- Create: `styles/theme.wxss`
- Create: `styles/utilities.wxss`
- Create: `assets/*/.gitkeep`
- Create: `assets/icons/*.png`

- [ ] **Step 1: 创建全局应用和项目配置**

注册五个一级页面及实际需要的二级页面，启用原生 TabBar，并设置简洁的新中式基础窗口色彩。

- [ ] **Step 2: 创建全局主题变量和工具样式**

定义语义化颜色、字号、字体、间距、圆角、阴影和内容宽度变量；不编写具体页面高保真样式。

- [ ] **Step 3: 创建资源目录与合法 Tab 图标**

建立 ceramics、patterns、banners、videos、icons、backgrounds、achievements，并放置普通/选中两态的五组本地图标。

- [ ] **Step 4: 运行结构测试确认失败范围收敛到页面和数据文件**

Run: `npm test`
Expected: FAIL，应用配置与主题断言通过，页面/组件/数据断言仍失败。

### Task 3: 创建公共组件和模拟数据

**Files:**
- Create: `components/section-title/*`
- Create: `components/feature-entry/*`
- Create: `components/ceramic-card/*`
- Create: `components/empty-state/*`
- Create: `data/ceramics.js`
- Create: `data/patterns.js`
- Create: `data/challenges.js`
- Create: `data/works.js`
- Create: `data/videos.js`
- Create: `data/news.js`
- Create: `data/user.js`
- Create: `utils/navigation.js`
- Create: `utils/storage.js`
- Create: `utils/mock-api.js`

- [ ] **Step 1: 创建四个无业务耦合的骨架组件**

组件只接收展示属性、触发点击事件并使用主题变量，不连接具体数据源。

- [ ] **Step 2: 创建模块化模拟数据**

为瓷器、纹样、关卡、作品、视频、资讯和本地个人展示数据提供少量完整样例，保证跨模块 ID 可解析。

- [ ] **Step 3: 创建导航、存储和模拟请求工具**

导航工具区分 Tab 与二级页面；存储工具封装同步读写；模拟 API 以 Promise 返回数据副本。

- [ ] **Step 4: 运行数据与结构测试**

Run: `npm test`
Expected: 组件、数据和工具断言通过；页面相关断言仍失败。

### Task 4: 创建五个一级页面

**Files:**
- Create: `pages/home/index.*`
- Create: `pages/museum/index.*`
- Create: `pages/workshop/index.*`
- Create: `pages/challenge/index.*`
- Create: `pages/profile/index.*`

- [ ] **Step 1: 创建首页功能聚合骨架**

保留 AI 识瓷、数字制瓷、挑战、AI 问答、视频、资讯和精选文化内容入口。

- [ ] **Step 2: 创建瓷馆列表骨架**

加载瓷器模拟数据，提供简单筛选标签和详情跳转。

- [ ] **Step 3: 创建工坊与挑战骨架**

工坊包含数字制瓷、AI 创瓷、作品入口；挑战包含关卡节点、状态和星级摘要。

- [ ] **Step 4: 创建“我的”收敛骨架**

仅“我的作品”具有独立跳转；收藏、纹样、成就、学习和闯关记录展示本地摘要或暂不可用状态，不创建对应空页面。

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 一级页面断言通过；二级页面断言仍失败。

### Task 5: 创建必要二级页面与体验链路

**Files:**
- Create: `pages/ceramic-detail/index.*`
- Create: `pages/ai-identify/index.*`
- Create: `pages/ai-chat/index.*`
- Create: `pages/video-learning/index.*`
- Create: `pages/news/index.*`
- Create: `pages/news-detail/index.*`
- Create: `pages/craft/index.*`
- Create: `pages/ai-create/index.*`
- Create: `pages/works/index.*`
- Create: `pages/game/index.*`
- Create: `pages/challenge-result/index.*`

- [ ] **Step 1: 创建内容与 AI 页面骨架**

详情、识瓷、问答、视频和资讯页面只展示模拟内容及必要的跨模块入口。

- [ ] **Step 2: 创建创作页面骨架**

数字制瓷仅展示四步结构；AI 创瓷仅展示输入和模拟结果区域；作品页展示本地作品。

- [ ] **Step 3: 创建挑战链路骨架**

通用游戏页可根据关卡 ID 加载标题，结果页展示模拟星级和奖励，并提供返回挑战/进入工坊操作。

- [ ] **Step 4: 运行完整测试和静态校验**

Run: `npm test`
Expected: PASS，全部测试通过。

Run: `npm run validate`
Expected: 输出页面、Tab、组件、数据和资源检查通过，退出码为 0。

### Task 6: 文档与最终验证

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-09-27-ceramic-culture-mini-program-design.md`

- [ ] **Step 1: 编写导入与目录说明**

说明如何使用微信开发者工具导入、当前阶段范围、模拟数据位置、主题变量位置及后续替换方式。

- [ ] **Step 2: 执行最终验证**

Run: `npm test`
Expected: PASS，0 failures。

Run: `npm run validate`
Expected: PASS，退出码 0。

Run: `git diff --check`
Expected: 无空白错误。

- [ ] **Step 3: 检查工作区变更范围并提交**

确认仅包含第一阶段框架、测试、文档与资源后提交到功能分支。

