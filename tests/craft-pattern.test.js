const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages/craft/index.js')
const shapeIds = require('../data/shapes').map(({ id }) => id)

function createEnvironment(t, overrides = {}) {
  const originalWx = global.wx
  const originalPages = global.getCurrentPages
  const storage = new Map()
  const toasts = []
  const navigations = []
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    setStorageSync(key, value) { storage.set(key, value) },
    showToast(options) { toasts.push(options) },
    getWindowInfo() { return { windowWidth: 375, windowHeight: 812, statusBarHeight: 24 } },
    navigateTo(options) { navigations.push(['navigate', options.url]) },
    switchTab(options) { navigations.push(['tab', options.url]) },
    ...overrides
  }
  global.getCurrentPages = () => []
  t.after(() => {
    global.wx = originalWx
    global.getCurrentPages = originalPages
  })
  return { storage, toasts, navigations }
}

function loadCraftPage() {
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

const idEvent = (id) => ({ currentTarget: { dataset: { id } } })

test('pattern catalog defines six textures with two default choices', () => {
  const patterns = require(path.join(root, 'data/patterns'))
  assert.deepEqual(patterns.map(({ id, name, unlocked }) => [id, name, unlocked]), [
    ['pattern-lotus', '青花莲纹', true],
    ['pattern-cloud', '祥云纹', true],
    ['pattern-flower-bird', '花鸟纹', false],
    ['pattern-landscape', '山水纹', false],
    ['pattern-scroll-lotus', '缠枝莲纹', false],
    ['pattern-beast', '瑞兽纹', false]
  ])
  patterns.forEach((pattern) => {
    const name = pattern.id.slice('pattern-'.length)
    assert.equal(pattern.image, `/assets/craft/two-vessel-v2/cards/${name}.png`)
    assert.equal(pattern.texture, `/assets/patterns/craft-${name}.svg`)
    assert.deepEqual(pattern.previewImages, Object.fromEntries(shapeIds.map((shapeId) => [
      shapeId, `/assets/craft/two-vessel-v2/${shapeId}/${name}-preview.jpg`
    ])))
    assert.ok(pattern.description.length > 0)
    assert.equal(pattern.unlocked, pattern.sourceLevelId === null)
  })
})

test('every pattern has a local card, fallback texture and distinct previews for all six vessels', () => {
  const patterns = require(path.join(root, 'data/patterns'))
  const missing = []
  patterns.forEach((pattern) => {
    const previews = shapeIds.map((shapeId) => pattern.previewImages[shapeId])
    previews.forEach((preview, index) => {
      assert.equal(typeof preview, 'string', `${pattern.id} needs a ${shapeIds[index]} preview`)
    })
    assert.equal(new Set(previews).size, 6, `${pattern.id} must have a distinct preview for each vessel`)
    for (const image of [pattern.image, pattern.texture, ...previews]) {
      if (!fs.existsSync(path.join(root, image.slice(1)))) missing.push(image)
    }
  })
  assert.deepEqual(missing, [], `Missing craft images:\n${missing.join('\n')}`)
})

test('each shape supplies a clipped pattern overlay region', () => {
  const shapes = require(path.join(root, 'data/shapes'))
  shapes.forEach((shape) => {
    const overlay = shape.patternOverlay
    assert.ok(overlay, `${shape.id} needs patternOverlay`)
    for (const key of ['top', 'left', 'width', 'height']) {
      assert.ok(Number.isFinite(overlay[key]) && overlay[key] >= 0 && overlay[key] <= 100, `${shape.id}.${key}`)
    }
    assert.ok(overlay.left + overlay.width <= 100 && overlay.top + overlay.height <= 100)
    assert.equal(typeof overlay.radius, 'string')
    assert.match(overlay.clipPath, /^polygon\(/)
  })
  const bowl = shapes.find((shape) => shape.id === 'bowl').patternOverlay
  const meiping = shapes.find((shape) => shape.id === 'meiping').patternOverlay
  assert.ok(bowl.width > meiping.width && bowl.height < meiping.height)
})

test('next on step one saves the shape and enters pattern selection', (t) => {
  const { storage, toasts, navigations } = createEnvironment(t)
  const page = loadCraftPage()
  page.onLoad()
  page.selectShape(idEvent('yuhuchun'))
  page.next()
  assert.equal(page.data.currentStep, 1)
  assert.equal(page.data.selectedShape, 'yuhuchun')
  assert.equal(page.data.selectedPattern, 'pattern-lotus')
  assert.equal(page.data.selectedPatternItem.id, 'pattern-lotus')
  assert.equal(storage.get('craftDraft').selectedShape, 'yuhuchun')
  assert.deepEqual(navigations, [])
  assert.equal(toasts.length, 0)
})

test('pattern selection, previous step and final save keep both choices', (t) => {
  const { storage, toasts } = createEnvironment(t)
  storage.set('craftDraft', { glaze: 'celadon' })
  const page = loadCraftPage()
  page.onLoad()
  page.selectShape(idEvent('yuhuchun'))
  page.next()
  page.selectPattern(idEvent('pattern-cloud'))
  assert.equal(page.data.selectedPattern, 'pattern-cloud')
  assert.equal(page.data.selectedPatternItem.name, '祥云纹')
  page.previous()
  assert.equal(page.data.currentStep, 0)
  assert.equal(page.data.selectedShape, 'yuhuchun')
  assert.equal(page.data.selectedPattern, 'pattern-cloud')
  page.next()
  page.next()
  assert.equal(page.data.currentStep, 2)
  const draft = storage.get('craftDraft')
  assert.equal(draft.glaze, 'celadon')
  assert.equal(draft.selectedShape, 'yuhuchun')
  assert.equal(draft.selectedPattern, 'pattern-cloud')
  assert.equal(draft.currentStep, 2)
  assert.deepEqual(toasts, [])
})

test('locked, unknown and malformed pattern taps leave state unchanged', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadCraftPage()
  page.onLoad()
  page.next()
  const before = structuredClone(page.data)
  for (const event of [idEvent('pattern-beast'), idEvent('missing'), undefined, {}]) page.selectPattern(event)
  assert.deepEqual(page.data, before)
  assert.deepEqual(toasts.map((toast) => toast.title), ['完成对应挑战后即可解锁'])
})

test('locally unlocked patterns become selectable without mutating the catalog', (t) => {
  const { storage } = createEnvironment(t)
  storage.set('unlockedPatternIds', ['pattern-beast', 'unknown'])
  const page = loadCraftPage()
  page.onLoad()
  page.next()
  page.selectPattern(idEvent('pattern-beast'))
  assert.equal(page.data.selectedPattern, 'pattern-beast')
  assert.equal(page.data.patterns.find((item) => item.id === 'pattern-beast').unlocked, true)
  assert.equal(require(path.join(root, 'data/patterns')).find((item) => item.id === 'pattern-beast').unlocked, false)
})

test('drafts restore unlocked patterns and reject locked ones', (t) => {
  const { storage } = createEnvironment(t)
  storage.set('craftDraft', { selectedShape: 'yuhuchun', selectedPattern: 'pattern-cloud' })
  let page = loadCraftPage()
  page.onLoad()
  assert.equal(page.data.selectedPattern, 'pattern-cloud')
  storage.set('craftDraft', { selectedShape: 'yuhuchun', selectedPattern: 'pattern-landscape' })
  page = loadCraftPage()
  page.onLoad()
  assert.equal(page.data.selectedPattern, 'pattern-lotus')
})

test('storage failure keeps the user on the current step', (t) => {
  const { toasts } = createEnvironment(t, { setStorageSync() { throw new Error('full') } })
  const page = loadCraftPage()
  page.onLoad()
  page.next()
  assert.equal(page.data.currentStep, 0)
  page.setData({ currentStep: 1 })
  page.next()
  assert.equal(page.data.currentStep, 1)
  assert.equal(toasts.filter((toast) => toast.title === '保存失败，请重试').length, 2)
})

test('template renders a clipped live pattern step without extra viewer controls', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/craft/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(root, 'pages/craft/index.wxss'), 'utf8')
  for (const hook of ['selectedPatternItem.texture', 'patternOverlay', 'bindtap="selectPattern"', 'wx:for="{{patterns}}"', 'bindtap="previous"', 'src="{{previewImage}}"']) {
    assert.ok(wxml.includes(hook), `missing ${hook}`)
  }
  assert.doesNotMatch(wxml, /rotate|zoom|fullscreen|旋转|放大|全屏/)
  for (const hook of ['.pattern-surface', '.pattern-card', 'mix-blend-mode: multiply', 'overflow: hidden', '.craft-step-done']) {
    assert.ok(wxss.includes(hook), `missing ${hook}`)
  }
})
