# Home Visual Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the existing 瓷韵 home page into the approved balanced-compact visual direction while preserving all current navigation and interaction behavior.

**Architecture:** Keep the existing native WeChat mini-program structure and data-driven feature loop. Centralize shared visual tokens in `styles/theme.wxss`, keep home-only layout in `pages/home/index.wxss`, and keep section/news presentation inside their existing components. No new runtime dependencies, custom TabBar, page routes, or data fields are introduced.

**Tech Stack:** Native WeChat Mini Program (WXML/WXSS/JavaScript), Node.js built-in test runner, PowerShell/System.Drawing for PNG assertions, WeChat Developer Tools for device preview.

---

## File Map

- Modify `tests/project-structure.test.js`: add the home visual contract and retain regression coverage for navigation and assets.
- Modify `styles/theme.wxss`: adjust reusable radius, shadow, and typography tokens used by the home page.
- Modify `pages/home/index.wxml`: preserve module order, update the requested slogan, and set the news carousel peek distance.
- Modify `pages/home/index.wxss`: implement the balanced-compact brand, feature-grid, AI assistant, spacing, and responsive rules.
- Modify `components/home-section-title/index.wxss`: align section heading scale and spacing with the optimized page.
- Modify `components/home-news-card/index.wxml`: use `aspectFill` for fixed-ratio covers.
- Modify `components/home-news-card/index.wxss`: implement the unified carousel card proportions and typography.
- Verify `app.json` and `assets/icons/tab-*.png`: confirm existing native TabBar colors and 81×81 transparent icon assets already satisfy the approved design; change only if verification fails.

### Task 1: Add the Home Visual Contract

**Files:**
- Modify: `tests/project-structure.test.js`
- Test: `tests/project-structure.test.js`

- [ ] **Step 1: Write the failing tests**

Append these tests after the current AI artwork test:

```js
test('home keeps the approved compact module order and brand copy', () => {
  const template = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  const heroIndex = template.indexOf('class="hero"')
  const featuresIndex = template.indexOf('class="feature-grid"')
  const assistantIndex = template.indexOf('class="ai-card"')
  const newsIndex = template.indexOf('class="home-section news-section"')

  assert.ok(heroIndex < featuresIndex)
  assert.ok(featuresIndex < assistantIndex)
  assert.ok(assistantIndex < newsIndex)
  assert.match(template, /瓷一世界 · 以数之美 · 传东方瓷韵/)
})

test('home uses the balanced compact visual measurements', () => {
  const styles = fs.readFileSync(path.join(root, 'pages/home/index.wxss'), 'utf8')
  assert.match(styles, /\.hero\s*\{[^}]*height:\s*340rpx/)
  assert.match(styles, /\.feature-action\s*\{[^}]*width:\s*52rpx[^}]*height:\s*52rpx/)
  assert.match(styles, /\.ai-card\s*\{[^}]*height:\s*190rpx/)
  assert.match(styles, /@media\s*\(max-width:\s*350px\)/)
})

test('home news shows one full card and a 15 to 20 percent next-card peek', () => {
  const template = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/home/index.wxss'), 'utf8')
  const cardTemplate = fs.readFileSync(path.join(root, 'components/home-news-card/index.wxml'), 'utf8')

  assert.match(template, /previous-margin="0rpx"/)
  assert.match(template, /next-margin="116rpx"/)
  assert.match(styles, /\.home-news-swiper\s*\{[^}]*height:\s*400rpx/)
  assert.match(cardTemplate, /mode="aspectFill"/)
})

test('native tab icons retain normalized transparent 81 pixel canvases', () => {
  const iconNames = [
    'home', 'home-active', 'museum', 'museum-active', 'workshop',
    'workshop-active', 'challenge', 'challenge-active', 'profile', 'profile-active'
  ]
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    ...iconNames.map((name) => {
      const iconPath = path.join(root, 'assets', 'icons', `tab-${name}.png`).replace(/'/g, "''")
      return `$bitmap=[System.Drawing.Bitmap]::FromFile('${iconPath}'); try { if ($bitmap.Width -ne 81 -or $bitmap.Height -ne 81 -or $bitmap.GetPixel(0,0).A -ne 0) { exit 1 } } finally { $bitmap.Dispose() }`
    })
  ].join('; ')
  const result = require('node:child_process').spawnSync('powershell', ['-NoProfile', '-Command', script])
  assert.equal(result.status, 0, 'tab icons must use transparent 81×81 canvases')
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm test
```

