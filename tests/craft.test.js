const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages/craft/index.js')

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
    getMenuButtonBoundingClientRect() { return { top: 30, bottom: 62, height: 32 } },
    navigateTo(options) { navigations.push(['navigate', options.url]) },
    switchTab(options) { navigations.push(['tab', options.url]) },
    navigateBack(options) { navigations.push(['back', options.delta]) },
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

function shapeEvent(id) {
  return { currentTarget: { dataset: { id } } }
}

function createLayoutQuery(rects) {
  return {
    select() { return this },
    boundingClientRect() { return this },
    exec(callback) { callback(rects) }
  }
}

test('shape catalog retains six named vessels with only meiping and yuhuchun available', () => {
  const shapesPath = path.join(root, 'data/shapes.js')
  assert.ok(fs.existsSync(shapesPath), 'shape catalog must exist')
  const shapes = require(shapesPath)
  assert.deepEqual(shapes.map(({ id, name, unlocked }) => [id, name, unlocked]), [
    ['meiping', '梅瓶', true],
    ['yuhuchun', '玉壶春瓶', true],
    ['vase', '花瓶', false],
    ['bowl', '瓷碗', false],
    ['garlic', '蒜头瓶', false],
    ['double-ear', '双耳尊', false]
  ])
  assert.equal(new Set(shapes.map((item) => item.id)).size, 6)
  shapes.forEach((item) => {
    assert.equal(item.image, `/assets/shapes/${item.id}.jpg`)
    assert.ok(fs.existsSync(path.join(root, item.image.slice(1))), `${item.image} is missing`)
    assert.equal(typeof item.description, 'string')
    assert.ok(item.description.trim().length > 0)
  })
})

test('craft begins at shape selection with a meiping preview and no next-page route', (t) => {
  createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(page.data.selectedShape, 'meiping')
  assert.equal(page.data.selectedShapeItem.id, 'meiping')
  assert.equal(page.data.shapes.length, 6)
  assert.deepEqual(page.data.steps, [
    { number: '01', name: '选择器型' },
    { number: '02', name: '选择纹样' },
    { number: '03', name: '选择釉色' },
    { number: '04', name: '完成作品' }
  ])
  assert.equal(page.data.currentStep, 0)
  assert.equal(page.data.selectedGlaze, 'glaze-white')
})

test('each vessel supplies a restrained shape-specific preview frame without changing its source', () => {
  const shapes = require(path.join(root, 'data/shapes'))
  shapes.forEach((shape) => {
    assert.ok(shape.preview, `${shape.id} needs a calibrated preview frame`)
    assert.ok(Number.isFinite(shape.preview.scale) && shape.preview.scale >= 1 && shape.preview.scale <= 1.5)
    assert.ok(Number.isFinite(shape.preview.offsetX) && Math.abs(shape.preview.offsetX) <= 10)
    assert.ok(Number.isFinite(shape.preview.offsetY) && Math.abs(shape.preview.offsetY) <= 10)
    assert.equal(shape.image, `/assets/shapes/${shape.id}.jpg`)
  })
  const bowl = shapes.find((shape) => shape.id === 'bowl')
  const meiping = shapes.find((shape) => shape.id === 'meiping')
  assert.ok(bowl.preview.scale > meiping.preview.scale, 'the broad bowl needs a stronger enlargement than the tall vase')
})

test('choosing another available vessel carries its calibrated preview frame with the selected id', (t) => {
  createEnvironment(t)
  const page = loadCraftPage()
  const shapes = require(path.join(root, 'data/shapes'))
  for (const shape of shapes.filter((item) => item.unlocked)) {
    page.selectShape(shapeEvent(shape.id))
    assert.equal(page.data.selectedShape, shape.id)
    assert.ok(page.data.selectedShapeItem.preview)
    assert.deepEqual(page.data.selectedShapeItem.preview, shape.preview)
  }
})

