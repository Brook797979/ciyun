const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

const tabs = [
  'pages/home/index',
  'pages/museum/index',
  'pages/workshop/index',
  'pages/challenge/index',
  'pages/profile/index'
]

const secondaryPages = [
  'pages/ceramic-detail/index',
  'pages/ai-identify/index',
  'pages/ai-chat/index',
  'pages/video-learning/index',
  'pages/news/index',
  'pages/news-detail/index',
  'pages/craft/index',
  'pages/ai-create/index',
  'pages/works/index',
  'pages/game/index',
  'pages/challenge-result/index'
]

const componentNames = ['section-title', 'feature-entry', 'ceramic-card', 'empty-state']
const dataFiles = ['ceramics', 'patterns', 'challenges', 'works', 'videos', 'news', 'user']
const assetFolders = ['ceramics', 'patterns', 'banners', 'videos', 'icons', 'backgrounds', 'achievements']

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

test('app config registers five tabs and required secondary pages', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.deepEqual(config.tabBar.list.map((item) => item.pagePath), tabs)
  secondaryPages.forEach((page) => assert.ok(config.pages.includes(page), `${page} is not registered`))
})

test('registered pages have the WeChat four-file structure', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  config.pages.forEach((page) => {
    ;['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
      assert.ok(exists(`${page}.${extension}`), `${page}.${extension} is missing`)
    })
  })
})

test('theme, components, data modules and asset directories exist', () => {
  assert.ok(exists('styles/theme.wxss'))
  assert.ok(exists('styles/utilities.wxss'))
  componentNames.forEach((name) => {
    ;['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
      assert.ok(exists(`components/${name}/index.${extension}`), `${name}.${extension} is missing`)
    })
  })
  dataFiles.forEach((name) => assert.ok(exists(`data/${name}.js`), `data/${name}.js is missing`))
  assetFolders.forEach((name) => assert.ok(exists(`assets/${name}`), `assets/${name} is missing`))
})

test('profile only routes to the shared works page', () => {
  const profileScript = fs.readFileSync(path.join(root, 'pages/profile/index.js'), 'utf8')
  assert.match(profileScript, /pages\/works\/index/)
  ;['favorites', 'unlocked-patterns', 'achievements', 'learning-records', 'challenge-records'].forEach((page) => {
    assert.equal(exists(`pages/${page}`), false, `unneeded page ${page} should not exist`)
  })
})

test('home data provides all required interactive content', () => {
  const home = require(path.join(root, 'data/home'))
  assert.deepEqual(home.features.map((item) => item.title), ['AI识瓷', '数字制瓷', '瓷境闯关', '视频课堂'])
  assert.deepEqual(home.features.map((item) => item.url), [
    '/pages/ai-identify/index',
    '/pages/craft/index',
    '/pages/challenge/index',
    '/pages/video-learning/index'
  ])
  assert.equal(home.aiAssistant.url, '/pages/ai-chat/index')
  assert.equal(home.videos.length, 3)
  assert.ok(home.videos.every((item) => item.url === '/pages/video-learning/index'))
  assert.equal(home.news.length, 3)
  assert.ok(home.news.every((item) => item.url.startsWith('/pages/news/index?active=')))
})

test('developer tools must not filter component files by dependency analysis', () => {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  assert.equal(projectConfig.setting.ignoreDevUnusedFiles, false)
})

test('home components are included in the global dependency graph', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.deepEqual(appConfig.usingComponents, {
    'home-section-title': '/components/home-section-title/index',
    'home-video-card': '/components/home-video-card/index',
    'home-news-card': '/components/home-news-card/index'
  })
})

test('AI assistant reserves the right side for artwork without crowding live controls', () => {
  const homeStyles = fs.readFileSync(path.join(root, 'pages/home/index.wxss'), 'utf8')
  assert.match(homeStyles, /\.ai-overlay\s*\{[^}]*linear-gradient/)
  assert.match(homeStyles, /\.ai-content\s*\{[^}]*width:\s*76%/)
})

test('home section headings use reference artwork icons', () => {
  const headingTemplate = fs.readFileSync(path.join(root, 'components/home-section-title/index.wxml'), 'utf8')
  assert.match(headingTemplate, /<image[^>]+src="\{\{icon\}\}"/)
  assert.ok(exists('assets/icons/home-section-classroom.png'))
  assert.ok(exists('assets/icons/home-section-news.png'))
})

