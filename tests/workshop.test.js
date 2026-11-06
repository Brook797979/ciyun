const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages/workshop/index.js')

function createEnvironment(t, storedWorks = []) {
  const originalWx = global.wx
  const storage = new Map()
  if (arguments.length > 1) storage.set('craftWorks', storedWorks)
  const navigations = []

  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    getWindowInfo() { return { windowWidth: 390, windowHeight: 844, statusBarHeight: 44 } },
    getMenuButtonBoundingClientRect() { return { top: 52, bottom: 84, height: 32 } },
    navigateTo(options) { navigations.push(options.url) },
    switchTab(options) { navigations.push(options.url) }
  }

  t.after(() => { global.wx = originalWx })
  return { storage, navigations }
}

function loadWorkshopPage() {
  const originalPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  try {
    delete require.cache[require.resolve(pagePath)]
    require(pagePath)
  } finally {
    global.Page = originalPage
  }

  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    }
  }
}

test('workshop keeps one featured entry and two compact entries with suitable local artwork', () => {
  const data = require(path.join(root, 'data/workshop'))
  assert.deepEqual(data.entries.map((item) => item.id), ['craft', 'ai', 'works'])
  assert.equal(data.entries[0].image, '/assets/workshop/digital-craft.jpg')
  assert.equal(data.entries[1].image, '/assets/workshop/ai-creation-reference.jpg')
  assert.equal(data.entries[2].image, '/assets/workshop/my-works.jpg')
  assert.deepEqual(data.entries.map((item) => item.url), [
    '/pages/craft/index',
    '/pages/ai-create/index',
    '/pages/works/index'
  ])
  data.entries.forEach((item) => {
    assert.ok(fs.existsSync(path.join(root, item.image.slice(1))), `${item.image} is missing`)
  })
})

test('workshop renders a featured card, a two-card row and horizontal recent creations without more controls', () => {
  const template = fs.readFileSync(path.join(root, 'pages/workshop/index.wxml'), 'utf8')

  assert.match(template, /class="entry-card entry-primary"/)
  assert.match(template, /class="entry-pair"/)
  assert.match(template, /wx:for="\{\{secondaryEntries\}\}"/)
  assert.match(template, /<scroll-view[^>]+class="recent-scroll"[^>]+scroll-x="\{\{true\}\}"/)
  assert.match(template, /wx:if="\{\{recentWorks\.length\}\}"/)
  assert.match(template, /wx:else[^>]+class="recent-empty"/)
  assert.match(template, /暂无最近创作/)
  assert.doesNotMatch(template, /更多/)

})

test('recent creations refresh from local storage, reject malformed rows and sort newest first', (t) => {
  createEnvironment(t, [
    { id: 'older', name: '青花梅瓶', image: '/assets/ceramics/ming-blue-white-meiping.jpg', createdAt: '2026-08-18' },
    null,
    { id: 'broken' },
    { id: 'newer', name: '粉彩花鸟瓶', image: '/assets/ceramics/qing-famille-rose-vase.jpg', createdAt: '2026-09-02' },
    { id: 'no-cover', name: '未完成作品', image: '', createdAt: '2026-09-03' }
  ])
  const page = loadWorkshopPage()

  assert.equal(typeof page.onShow, 'function')
  page.onShow()

  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['newer', 'older'])
  assert.deepEqual(page.data.recentWorks.map((item) => item.displayDate), ['2026.09.02', '2026.08.18'])
})

test('missing, malformed or unreadable recent-work storage produces the designed empty state', (t) => {
  const { storage } = createEnvironment(t)
  let page = loadWorkshopPage()
  assert.doesNotThrow(() => page.onShow())
  assert.deepEqual(page.data.recentWorks, [])

  storage.set('craftWorks', 'malformed')
  page = loadWorkshopPage()
  assert.doesNotThrow(() => page.onShow())
  assert.deepEqual(page.data.recentWorks, [])

  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  page = loadWorkshopPage()
  assert.doesNotThrow(() => page.onShow())
  assert.deepEqual(page.data.recentWorks, [])
})

test('ready uses the rendered viewport when the initial tab window height is stale', (t) => {
  createEnvironment(t)
  global.wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 675, statusBarHeight: 44 })
  global.wx.createSelectorQuery = () => {
    const refs = []
    return {
      select(selector) {
        return { boundingClientRect() { refs.push({ height: 760, width: 390, top: 0, bottom: 760 }); return this } }
      },
      selectViewport() {
        return { boundingClientRect() { refs.push({ height: 760, width: 390, top: 0, bottom: 760 }); return this } }
      },
      exec(callback) { callback(refs) }
    }
  }
  const page = loadWorkshopPage()
  page.onLoad()
  assert.equal(typeof page.onReady, 'function', 'the native ready phase must remeasure the viewport')
  page.onReady()
  assert.equal(page.data.viewportHeight, 760)
  assert.ok(Math.abs(page.data.heroHeight + page.data.contentHeight - 760) < 0.01)
  assert.ok(page.data.contentHeight >= 944 * 390 / 750)
})

test('short native viewports retain natural content height for normal vertical scrolling', (t) => {
  createEnvironment(t)
  global.wx.getWindowInfo = () => ({ windowWidth: 320, windowHeight: 518, statusBarHeight: 20 })
  global.wx.getMenuButtonBoundingClientRect = () => ({ top: 26, height: 32, bottom: 58 })
  const page = loadWorkshopPage()
  page.onLoad()
  assert.ok(page.data.heroHeight + page.data.contentHeight > 518)
  assert.ok(Math.abs(page.data.contentHeight - 944 * 320 / 750) < 0.01)
})

test('viewport fallback uses an independent viewport probe instead of the content height', (t) => {
  createEnvironment(t)
  global.wx.createSelectorQuery = () => ({
    selectViewport() { return { boundingClientRect() { return this } } },
    select(selector) {
      this.selector = selector
      return { boundingClientRect() { return this } }
    },
    exec(callback) {
      callback([null, { width: 390, height: this.selector === '.workshop-viewport-probe' ? 760 : 844 }])
    }
  })
  const page = loadWorkshopPage()
  page.onLoad()
  page.onReady()
  assert.equal(page.data.viewportHeight, 760)
  assert.ok(Math.abs(page.data.heroHeight + page.data.contentHeight - 760) < 0.01)
})