Expected: the new tests for the slogan, `340rpx` hero, `52rpx` action, `190rpx` AI card, `116rpx` peek, `400rpx` carousel, and `aspectFill` cover fail. The TabBar canvas test may already pass because those resources were normalized previously.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add tests/project-structure.test.js
git commit -m "test: define optimized home visual contract"
```

### Task 2: Refine Global Tokens and the Brand/Feature/AI Layout

**Files:**
- Modify: `styles/theme.wxss`
- Modify: `pages/home/index.wxml`
- Modify: `pages/home/index.wxss`
- Test: `tests/project-structure.test.js`

- [ ] **Step 1: Update the shared visual tokens**

In `styles/theme.wxss`, replace the existing typography/card token values with:

```css
  --font-size-caption: 22rpx;
  --font-size-body: 27rpx;
  --font-size-subtitle: 32rpx;
  --font-size-title: 42rpx;
  --radius-card: 22rpx;
  --radius-card-lg: 26rpx;
  --shadow-card: 0 10rpx 26rpx rgba(42, 48, 47, 0.10);
  --page-gutter: 28rpx;
```

Keep all existing color tokens and spacing tokens unchanged.

- [ ] **Step 2: Update only the brand slogan in the home template**

In `pages/home/index.wxml`, replace:

```xml
<view class="brand-slogan">一瓷一世界 · 以数之美 · 传东方瓷韵</view>
```

with:

```xml
<view class="brand-slogan">瓷一世界 · 以数之美 · 传东方瓷韵</view>
```

Do not change feature data bindings or click handlers.

- [ ] **Step 3: Replace the home stylesheet with readable balanced-compact rules**

Replace `pages/home/index.wxss` with the following complete stylesheet:

```css
.home-page {
  min-height: 100vh;
  overflow-x: hidden;
  background-color: var(--color-page);
  background-image: url('/assets/backgrounds/home-paper.png');
  background-repeat: repeat-y;
  background-size: 100% auto;
}

.hero {
  position: relative;
  overflow: hidden;
  height: 340rpx;
  background: var(--color-silk);
}

