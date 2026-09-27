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