test('home news links to an editorial news landing page with replaceable covers', () => {
  const home = require(path.join(root, 'data/home'))
  const newsTemplate = fs.readFileSync(path.join(root, 'pages/news/index.wxml'), 'utf8')
  assert.ok(home.news.every((item) => item.url.startsWith('/pages/news/index?active=')))
  assert.match(newsTemplate, /class="news-hero"/)
  assert.match(newsTemplate, /class="featured-card"/)
  assert.match(newsTemplate, /class="latest-list"/)
  assert.match(newsTemplate, /wx:for="\{\{latestNews\}\}"/)
  assert.doesNotMatch(newsTemplate, /class="news-swiper"/)
})

test('news landing page supports custom navigation and missing cover placeholders', () => {
  const template = fs.readFileSync(path.join(root, 'pages/news/index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'pages/news/index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/news/index.json'), 'utf8'))

  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /<view[^>]+class="back-button"[^>]+bindtap="goBack"/)
  assert.doesNotMatch(template, /<button[^>]+class="back-button"/)
  assert.match(template, /wx:if="\{\{featured\.cover\}\}"/)
  assert.match(template, /wx:if="\{\{item\.cover\}\}"/)
  assert.match(template, /class="news-cover-placeholder"/)
  assert.match(script, /featured:/)
  assert.match(script, /latestNews:/)
})

test('news landing matches the compact target proportions and fixed article order', () => {
  const news = require(path.join(root, 'data/news'))
  const script = fs.readFileSync(path.join(root, 'pages/news/index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/news/index.wxss'), 'utf8')
  const featured = news.find((item) => item.id === 'news-002')
  const expectedLatestIds = ['news-005', 'news-004', 'news-007', 'news-006', 'news-008']
  const latest = expectedLatestIds.map((id) => news.find((item) => item.id === id))

  assert.equal(featured.category, '展览')
  assert.equal(featured.summary, '穿越千年，感受中国陶瓷的东方美学与文明温度。')
  assert.deepEqual(latest.map((item) => item.id), expectedLatestIds)
  assert.ok(latest.every((item) => item.category !== '展览'))
  assert.equal(news.find((item) => item.id === 'news-006').title, '窑火中的颜色密码')
  assert.match(script, /featuredNews/)
  expectedLatestIds.forEach((id) => assert.match(script, new RegExp(`'${id}'`)))
  assert.match(styles, /\.news-hero\s*\{[^}]*height:\s*230rpx/)
  assert.match(styles, /\.featured-card\s*\{[^}]*height:\s*300rpx/)
  assert.match(styles, /\.latest-card\s*\{[^}]*min-height:\s*144rpx/)
})

test('home news section is an autoplay carousel', () => {
  const homeTemplate = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  assert.match(homeTemplate, /<swiper[^>]+class="home-news-swiper"/)
  assert.match(homeTemplate, /autoplay="\{\{true\}\}"/)
  assert.match(homeTemplate, /<swiper-item[^>]+wx:for="\{\{news\}\}"/)
})

test('featured video plays inside the core card without a duplicate classroom section', () => {
  const home = require(path.join(root, 'data/home'))
  const homeTemplate = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  const featuredVideo = home.features.find((item) => item.id === 'video')
  assert.equal(featuredVideo.videoSrc, '')
  assert.match(homeTemplate, /<video[^>]+class="feature-video-player"/)
  assert.doesNotMatch(homeTemplate, /home-section-title title="陶瓷课堂"/)
})

test('featured video uses the same arrow action style as other feature cards', () => {
  const homeTemplate = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  assert.doesNotMatch(homeTemplate, /feature-play/)
  assert.doesNotMatch(homeTemplate, /'▶'/)
})

test('tab bar icons use transparent corners without captured backgrounds', () => {
  const iconNames = [
    'home', 'home-active', 'museum', 'museum-active', 'workshop',
    'workshop-active', 'challenge', 'challenge-active', 'profile', 'profile-active'
  ]
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    ...iconNames.map((name) => {
      const iconPath = path.join(root, 'assets', 'icons', `tab-${name}.png`).replace(/'/g, "''")
      return `$bitmap=[System.Drawing.Bitmap]::FromFile('${iconPath}'); try { if ($bitmap.GetPixel(0,0).A -ne 0) { exit 1 } } finally { $bitmap.Dispose() }`
    })
  ].join('; ')
  const result = require('node:child_process').spawnSync('powershell', ['-NoProfile', '-Command', script])
  assert.equal(result.status, 0, 'tab icons must have transparent pixels at their corners')
})

test('AI assistant uses artwork without baked interactive controls', () => {
  const homeData = fs.readFileSync(path.join(root, 'data/home.js'), 'utf8')
  assert.match(homeData, /home-ai-assistant-clean\.jpg/)
  assert.ok(fs.existsSync(path.join(root, 'assets/banners/home-ai-assistant-clean.jpg')))
})

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

test('home paper background is a reusable texture instead of a captured UI strip', () => {
  const texturePath = path.join(root, 'assets', 'backgrounds', 'home-paper.png').replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$bitmap=[System.Drawing.Bitmap]::FromFile('${texturePath}')`,
    'try { if ($bitmap.Width -lt 512 -or $bitmap.Height -lt 512) { exit 1 } } finally { $bitmap.Dispose() }'
  ].join('; ')
  const result = require('node:child_process').spawnSync('powershell', ['-NoProfile', '-Command', script])
  assert.equal(result.status, 0, 'home paper texture must be at least 512×512 without baked UI text')
})

test('home news uses local image covers instead of captured card artwork', () => {
  const home = require(path.join(root, 'data/home'))
  assert.ok(home.news.every((item) => /\.(?:jpe?g|png)$/.test(item.image)))
  home.news.forEach((item) => assert.ok(exists(item.image.replace(/^\//, '')), `${item.image} is missing`))
})

test('home and detail news share the user-provided local cover images', () => {
  const home = require(path.join(root, 'data/home'))
  const news = require(path.join(root, 'data/news'))
  const expectedCovers = [
    '/assets/banners/news-silk-road.jpeg',
    '/assets/banners/news-exhibition.jpeg',
    '/assets/banners/news-craftsmanship.jpeg'
  ]

  assert.deepEqual(home.news.map((item) => item.image), expectedCovers)
  assert.deepEqual(home.news.map((item) => news.find((entry) => entry.id === item.id).cover), expectedCovers)
  assert.deepEqual(home.news.map((item) => item.title), home.news.map((item) => news.find((entry) => entry.id === item.id).title))
  expectedCovers.forEach((cover) => assert.ok(exists(cover.replace(/^\//, '')), `${cover} is missing`))
})

test('news detail data contains complete original reading content', () => {
  const news = require(path.join(root, 'data/news'))

  news.forEach((item) => {
    assert.equal(item.author, '瓷韵编辑部')
    assert.ok(item.lead.length >= 35, `${item.id} lead is too short`)
    assert.ok(item.imageCaption.length >= 12, `${item.id} image caption is too short`)
    assert.ok(item.paragraphs.length >= 3, `${item.id} needs at least three paragraphs`)
    assert.ok(item.paragraphs.join('').length >= 420, `${item.id} article is too short`)
    assert.doesNotMatch(item.paragraphs.join(''), /占位|模拟正文/)
  })
})

test('news detail page renders a clean article without editorial credits', () => {
  const template = fs.readFileSync(path.join(root, 'pages/news-detail/index.wxml'), 'utf8')

  assert.match(template, /wx:if="\{\{item\.cover\}\}"/)
  assert.match(template, /<image[^>]+class="article-cover"[^>]+src="\{\{item\.cover\}\}"[^>]+mode="aspectFill"/)
  assert.match(template, /class="article-caption"[^>]*>\{\{item\.imageCaption\}\}/)
  assert.match(template, /class="article-lead"[^>]*>\{\{item\.lead\}\}/)
  assert.match(template, /wx:for="\{\{item\.paragraphs\}\}"/)
  assert.doesNotMatch(template, /\{\{item\.author\}\}|article-footer|article-author|article-note/)
  assert.doesNotMatch(template, /编辑：|本文为瓷韵平台原创文化资讯/)
  assert.doesNotMatch(template, /资讯封面|class="placeholder"/)
})
