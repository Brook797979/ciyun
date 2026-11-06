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
  'pages/video-detail/index',
  'pages/news/index',
  'pages/news-detail/index',
  'pages/craft/index',
  'pages/ai-create/index',
  'pages/works/index',
  'pages/game/index',
  'pages/challenge-result/index'
]

const componentNames = ['section-title', 'ceramic-card']
const dataFiles = ['ceramics', 'patterns', 'challenges', 'videos', 'news']
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

test('video classroom data maps four carousel videos and six selected videos', () => {
  const videoData = require(path.join(root, 'data/videos'))
  const expectedCarouselTitles = [
    '《只瓷一生》非遗纪录片｜景德镇手工制瓷技艺纪录片',
    '龙泉青瓷｜内藏雕花·中式瓷韵的极致美学',
    '微电影《窑火千年 瓷骋天下》',
    '一次看完，中国陶瓷发展史！'
  ]
  const expectedVideoTitles = [
    '【非遗汝瓷】全世界只有中国会做，裂纹声如风铃般清脆！',
    '3步完成一个精美花瓶！',
    '超简单，一学就会的仙人掌制作展示！',
    '陶碗制作全过程',
    '陶艺入门拉坯教程',
    '治愈系手工陶艺，做一个纯白简约风高腰花瓶'
  ]

  assert.deepEqual(videoData.carouselVideos.map((item) => item.title), expectedCarouselTitles)
  assert.deepEqual(videoData.carouselVideos.map((item) => item.duration), ['09:22', '09:24', '05:34', '27:31'])
  assert.deepEqual(videoData.videos.map((item) => item.title), expectedVideoTitles)
  assert.deepEqual(videoData.videos.map((item) => item.duration), ['04:03', '02:26', '02:38', '05:08', '03:29', '13:58'])
  assert.equal(videoData.allVideos.length, 10)
  videoData.allVideos.forEach((item) => {
    assert.ok(exists(item.cover.replace(/^\//, '')), `${item.cover} is missing`)
    assert.match(item.src, /^cloud:\/\/cloud1-d7gew23w04c3def7d\..+\/videos\/.+\.mp4$/)
    assert.match(item.cloudPath, /^videos\/(carousel|selected)\/.+\.mp4$/)
  })
})

test('video classroom uses an inline carousel and two-column playback cards', () => {
  const template = fs.readFileSync(path.join(root, 'pages/video-learning/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/video-learning/index.wxss'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'pages/video-learning/index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/video-learning/index.json'), 'utf8'))

  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /class="classroom-hero"/)
  assert.match(template, /open-type="share"/)
  assert.match(template, /<swiper[^>]+class="featured-swiper"/)
  assert.match(template, /indicator-dots="\{\{false\}\}"/)
  assert.match(template, /autoplay="\{\{playingVideoId === ''\}\}"/)
  assert.match(template, /interval="4500"/)
  assert.match(template, /class="swiper-dots"/)
  assert.match(template, /wx:for="\{\{carouselVideos\}\}"/)
  assert.match(template, /wx:for="\{\{videos\}\}"/)
  assert.match(template, /<block[^>]+wx:if="\{\{playingVideoId === item\.id\}\}"/)
  assert.match(template, /bindended="onVideoEnded"/)
  assert.match(template, /bindtap="playVideo"/)
  assert.equal((template.match(/show-fullscreen-btn="\{\{true\}\}"/g) || []).length, 2)
  assert.equal((template.match(/bindfullscreenchange="onVideoFullscreenChange"/g) || []).length, 2)
  assert.doesNotMatch(template, /fullscreen-control|catchtap="requestFullscreen"/)
  assert.match(template, /mode="aspectFill"/)
  assert.doesNotMatch(template, /<br\s*\/?\s*>/)
  assert.doesNotMatch(script, /pages\/video-detail/)
  assert.match(script, /wx\.createVideoContext/)
  assert.match(script, /callFunction/)
  assert.match(script, /stopCurrentVideo/)
  assert.match(script, /onVideoFullscreenChange/)
  assert.match(styles, /\.classroom-hero\s*\{[^}]*height:\s*260rpx/)
  assert.match(styles, /\.classroom-content\s*\{[^}]*padding:\s*18rpx 22rpx 0/)
  assert.match(styles, /\.featured-swiper\s*\{[^}]*height:\s*294rpx/)
  assert.match(styles, /\.swiper-dots\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*12rpx/)
  assert.match(styles, /\.video-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(styles, /\.video-thumb\s*\{[^}]*height:\s*190rpx/)
})

test('video classroom stops the active video before another one starts', async () => {
  const scriptPath = path.join(root, 'pages/video-learning/index.js')
  const originalPage = global.Page
  const originalWx = global.wx
  let pageDefinition
  const calls = []

  global.Page = (definition) => { pageDefinition = definition }
  global.wx = {
    cloud: { async callFunction() {
      return { result: {
        videos: require(path.join(root, 'data/videos')).allVideos.map((item) => ({ id: item.id, url: `https://example.com/${item.id}.mp4` })),
        expiresAt: Date.now() + 2700000
      } }
    } },
    createVideoContext(id) {
      return {
        play() { calls.push(`play:${id}`) },
        stop() { calls.push(`stop:${id}`) }
      }
    }
  }

  delete require.cache[require.resolve(scriptPath)]
  require(scriptPath)
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    }
  }

  await page.playVideo({ currentTarget: { dataset: { id: 'carousel-ceramic-life' } } })
  await page.playVideo({ currentTarget: { dataset: { id: 'selected-ru-porcelain' } } })
  page.onSwiperChange({ detail: { current: 2 } })
  page.onVideoEnded({ currentTarget: { dataset: { id: 'selected-ru-porcelain' } } })

  assert.deepEqual(calls, [
    'play:video-carousel-ceramic-life',
    'stop:video-carousel-ceramic-life',
    'play:video-selected-ru-porcelain'
  ])
  assert.equal(page.data.currentSwiperIndex, 2)
  assert.equal(page.data.playingVideoId, '')

  delete require.cache[require.resolve(scriptPath)]
  global.Page = originalPage
  global.wx = originalWx
})

