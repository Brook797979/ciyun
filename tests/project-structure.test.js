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

test('AI assistant background artwork is masked behind the interactive button', () => {
  const homeStyles = fs.readFileSync(path.join(root, 'pages/home/index.wxss'), 'utf8')
  assert.match(homeStyles, /\.ai-overlay\{[^}]*#f8f2e6 82%[^}]*rgba\(248,242,230,0\) 96%/)
})

test('home section headings use reference artwork icons', () => {
  const headingTemplate = fs.readFileSync(path.join(root, 'components/home-section-title/index.wxml'), 'utf8')
  assert.match(headingTemplate, /<image[^>]+src="\{\{icon\}\}"/)
  assert.ok(exists('assets/icons/home-section-classroom.png'))
  assert.ok(exists('assets/icons/home-section-news.png'))
})

test('home classroom reserves inline video playback with posters', () => {
  const videoTemplate = fs.readFileSync(path.join(root, 'components/home-video-card/index.wxml'), 'utf8')
  const homeTemplate = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8')
  assert.match(videoTemplate, /<video[^>]+wx:if="\{\{item\.src\}\}"/)
  assert.match(videoTemplate, /poster="\{\{item\.image\}\}"/)
  assert.match(homeTemplate, /home-section-title title="陶瓷课堂"[^>]+bind:action="openVideos"/)
})

test('home news links to a swiper-based news page with replaceable covers', () => {
  const home = require(path.join(root, 'data/home'))
  const newsTemplate = fs.readFileSync(path.join(root, 'pages/news/index.wxml'), 'utf8')
  assert.ok(home.news.every((item) => item.url.startsWith('/pages/news/index?active=')))
  assert.match(newsTemplate, /<swiper[^>]+class="news-swiper"/)
  assert.match(newsTemplate, /<swiper-item[^>]+wx:for="\{\{news\}\}"/)
  assert.match(newsTemplate, /<image[^>]+src="\{\{item\.cover\}\}"/)
})
