const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function loadDetailPage() {
  const pagePath = path.join(root, 'pages/ceramic-detail/index.js')
  const originalPage = global.Page
  let definition

  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(pagePath)]
  require(pagePath)
  global.Page = originalPage

  return {
    ...definition,
    data: { ...definition.data },
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    }
  }
}

test('every ceramic exposes complete generic detail-page data', () => {
  const ceramics = require(path.join(root, 'data/ceramics'))

  ceramics.forEach((item) => {
    assert.ok(item.id && item.name && item.dynasty && item.image)
    assert.ok(item.type && item.category, `${item.id} is missing basic information`)
    assert.ok(Array.isArray(item.tags) && item.tags.length >= 3, `${item.id} needs at least three tags`)
    assert.ok(item.description.length >= 38, `${item.id} description is too short`)
    assert.ok(item.video && item.video.title && item.video.description)
    assert.match(item.video.duration, /^\d{2}:\d{2}$/)
    assert.ok(fs.existsSync(path.join(root, item.video.cover.replace(/^\//, ''))), `${item.video.cover} is missing`)
    assert.equal(typeof item.video.src, 'string')
    if (item.video.src) {
      assert.match(item.video.src, /^(?:cloud:\/\/|https:\/\/|\/assets\/videos\/)/)
    }
    assert.match(item.video.resourcePath, /^\/assets\/videos\/.+\.mp4$/)
    assert.equal(item.video.cloudPath, `videos/ceramic-detail/${item.id}.mp4`)
    assert.equal(item.video.coverResourcePath, item.video.cover)
  })

  assert.equal(new Set(ceramics.map((item) => item.video)).size, ceramics.length)
  for (const field of ['id', 'cloudPath', 'coverResourcePath', 'resourcePath']) {
    assert.equal(new Set(ceramics.map((item) => item.video[field])).size, ceramics.length, `${field} must be independent for each ceramic`)
  }
})

test('ceramic detail resolves one shared page by id and falls back safely', () => {
  const originalWx = global.wx
  global.wx = {
    getWindowInfo() { return { windowWidth: 390 } },
    getMenuButtonBoundingClientRect() { return { top: 48, bottom: 80, height: 32 } }
  }

  const page = loadDetailPage()
  page.onLoad({ id: 'ceramic-004' })
  assert.equal(page.data.item.id, 'ceramic-004')
  assert.equal(page.data.navTop, 48)
  assert.ok(page.data.heroHeight >= 94)

  page.onLoad({ id: 'missing-id' })
  assert.equal(page.data.item.id, 'ceramic-001')
  page.onLoad()
  assert.equal(page.data.item.id, 'ceramic-001')
  global.wx = originalWx
})

test('ceramic detail returns to the museum and opens contextual AI chat', () => {
  const originalWx = global.wx
  const calls = []
  global.wx = {
    getCurrentPages() { return [{ route: 'pages/museum/index' }, { route: 'pages/ceramic-detail/index' }] },
    navigateBack(options) { calls.push(['back', options.delta]) },
    navigateTo(options) { calls.push(['navigate', options.url]); return Promise.resolve() },
    switchTab(options) { calls.push(['tab', options.url]); return Promise.resolve() }
  }

  const page = loadDetailPage()
  page.onLoad({ id: 'ceramic-006' })
  page.ask()
  page.goBack()

  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], 'navigate')
  const destination = new URL(calls[0][1], 'https://ciyun.invalid')
  assert.equal(destination.pathname, '/pages/ai-chat/index')
  assert.equal(destination.searchParams.get('ceramicId'), 'ceramic-006')
  assert.equal(destination.searchParams.has('question'), false)
  assert.deepEqual(calls[1], ['back', 1])
  global.wx = originalWx
})

test('ceramic detail template matches the high-fidelity single-item structure', () => {
  const template = fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.wxss'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.json'), 'utf8'))

  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /class="detail-header"/)
  assert.match(template, /class="back-button"[^>]+bindtap="goBack"/)
  assert.match(template, /瓷器详情/)
  assert.match(template, /<image[^>]+class="ceramic-hero-image"[^>]+src="\{\{item\.image\}\}"[^>]+mode="aspectFit"[^>]+bindtap="previewCeramic"/)
  assert.match(template, /wx:for="\{\{item\.tags\}\}"/)
  assert.match(template, /\{\{item\.type\}\}/)
  assert.match(template, /\{\{item\.category\}\}/)
  assert.match(template, /\{\{item\.description\}\}/)
  assert.match(template, /藏品简介/)
  assert.match(template, /相关影像/)
  assert.match(template, /item\.video\.cover/)
  assert.match(template, /item\.video\.duration/)
  assert.doesNotMatch(template, /查看更多/)
  assert.equal((template.match(/class="related-video(?:\s[^"]*)?"/g) || []).length, 1)
  assert.match(template, /class="ai-entry"[^>]+bindtap="ask"/)
  assert.match(template, /AI深度解读/)
  assert.match(template, /探索这件藏品背后的历史与纹样/)
  assert.match(styles, /\.ceramic-hero-image\s*\{[^}]*height:\s*540rpx/)
  assert.match(styles, /@media\s*\(max-width:\s*350px\)/)
})