test('loading a valid draft restores the available shape and its preview', (t) => {
  const { storage } = createEnvironment(t)
  storage.set('craftDraft', { selectedShape: 'yuhuchun', pattern: 'lotus' })
  const page = loadCraftPage()
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad()
  assert.equal(page.data.selectedShape, 'yuhuchun')
  assert.equal(page.data.selectedShapeItem.name, '玉壶春瓶')
  assert.equal(storage.get('craftDraft').pattern, 'lotus')
})

test('loading locked, unknown or malformed drafts uses the default unlocked shape', (t) => {
  const { storage } = createEnvironment(t)
  for (const draft of [null, [], 'vase', {}, { selectedShape: 'garlic' }, { selectedShape: 'double-ear' }, { selectedShape: 'missing' }]) {
    storage.set('craftDraft', draft)
    const page = loadCraftPage()
    assert.equal(typeof page.onLoad, 'function')
    page.onLoad()
    assert.equal(page.data.selectedShape, 'meiping')
    assert.equal(page.data.selectedShapeItem.id, 'meiping')
  }
})

test('old vase and bowl drafts fall back to meiping and preserve available patterns and other draft fields', (t) => {
  const { storage } = createEnvironment(t)
  storage.set('unlockedPatternIds', ['pattern-beast'])
  for (const selectedShape of ['vase', 'bowl']) {
    for (const selectedPattern of ['pattern-cloud', 'pattern-beast']) {
      const draft = { selectedShape, selectedPattern, glaze: 'celadon', nested: { name: 'draft' }, customField: 'keep' }
      storage.set('craftDraft', draft)
      const page = loadCraftPage()
      page.onLoad()
      assert.equal(page.data.selectedShape, 'meiping')
      assert.equal(page.data.selectedShapeItem.id, 'meiping')
      assert.equal(page.data.selectedPattern, selectedPattern)
      assert.equal(page.data.selectedPatternItem.id, selectedPattern)
      assert.deepEqual(storage.get('craftDraft'), draft)
      page.next()
      for (const [key, value] of Object.entries({ ...draft, selectedShape: 'meiping' })) assert.deepEqual(storage.get('craftDraft')[key], value)
      page.next()
      for (const [key, value] of Object.entries({ ...draft, selectedShape: 'meiping' })) assert.deepEqual(storage.get('craftDraft')[key], value)
    }
  }
})

test('selecting an unlocked shape changes both the selected id and preview', (t) => {
  createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(typeof page.selectShape, 'function')
  page.selectShape(shapeEvent('yuhuchun'))
  assert.equal(page.data.selectedShape, 'yuhuchun')
  assert.equal(page.data.selectedShapeItem.name, '玉壶春瓶')
  assert.equal(page.data.selectedShapeItem.image, '/assets/shapes/yuhuchun.jpg')
})

test('locked shapes explain their challenge requirement without replacing the selection', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(typeof page.selectShape, 'function')
  page.selectShape(shapeEvent('yuhuchun'))
  const selected = structuredClone(page.data)
  for (const id of ['vase', 'bowl', 'garlic', 'double-ear']) {
    page.selectShape(shapeEvent(id))
    assert.deepEqual(page.data, selected)
  }
  assert.deepEqual(toasts.map(({ title, icon }) => [title, icon]), [
    ['完成对应挑战后即可解锁', 'none'],
    ['完成对应挑战后即可解锁', 'none'],
    ['完成对应挑战后即可解锁', 'none'],
    ['完成对应挑战后即可解锁', 'none']
  ])
})

test('unknown ids and malformed selection events are ignored', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(typeof page.selectShape, 'function')
  const before = structuredClone(page.data)
  for (const event of [undefined, {}, { currentTarget: {} }, shapeEvent('missing'), shapeEvent('')]) page.selectShape(event)
  assert.deepEqual(page.data, before)
  assert.deepEqual(toasts, [])
})

test('next saves the chosen shape while preserving draft keys and opens pattern selection', (t) => {
  const { storage, toasts, navigations } = createEnvironment(t)
  storage.set('craftDraft', { selectedShape: 'meiping', pattern: 'lotus', glaze: 'celadon', nested: { name: 'draft' } })
  const page = loadCraftPage()
  assert.equal(typeof page.selectShape, 'function')
  page.selectShape(shapeEvent('yuhuchun'))
  page.next()
  for (const [key, value] of Object.entries({ selectedShape: 'yuhuchun', pattern: 'lotus', glaze: 'celadon', nested: { name: 'draft' } })) assert.deepEqual(storage.get('craftDraft')[key], value)
  assert.equal(page.data.currentStep, 1)
  assert.deepEqual(navigations, [])
  assert.deepEqual(toasts, [])
})