.hero-image,
.feature-image,
.ai-background {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.hero-wash {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: linear-gradient(90deg, rgba(248,241,230,.98) 0%, rgba(248,241,230,.84) 43%, rgba(248,241,230,.10) 78%);
}

.hero-copy {
  position: relative;
  z-index: 2;
  padding: 46rpx var(--page-gutter) 30rpx;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.brand-name {
  color: var(--color-ink-blue);
  font-family: var(--font-family-title);
  font-size: 80rpx;
  font-weight: 800;
  letter-spacing: 10rpx;
  line-height: .96;
  text-shadow: 0 2rpx 2rpx rgba(255,255,255,.45);
}

.brand-seal {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34rpx;
  height: 52rpx;
  color: #fff;
  background: var(--color-cinnabar);
  border-radius: 6rpx;
  font-family: var(--font-family-title);
  font-size: 19rpx;
}

.brand-subtitle {
  margin-top: 22rpx;
  color: #34332e;
  font-family: var(--font-family-title);
  font-size: 27rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
  line-height: 1.35;
}

.brand-line {
  width: 48rpx;
  height: 2rpx;
  margin: 18rpx 0 13rpx;
  background: var(--color-warm-gold);
}

.brand-slogan {
  color: #5f5a51;
  font-size: 21rpx;
  font-weight: 500;
  letter-spacing: 2rpx;
  line-height: 1.4;
}

.home-content {
  position: relative;
  z-index: 3;
  margin-top: -14rpx;
  padding: 0 var(--page-gutter) 48rpx;
}

.feature-grid {
  display: grid;
  grid-template-columns: 46fr 54fr;
  gap: 16rpx;
}

.feature-card {
  position: relative;
  overflow: hidden;
  border: 2rpx solid rgba(255,255,255,.76);
  border-radius: var(--radius-card-lg);
  box-shadow: var(--shadow-card);
}

.feature-identify { height: 218rpx; }
.feature-craft { height: 252rpx; }
.feature-challenge { height: 236rpx; margin-top: -18rpx; }
.feature-video { height: 210rpx; }

.feature-craft,
.feature-challenge {
  border-color: rgba(255,248,236,.90);
  box-shadow: 0 14rpx 32rpx rgba(48,40,34,.14);
}

.feature-cover {
  position: absolute;
  top: 0;
  right: 32%;
  bottom: 0;
  left: 0;
}

.tone-blue .feature-cover {
  background: linear-gradient(90deg, rgba(7,52,79,.96) 0%, rgba(11,65,98,.86) 70%, rgba(11,65,98,0) 100%);
}

.tone-ivory .feature-cover {
  right: 27%;
  background: linear-gradient(90deg, rgba(247,231,207,.98) 0%, rgba(247,231,207,.88) 70%, rgba(247,231,207,0) 100%);
}

.tone-red .feature-cover {
  background: linear-gradient(90deg, rgba(143,49,42,.96) 0%, rgba(163,68,52,.87) 70%, rgba(163,68,52,0) 100%);
}

.feature-copy {
  position: relative;
  z-index: 2;
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
  height: 100%;
  padding: 25rpx 18rpx 20rpx 23rpx;
  color: #fff;
}

.tone-ivory .feature-copy { color: #3f2a21; }

.feature-title {
  font-family: var(--font-family-title);
  font-size: 34rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  line-height: 1.2;
  white-space: nowrap;
}

.feature-description {
  max-width: 190rpx;
  margin-top: 10rpx;
  white-space: pre-line;
  font-size: 21rpx;
  line-height: 1.45;
  letter-spacing: .5rpx;
}

.feature-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  margin-top: auto;
  color: var(--color-primary);
  background: rgba(255,252,245,.96);
  border-radius: 50%;
  font-size: 29rpx;
  box-shadow: 0 7rpx 16rpx rgba(0,0,0,.12);
}

.tone-ivory .feature-action { color: var(--color-cinnabar); }

.feature-video-player {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-card-lg);
}

.sr-only {
  position: absolute;
  width: 1rpx;
  height: 1rpx;
  overflow: hidden;
  opacity: 0;
}

.ai-card {
  position: relative;
  overflow: hidden;
  height: 190rpx;
  margin-top: 28rpx;
  border: 1rpx solid rgba(130,152,158,.30);
  border-radius: var(--radius-card-lg);
  box-shadow: var(--shadow-card);
}

.ai-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: linear-gradient(90deg, #f8f2e6 0%, rgba(248,242,230,.98) 65%, rgba(248,242,230,.76) 78%, rgba(248,242,230,0) 96%);
}

.ai-content {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  width: 76%;
  padding: 22rpx 22rpx 20rpx;
}

.ai-heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: var(--color-ink-blue);
  font-family: var(--font-family-title);
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.2;
}

.ai-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  width: 43rpx;
  height: 35rpx;
  border: 3rpx solid var(--color-primary);
  border-radius: 17rpx;
}

.ai-dot {
  width: 5rpx;
  height: 5rpx;
  background: var(--color-primary);
  border-radius: 50%;
}

.ai-prompt {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  gap: 10rpx;
  margin-top: 16rpx;
  padding: 8rpx 8rpx 8rpx 18rpx;
  background: rgba(255,252,247,.95);
  border: 1rpx solid rgba(178,157,130,.38);
  border-radius: 999rpx;
  box-shadow: 0 6rpx 16rpx rgba(68,53,39,.08);
}

