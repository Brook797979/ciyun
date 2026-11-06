const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { completeChallenge } = require('../utils/challenge-rewards')
const { getCraftPreview } = require('../utils/craft-preview')

const pagePath = path.resolve(__dirname, '../pages/craft/index.js')
const tap = id => ({ currentTarget: { dataset: { id } } })

function environment(t) {
  const previous = global.wx
  const storage = new Map()
  const toasts = []
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)) },
    showToast(options) { toasts.push(options.title) },
    getWindowInfo() { return { windowWidth: 375, windowHeight: 812, statusBarHeight: 24 } }
  }
  t.after(() => { global.wx = previous })
  return { storage, toasts }
}

function loadPage() {
  const previous = global.Page
  let definition
  global.Page = value => { definition = value }
  try {
    delete require.cache[pagePath]
    require(pagePath)
  } finally { global.Page = previous }
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    }
  }
  page.onLoad()
  return page
}

function completeFirstChapter() {
  for (const id of ['level-001', 'level-002', 'level-003', 'level-004']) completeChallenge(id)
}

test('real first chapter rewards make bowl and vase selectable without changing the catalog', t => {
  const { storage, toasts } = environment(t)
  const catalog = require('../data/shapes')
  const before = structuredClone(catalog)
  completeFirstChapter()
  assert.deepEqual(storage.get('unlockedShapeIds'), ['bowl', 'vase'])
  const page = loadPage()
  for (const id of ['bowl', 'vase']) {
    assert.equal(page.data.shapes.find(item => item.id === id).unlocked, true)
    page.selectShape(tap(id))
    assert.equal(page.data.selectedShape, id)
    assert.equal(page.data.selectedShapeItem.id, id)
    assert.equal(page.data.selectedShapeItem.image, `/assets/shapes/${id}.jpg`)
  }
  for (const id of ['garlic', 'double-ear']) {
    assert.equal(page.data.shapes.find(item => item.id === id).unlocked, false)
    page.selectShape(tap(id))
    assert.equal(page.data.selectedShape, 'vase')
  }
  assert.ok(toasts.some(title => title.includes('挑战')))
  assert.deepEqual(catalog, before)
  assert.equal(page.data.patterns.find(item => item.id === 'pattern-scroll-lotus').unlocked, true)
  assert.equal(page.data.glazes.find(item => item.id === 'glaze-bean').unlocked, true)
})

test('onShow refreshes shape rewards while preserving an existing available selection', t => {
  environment(t)
  const page = loadPage()
  page.selectShape(tap('yuhuchun'))
  completeChallenge('level-001')
  assert.equal(page.data.shapes.find(item => item.id === 'bowl').unlocked, false)
  page.onShow()
  assert.equal(page.data.shapes.find(item => item.id === 'bowl').unlocked, true)
  assert.equal(page.data.selectedShape, 'yuhuchun')
  page.selectShape(tap('bowl'))
  page.onShow()
  assert.equal(page.data.selectedShape, 'bowl')
  assert.equal(page.data.selectedShapeItem.unlocked, true)
})

test('real shape rewards now continue through complete previews and save the unlocked vessel', t => {
  const { storage } = environment(t)
  completeFirstChapter()
  for (const id of ['bowl', 'vase']) {
    const page = loadPage()
    page.startAgain()
    page.selectShape(tap(id))
    assert.equal(page.data.selectedShape, id)
    assert.equal(page.data.previewUnavailable, false)
    page.next()
    assert.equal(page.data.currentStep, 1)
    page.selectPattern(tap('pattern-scroll-lotus'))
    page.next()
    page.selectGlaze(tap('glaze-bean'))
    page.next()
    assert.equal(page.data.currentStep, 3)
    assert.equal(page.data.previewImage, getCraftPreview(id, 'pattern-scroll-lotus', 'glaze-bean'))
    page.saveWork()
    assert.equal(page.data.saved, true)
  }
  const works = storage.get('craftWorks')
  assert.deepEqual(new Set(works.map(work => work.shapeId)), new Set(['bowl', 'vase']))
  for (const work of works) assert.equal(work.image, getCraftPreview(work.shapeId, 'pattern-scroll-lotus', 'glaze-bean'))
})

test('newly supported unlocked advanced drafts resume their existing step and retain other data', t => {
  const { storage } = environment(t)
  storage.set('unlockedShapeIds', ['bowl'])
  const draft = { selectedShape: 'bowl', currentStep: 3, customField: 'retain', selectedPattern: 'pattern-cloud' }
  storage.set('craftDraft', draft)
  const page = loadPage()
  assert.equal(page.data.selectedShape, 'bowl')
  assert.equal(page.data.currentStep, 3)
  assert.equal(page.data.previewUnavailable, false)
  assert.equal(page.data.previewImage, getCraftPreview('bowl', 'pattern-cloud', 'glaze-white'))
  assert.equal(page.data.selectedPattern, 'pattern-cloud')
  assert.deepEqual(storage.get('craftDraft'), draft)
})

test('malformed shape rewards keep the original defaults and reject locked drafts', t => {
  const { storage } = environment(t)
  for (const unlockedIds of [null, 'bowl', {}, []]) {
    storage.set('unlockedShapeIds', unlockedIds)
    storage.set('craftDraft', { selectedShape: 'bowl' })
    const page = loadPage()
    assert.equal(page.data.selectedShape, 'meiping')
    assert.equal(page.data.shapes.find(item => item.id === 'bowl').unlocked, false)
  }
})

test('both original shapes still advance through complete previews and save actual works', t => {
  const { storage } = environment(t)
  completeFirstChapter()
  for (const id of ['meiping', 'yuhuchun']) {
    const page = loadPage()
    page.startAgain()
    page.selectShape(tap(id))
    assert.equal(page.data.previewUnavailable, false)
    page.next()
    page.selectPattern(tap('pattern-scroll-lotus'))
    page.next()
    page.selectGlaze(tap('glaze-bean'))
    page.next()
    assert.equal(page.data.currentStep, 3)
    assert.equal(page.data.previewImage, getCraftPreview(id, 'pattern-scroll-lotus', 'glaze-bean'))
    page.saveWork()
    assert.equal(page.data.saved, true)
  }
  assert.deepEqual(new Set(storage.get('craftWorks').map(item => item.shapeId)), new Set(['meiping', 'yuhuchun']))
})