test('next creates a fresh draft when storage has no existing draft', (t) => {
  const { storage } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(page.data.selectedShape, 'meiping')
  page.next()
  assert.equal(storage.get('craftDraft').selectedShape, 'meiping')
  assert.equal(storage.get('craftDraft').selectedGlaze, 'glaze-white')
  assert.equal(storage.get('craftDraft').currentStep, 1)
  assert.ok(storage.get('craftDraft').workId)
})

test('storage write failure does not announce success or open another page', (t) => {
  const { storage, toasts, navigations } = createEnvironment(t, {
    setStorageSync() { throw new Error('storage full') }
  })
  const page = loadCraftPage()
  assert.equal(page.data.currentStep, 0)
  page.data.nextStepUrl = '/pages/ai-create/index'
  assert.doesNotThrow(() => page.next())
  assert.equal(storage.has('craftDraft'), false)
  assert.equal(toasts.some((toast) => toast.title === '器型已保存'), false)
  assert.ok(toasts.some((toast) => /失败/.test(toast.title)))
  assert.deepEqual(navigations, [])
  assert.equal(page.data.currentStep, 0)
})

test('storage read failure restores a default preview and prevents overwriting an unread draft', (t) => {
  const { storage, toasts } = createEnvironment(t, {
    getStorageSync() { throw new Error('storage unavailable') }
  })
  const page = loadCraftPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.doesNotThrow(() => page.onLoad())
  assert.equal(page.data.selectedShape, 'meiping')
  assert.doesNotThrow(() => page.next())
  assert.equal(storage.has('craftDraft'), false)
  assert.equal(toasts.some((toast) => toast.title === '器型已保存'), false)
})

test('next never saves a locked or unknown selection even if page data was stale', (t) => {
  const { storage, navigations } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(page.data.currentStep, 0)
  for (const currentStep of [0, 1]) {
    for (const selectedShape of ['vase', 'bowl', 'garlic', 'double-ear', 'missing']) {
      page.setData({ selectedShape, currentStep })
      page.next()
      assert.equal(storage.has('craftDraft'), false)
      assert.equal(page.data.currentStep, currentStep)
    }
  }
  assert.equal(storage.has('craftDraft'), false)
  assert.deepEqual(navigations, [])
})

test('next completes the four internal steps without following a stale page hook', (t) => {
  const { storage, navigations } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(page.data.currentStep, 0)
  for (const nextStepUrl of ['https://example.com', 'pages/ai-create/index', '/pages/craft/index', '/invalid']) {
    page.data.nextStepUrl = nextStepUrl
    page.next()
  }
  assert.deepEqual(navigations, [])
  page.data.nextStepUrl = '/pages/ai-create/index'
  page.next()
  assert.equal(storage.get('craftDraft').selectedShape, 'meiping')
  assert.equal(storage.get('craftDraft').selectedPattern, 'pattern-lotus')
  assert.deepEqual(navigations, [])
  assert.equal(page.data.currentStep, 3)
})

test('native capsule metrics keep the brand below navigation and include the bottom safe area', (t) => {
  createEnvironment(t, {
    getWindowInfo() { return { windowWidth: 390, windowHeight: 844, statusBarHeight: 44, safeArea: { bottom: 810 } } },
    getMenuButtonBoundingClientRect() { return { top: 52, bottom: 84, height: 32 } }
  })
  const page = loadCraftPage()
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad()
  assert.equal(page.data.navTop, 52)
  assert.equal(page.data.navHeight, 32)
  assert.equal(page.data.statusBarHeight, 44)
  assert.ok(page.data.brandTop > 84)
  assert.equal(page.data.heroHeight, page.data.brandTop + 188 * 390 / 750)
  assert.equal(page.data.safeBottom, 34)
})