.ai-question {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 21rpx;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ai-button {
  flex: none;
  padding: 12rpx 20rpx;
  color: #fff;
  background: var(--color-primary);
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1.2;
}

.home-section { margin-top: 40rpx; }
.news-section { margin-top: 40rpx; }

.home-news-swiper {
  height: 400rpx;
  margin-right: -28rpx;
}

.home-news-swiper swiper-item {
  box-sizing: border-box;
  padding: 0 16rpx 26rpx 0;
}

@media (max-width: 350px) {
  .hero { height: 322rpx; }
  .hero-copy { padding-top: 40rpx; }
  .brand-name { font-size: 72rpx; }
  .brand-subtitle { font-size: 24rpx; letter-spacing: 3rpx; }
  .brand-slogan { font-size: 19rpx; letter-spacing: 1rpx; }
  .feature-title { font-size: 30rpx; }
  .feature-description { max-width: 164rpx; font-size: 19rpx; }
  .feature-copy { padding-left: 19rpx; }
  .ai-content { width: 80%; padding-left: 18rpx; }
  .ai-heading { font-size: 29rpx; }
  .ai-question { font-size: 19rpx; }
  .ai-button { padding-right: 16rpx; padding-left: 16rpx; font-size: 20rpx; }
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN for the home measurements**

```powershell
npm test
```

Expected: slogan, hero height, feature action size, AI card height, module order, prior navigation, and asset tests pass. The news peek and `aspectFill` test still fails until Task 3.

- [ ] **Step 5: Commit the core home refinement**

```powershell
git add styles/theme.wxss pages/home/index.wxml pages/home/index.wxss
git commit -m "style: refine home visual hierarchy"
```

### Task 3: Refine the News Heading and Carousel Cards

**Files:**
- Modify: `pages/home/index.wxml`
- Modify: `components/home-section-title/index.wxss`
- Modify: `components/home-news-card/index.wxml`
- Modify: `components/home-news-card/index.wxss`
- Test: `tests/project-structure.test.js`

- [ ] **Step 1: Set the approved carousel peek distance**

In `pages/home/index.wxml`, replace the home news `swiper` line with:

```xml
<view class="home-section news-section">
  <home-section-title title="瓷韵新知" icon="/assets/icons/home-section-news.png" bind:action="openNews"/>
  <swiper class="home-news-swiper" circular autoplay="{{true}}" interval="4200" duration="550" indicator-dots previous-margin="0rpx" next-margin="116rpx">
    <swiper-item wx:for="{{news}}" wx:key="id">
      <home-news-card item="{{item}}" carousel bind:select="openUrl"/>
    </swiper-item>
  </swiper>
</view>
```

- [ ] **Step 2: Use a fixed-ratio cover crop**

Replace `components/home-news-card/index.wxml` with:

```xml
<view class="news-card {{carousel ? 'news-card-carousel' : ''}}" bindtap="onTap">
  <view class="news-image"><image src="{{item.image}}" mode="aspectFill"/></view>
  <view class="news-content">
    <view class="news-tag">{{item.category}}</view>
    <view class="news-title">{{item.title}}</view>
    <view class="news-date">{{item.date}}</view>
  </view>
</view>
```

- [ ] **Step 3: Replace the section heading styles**

Replace `components/home-section-title/index.wxss` with:

```css
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.heading-main {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.heading-icon {
  flex: none;
  width: 50rpx;
  height: 50rpx;
}

.heading-title {
  color: var(--color-ink-blue);
  font-family: var(--font-family-title);
  font-size: 36rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  line-height: 1.2;
}

.heading-action {
  padding: 10rpx 0 10rpx 18rpx;
  color: var(--color-text-secondary);
  font-size: 24rpx;
  line-height: 1.2;
}

.chevron {
  margin-left: 3rpx;
  font-size: 30rpx;
}
```

- [ ] **Step 4: Replace the news card styles**

Replace `components/home-news-card/index.wxss` with:

```css
.news-card {
  overflow: hidden;
  width: 324rpx;
  background: rgba(255,252,247,.96);
  border: 1rpx solid rgba(166,142,111,.20);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.news-card-carousel {
  box-sizing: border-box;
  width: 100%;
}

.news-image {
  position: relative;
  overflow: hidden;
  height: 166rpx;
  background: var(--color-primary-soft);
}

.news-card-carousel .news-image { height: 188rpx; }

.news-image image {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.news-content {
  position: relative;
  padding: 15rpx 18rpx 17rpx;
}

.news-tag {
  display: inline-flex;
  padding: 4rpx 16rpx;
  color: #81552f;
  background: #f7ead4;
  border-radius: 999rpx;
  font-size: 20rpx;
  line-height: 1.2;
}

.news-title {
  display: -webkit-box;
  min-height: 68rpx;
  margin-top: 9rpx;
  overflow: hidden;
  color: var(--color-text-primary);
  font-family: var(--font-family-title);
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.34;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.news-date {
  margin-top: 7rpx;
  color: var(--color-text-tertiary);
  font-size: 20rpx;
  line-height: 1.2;
}
```

- [ ] **Step 5: Run the full test suite and verify GREEN**

```powershell
npm test
```

Expected: all tests pass, including the `116rpx` next-card peek, `400rpx` carousel height, and `aspectFill` cover.

- [ ] **Step 6: Commit the news carousel refinement**

```powershell
git add pages/home/index.wxml components/home-section-title/index.wxss components/home-news-card/index.wxml components/home-news-card/index.wxss
git commit -m "style: refine home news carousel"
```

### Task 4: Verify TabBar, Responsive Layout, Navigation, and Final Effect

**Files:**
- Verify: `app.json`
- Verify: `assets/icons/tab-*.png`
- Verify: `pages/home/index.js`
- Verify: `data/home.js`
- Verify: all files changed in Tasks 1–3

- [ ] **Step 1: Run automated project verification**

```powershell
npm test
npm run validate
git diff --check
```

Expected: zero failed tests; validator reports 16 pages, 5 tabs, 2 patterns, and 3 levels; `git diff --check` prints no whitespace errors.

- [ ] **Step 2: Confirm native TabBar configuration remains stable**

Inspect `app.json` and verify these values remain:

```json
{
  "color": "#77736B",
  "selectedColor": "#315C72",
  "backgroundColor": "#FFFCF7"
}
```

Confirm all ten TabBar assets are transparent `81×81` PNG files. Do not introduce a custom TabBar.

- [ ] **Step 3: Check the four supported widths in WeChat Developer Tools**

Preview the home page at 320px, 375px, 390px, and 430px widths. At each width verify:

```text
No horizontal scrollbar or clipped page edge
Hero copy remains readable and inside the image
Four feature cards retain the 46/54 staggered grid
All feature titles, descriptions, and arrows remain visible
AI prompt stays on one line with ellipsis when necessary
Robot stays to the right without covering the live button
First news card is complete and the next card peeks by roughly 15–20%
Native TabBar icons remain centered and optically consistent
```

- [ ] **Step 4: Exercise every home interaction**

In the simulator, verify:

```text
AI识瓷 → /pages/ai-identify/index
数字制瓷 → /pages/craft/index
瓷境闯关 → Challenge tab
视频课堂 → shows the existing “视频资源待补充” toast while videoSrc is empty
AI陶瓷助手 → /pages/ai-chat/index
瓷韵新知 card → /pages/news/index?active=<news-id>
更多 → /pages/news/index
All five native TabBar items switch correctly
```

- [ ] **Step 5: Capture the final iPhone 12/13 home effect**

Use the iPhone 12/13 simulator profile, compile after clearing file cache, and capture:

```text
1. One viewport screenshot showing the compact brand, four cards, and AI module
2. One long screenshot showing the complete home page through 瓷韵新知 and the TabBar
```

Save the final user-facing screenshot as `C:\Users\Lenovo\Documents\Codex\2026-09-27\1-2-3-4-5-6\outputs\ciyun-home-final.png`, and show it directly in the final response.

- [ ] **Step 6: Commit any verification-only correction, then report final status**

If visual verification required a scoped correction, rerun Step 1 and commit only that correction:

```powershell
git add styles/theme.wxss pages/home/index.wxml pages/home/index.wxss components/home-section-title/index.wxss components/home-news-card/index.wxml components/home-news-card/index.wxss tests/project-structure.test.js
git commit -m "fix: polish responsive home layout"
```

If no correction was required, do not create an empty commit. Report test totals, validator output, checked widths, interaction results, and the final local commit hashes. Do not push.