test('app initializes the configured WeChat cloud environment', () => {
  const appScript = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  assert.match(appScript, /wx\.cloud\.init/)
  assert.match(appScript, /cloud1-d7gew23w04c3def7d/)
})

test('video detail page resolves content by video id', () => {
  const script = fs.readFileSync(path.join(root, 'pages/video-detail/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'pages/video-detail/index.wxml'), 'utf8')

  assert.match(script, /options\.id/)
  assert.match(script, /allVideos\.find/)
  assert.match(template, /item\.cover/)
  assert.match(template, /item\.title/)
  assert.match(template, /item\.description/)
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
  assert.equal(news.find((item) => item.id === 'news-005').cover, '/assets/banners/news-pottery-making.jpg')
  assert.doesNotMatch(news.find((item) => item.id === 'news-005').imageCaption, /待补充/)
  assert.equal(news.find((item) => item.id === 'news-006').title, '窑火中的颜色密码')
  assert.equal(news.find((item) => item.id === 'news-006').cover, '/assets/banners/news-kiln-fire.jpg')
  assert.doesNotMatch(news.find((item) => item.id === 'news-006').imageCaption, /待补充/)
  assert.equal(news.find((item) => item.id === 'news-008').cover, '/assets/banners/news-famous-ceramics.png')
  assert.ok(exists('assets/banners/news-pottery-making.jpg'))
  assert.ok(exists('assets/banners/news-kiln-fire.jpg'))
  assert.ok(exists('assets/banners/news-famous-ceramics.png'))
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

test('video placeholders navigate without showing a resource toast', () => {
  const homeScript = fs.readFileSync(path.join(root, 'pages/home/index.js'), 'utf8')
  const videoCardScript = fs.readFileSync(path.join(root, 'components/home-video-card/index.js'), 'utf8')

  assert.doesNotMatch(homeScript, /showToast|视频资源待补充/)
  assert.doesNotMatch(videoCardScript, /showToast|视频资源待补充/)
  assert.match(homeScript, /openFeature\([\s\S]*?go\(url\)/)
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
    assert.doesNotMatch(item.imageCaption, /待补充|占位|正常阅读/, `${item.id} still uses a placeholder caption`)
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