test('rendered button-to-tab gap is distributed into the preview and card photos', (t) => {
  const metrics = { windowWidth: 390, windowHeight: 756, statusBarHeight: 44, safeArea: { bottom: 810 } }
  let queryCount = 0
  createEnvironment(t, {
    getWindowInfo() { return metrics },
    createSelectorQuery() {
      queryCount += 1
      return createLayoutQuery([{ bottom: 705 }, { top: 755 }])
    }
  })
  const page = loadCraftPage()
  page.onLoad()
  assert.deepEqual(
    [page.data.previewHeight, page.data.shapeCoverHeight, page.data.shapeCardHeight],
    [400, 190, 344],
    'the page must wait for native layout instead of guessing from windowHeight'
  )
  page.onReady()
  assert.equal(queryCount, 1)
  assert.ok(page.data.previewHeight > 400)
  assert.ok(page.data.shapeCoverHeight > 190)
  assert.equal(page.data.shapeCardHeight - page.data.shapeCoverHeight, 154)
  const scale = metrics.windowWidth / 750
  const measuredSpareRpx = Math.floor((755 - 705 - 22 * scale) / scale)
  const addedRpx = page.data.previewHeight - 400 + page.data.shapeCardHeight - 344
  assert.equal(addedRpx, measuredSpareRpx, 'measured blank space must become visible content')
})

test('short screens retain readable minimum dimensions and normal page scrolling', (t) => {
  createEnvironment(t, {
    getWindowInfo() { return { windowWidth: 320, windowHeight: 568, statusBarHeight: 20 } },
    createSelectorQuery() { return createLayoutQuery([{ bottom: 571 }, { top: 523 }]) }
  })
  const page = loadCraftPage()
  page.onLoad()
  page.onReady()
  assert.equal(page.data.previewHeight, 400)
  assert.equal(page.data.shapeCoverHeight, 190)
  assert.equal(page.data.shapeCardHeight, 344)
})

test('unavailable or malformed native layout measurements retain base dimensions', (t) => {
  createEnvironment(t, { getWindowInfo() { return { windowWidth: 390, statusBarHeight: 44 } } })
  for (const rects of [undefined, null, [], [{ bottom: 705 }], [null, { top: 755 }], [{ bottom: 'bad' }, { top: 755 }]]) {
    global.wx.createSelectorQuery = () => createLayoutQuery(rects)
    const page = loadCraftPage()
    page.onLoad()
    assert.doesNotThrow(() => page.onReady())
    assert.equal(page.data.previewHeight, 400)
    assert.equal(page.data.shapeCoverHeight, 190)
    assert.equal(page.data.shapeCardHeight, 344)
  }
})

test('large measured gaps bound photo growth to preserve complete vessel contours', (t) => {
  createEnvironment(t, {
    getWindowInfo() { return { windowWidth: 375, windowHeight: 1100, statusBarHeight: 44 } },
    createSelectorQuery() { return createLayoutQuery([{ bottom: 600 }, { top: 1000 }]) }
  })
  const page = loadCraftPage()
  page.onLoad()
  page.onReady()
  assert.equal(page.data.previewHeight, 520)
  assert.equal(page.data.shapeCoverHeight, 230)
  assert.equal(page.data.shapeCardHeight, 384)
})

test('invalid or unavailable capsule APIs use status-bar-safe system metrics', (t) => {
  createEnvironment(t, {
    getWindowInfo: undefined,
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 812, statusBarHeight: 44 } }
  })
  for (const menu of [null, { top: 0, bottom: 32 }, { top: 20, height: 32 }, { top: 50, bottom: 45 }, { top: 50, height: -5 }]) {
    global.wx.getMenuButtonBoundingClientRect = () => menu
    const page = loadCraftPage()
    assert.equal(typeof page.onLoad, 'function')
    page.onLoad()
    assert.equal(page.data.statusBarHeight, 44)
    assert.equal(page.data.navTop, 50)
    assert.equal(page.data.navHeight, 32)
    assert.ok(page.data.brandTop > page.data.navTop + page.data.navHeight)
    assert.equal(page.data.heroHeight, page.data.brandTop + 94)
    assert.equal(page.data.safeBottom, 0)
  }
})

test('throwing window or capsule APIs fall back without crashing the shape page', (t) => {
  createEnvironment(t, {
    getWindowInfo() { throw new Error('unavailable') },
    getSystemInfoSync() { return { windowWidth: 375, statusBarHeight: 48 } },
    getMenuButtonBoundingClientRect() { throw new Error('unavailable') }
  })
  const page = loadCraftPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.doesNotThrow(() => page.onLoad())
  assert.equal(page.data.navTop, 54)
  assert.equal(page.data.navHeight, 32)
  assert.ok(page.data.brandTop > 86)
})

test('missing or malformed safe-area metrics do not add an oversized bottom spacer', (t) => {
  createEnvironment(t)
  for (const safeArea of [undefined, null, {}, { bottom: null }, { bottom: -1 }, { bottom: 900 }]) {
    global.wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 24, safeArea })
    const page = loadCraftPage()
    page.onLoad()
    assert.equal(page.data.safeBottom, 0)
  }
})

test('craft tab strip points to the five native tab pages and their local icons', (t) => {
  createEnvironment(t)
  const page = loadCraftPage()
  assert.ok(Array.isArray(page.data.tabs))
  assert.deepEqual(page.data.tabs.map(({ id, name, url }) => [id, name, url]), [
    ['home', '首页', '/pages/home/index'],
    ['museum', '瓷馆', '/pages/museum/index'],
    ['workshop', '工坊', '/pages/workshop/index'],
    ['challenge', '挑战', '/pages/challenge/index'],
    ['profile', '我的', '/pages/profile/index']
  ])
  page.data.tabs.forEach((tab) => {
    assert.equal(tab.icon, `/assets/icons/tab-${tab.id}.png`)
    assert.equal(tab.iconActive, `/assets/icons/tab-${tab.id}-active.png`)
  })
})

test('tab taps validate the supplied id or url before switching native tabs', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(typeof page.onTabTap, 'function')
  page.onTabTap(shapeEvent('museum'))
  page.onTabTap({ currentTarget: { dataset: { url: '/pages/challenge/index' } } })
  page.onTabTap(shapeEvent('missing'))
  page.onTabTap({ currentTarget: { dataset: { url: '/pages/ai-create/index' } } })
  page.onTabTap({})
  assert.deepEqual(navigations, [['tab', '/pages/museum/index'], ['tab', '/pages/challenge/index']])
})

test('back uses the native page stack and falls back to workshop for a direct entry', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadCraftPage()
  assert.equal(typeof page.goBack, 'function')
  global.getCurrentPages = () => [{ route: 'pages/workshop/index' }, { route: 'pages/craft/index' }]
  page.goBack()
  global.getCurrentPages = () => [{ route: 'pages/craft/index' }]
  page.goBack()
  assert.deepEqual(navigations, [['back', 1], ['tab', '/pages/workshop/index']])
})

test('workshop routes all three entry cards and digital ceramics opens step one', (t) => {
  const { navigations } = createEnvironment(t)
  const originalPage = global.Page
  const workshopPath = path.join(root, 'pages/workshop/index.js')
  let definition
  global.Page = (value) => { definition = value }
  try {
    delete require.cache[require.resolve(workshopPath)]
    require(workshopPath)
  } finally {
    global.Page = originalPage
  }
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(update) { Object.assign(this.data, update) }
  }
  page.selectEntry(shapeEvent('ai'))
  page.selectEntry(shapeEvent('works'))
  page.selectEntry(shapeEvent('unknown'))
  assert.deepEqual(navigations, [
    ['navigate', '/pages/ai-create/index'],
    ['navigate', '/pages/works/index']
  ])
  assert.equal(page.data.selectedEntryId, 'works')
  page.selectEntry(shapeEvent('craft'))
  assert.equal(page.data.selectedEntryId, 'craft')
  assert.deepEqual(navigations, [
    ['navigate', '/pages/ai-create/index'],
    ['navigate', '/pages/works/index'],
    ['navigate', '/pages/craft/index']
  ])
})
