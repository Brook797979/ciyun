const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const pagePath = path.resolve(__dirname, '../pages/craft/index.js')
const { getCraftPreview } = require('../utils/craft-preview')

function environment(t, overrides = {}) {
  const previous = global.wx
  const storage = new Map()
  const toasts = []
  const navigations = []
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)) },
    showToast(value) { toasts.push(value.title) },
    getWindowInfo() { return { windowWidth: 375, windowHeight: 812, statusBarHeight: 24 } },
    navigateTo({ url }) { navigations.push(url) },
    ...overrides
  }
  t.after(() => { global.wx = previous })
  return { storage, toasts, navigations }
}

function loadPage(options) {
  const original = global.Page
  let definition
  global.Page = value => { definition = value }
  try {
    delete require.cache[pagePath]
    require(pagePath)
  } finally { global.Page = original }
  const page = { ...definition, data: structuredClone(definition.data), setData(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback()
  } }
  page.onLoad(options)
  return page
}
const tap = id => ({ currentTarget: { dataset: { id } } })
const nameInput = value => ({ detail: { value } })
function finish(page) {
  page.next()
  page.next()
  page.next()
  assert.equal(page.data.currentStep, 3)
}

for (const shapeId of ['vase', 'bowl', 'garlic', 'double-ear']) {
  test(`locally unlocked ${shapeId} completes and reopens its selected pattern and glaze`, t => {
    const { storage, toasts } = environment(t)
    storage.set('unlockedShapeIds', [shapeId])
    storage.set('unlockedPatternIds', ['pattern-beast'])
    storage.set('unlockedGlazeIds', ['glaze-rouge'])
    let page = loadPage()
    page.selectShape(tap(shapeId))
    assert.equal(page.data.selectedShape, shapeId)
    page.next()
    assert.equal(page.data.currentStep, 1)
    page.selectPattern(tap('pattern-beast'))
    assert.equal(page.data.previewImage, `/assets/craft/two-vessel-v2/${shapeId}/beast-preview.jpg`)
    page.next()
    assert.equal(page.data.currentStep, 2)
    page.selectGlaze(tap('glaze-rouge'))
    const image = `/assets/craft/glazes-v1/${shapeId}/beast-rouge.jpg`
    assert.equal(page.data.previewImage, image)
    page.next()
    assert.equal(page.data.currentStep, 3)
    page.onNameInput(nameInput(`我的${page.data.selectedShapeItem.name}`))
    const name = page.data.workName
    page.saveWork()
    const saved = structuredClone(storage.get('craftWorks')[0])
    assert.equal(saved.shapeId, shapeId)
    assert.equal(saved.patternId, 'pattern-beast')
    assert.equal(saved.glazeId, 'glaze-rouge')
    assert.equal(saved.image, image)
    assert.equal(saved.name, name)
    page = loadPage()
    assert.equal(page.data.currentStep, 3)
    assert.equal(page.data.saved, true)
    assert.equal(page.data.workId, saved.id)
    assert.equal(page.data.workName, name)
    assert.equal(page.data.selectedShape, shapeId)
    assert.equal(page.data.selectedPattern, 'pattern-beast')
    assert.equal(page.data.selectedGlaze, 'glaze-rouge')
    assert.equal(page.data.previewImage, image)
    page.saveWork()
    assert.deepEqual(storage.get('craftWorks'), [saved])
    assert.deepEqual(toasts, ['作品已保存'])
  })
}

test('unknown and malformed shapes cannot advance or save even with stale page state', t => {
  const { storage, toasts } = environment(t)
  storage.set('unlockedShapeIds', ['missing', '../../meiping'])
  const page = loadPage()
  const original = structuredClone(page.data)
  for (const shapeId of ['missing', '../../meiping', null, {}]) {
    page.selectShape(tap(shapeId))
    assert.deepEqual(page.data, original)
    page.setData({ selectedShape: shapeId, currentStep: 0 })
    page.next()
    assert.equal(page.data.currentStep, 0)
    page.setData({ currentStep: 3 })
    page.saveWork()
    assert.equal(storage.has('craftDraft'), false)
    assert.equal(storage.has('craftWorks'), false)
    page.setData(structuredClone(original))
  }
  assert.deepEqual(toasts, [])
})

test('previously saved meiping and yuhuchun combinations reopen without changing their image or records', t => {
  const { storage } = environment(t)
  for (const shapeId of ['meiping', 'yuhuchun']) {
    for (const glazeId of ['glaze-white', 'glaze-sky']) {
      const image = glazeId === 'glaze-white'
        ? `/assets/craft/two-vessel-v2/${shapeId}/cloud-preview.jpg`
        : `/assets/craft/glazes-v1/${shapeId}/cloud-sky.jpg`
      const saved = { id: `existing-${shapeId}-${glazeId}`, name: '原来的作品', image,
        shapeId, patternId: 'pattern-cloud', glazeId, createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z', note: '保留旧记录' }
      storage.set('craftWorks', [saved])
      storage.set('craftDraft', { selectedShape: shapeId, selectedPattern: saved.patternId,
        selectedGlaze: glazeId, workId: saved.id, workName: saved.name, nameEdited: true, currentStep: 3 })
      const page = loadPage()
      assert.equal(page.data.currentStep, 3)
      assert.equal(page.data.saved, true)
      assert.equal(page.data.previewImage, image)
      page.saveWork()
      assert.deepEqual(storage.get('craftWorks'), [saved])
    }
  }
})

test('returning to pattern selection previews white porcelain while retaining the chosen glaze', t => {
  const { storage } = environment(t)
  const page = loadPage()
  page.next()
  page.selectPattern(tap('pattern-cloud'))
  page.next()
  page.selectGlaze(tap('glaze-sky'))
  const glazed = page.data.previewImage
  page.previous()
  assert.equal(page.data.currentStep, 1)
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-cloud'))
  assert.notEqual(page.data.previewImage, glazed)
  assert.equal(page.data.selectedGlaze, 'glaze-sky')
  assert.equal(storage.get('craftDraft').selectedGlaze, 'glaze-sky')
  page.selectPattern(tap('pattern-lotus'))
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-lotus'))
  page.onShow()
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-lotus'))
  page.next()
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-lotus', 'glaze-sky'))
  page.next()
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-lotus', 'glaze-sky'))
})

test('restoring a pattern-step draft keeps its glaze but displays only the selected pattern', t => {
  const { storage } = environment(t)
  storage.set('craftDraft', { selectedShape: 'yuhuchun', selectedPattern: 'pattern-cloud',
    selectedGlaze: 'glaze-sky', currentStep: 1 })
  const page = loadPage()
  assert.equal(page.data.previewImage, getCraftPreview('yuhuchun', 'pattern-cloud'))
  assert.equal(page.data.selectedGlaze, 'glaze-sky')
  page.next()
  assert.equal(page.data.previewImage, getCraftPreview('yuhuchun', 'pattern-cloud', 'glaze-sky'))
})

test('a white pattern-step preview does not change the saved state of the selected glazed work', t => {
  const { storage } = environment(t)
  const page = loadPage()
  page.next()
  page.next()
  page.selectGlaze(tap('glaze-sky'))
  page.next()
  page.onNameInput(nameInput('雨过天青'))
  page.saveWork()
  const record = structuredClone(storage.get('craftWorks')[0])
  page.previous()
  page.previous()
  assert.equal(page.data.previewImage, getCraftPreview('meiping', 'pattern-lotus'))
  assert.equal(page.data.saved, true)
  assert.equal(page.data.workName, '雨过天青')
  assert.deepEqual(storage.get('craftWorks')[0], record)
  page.next()
  page.next()
  assert.equal(page.data.previewImage, record.image)
  assert.equal(page.data.saved, true)
})

test('finish preview makes room for the information cards and keeps the actions above the tabbar', t => {
  environment(t, { createSelectorQuery() {
    return { select() { return this }, boundingClientRect() { return this },
      exec(callback) { callback([{ bottom: 750 }, { top: 702 }]) } }
  } })
  const page = loadPage()
  finish(page)
  assert.equal(page.data.previewHeight, 362)
  assert.equal(page.data.shapeCoverHeight, 190)
  assert.equal(page.data.shapeCardHeight, 344)
})

test('finish preview keeps its readable minimum when a short screen requires scrolling', t => {
  environment(t, { createSelectorQuery() {
    return { select() { return this }, boundingClientRect() { return this },
      exec(callback) { callback([{ bottom: 900 }, { top: 550 }]) } }
  } })
  const page = loadPage()
  finish(page)
  assert.equal(page.data.previewHeight, 360)
})

test('finish viewport fitting uses the rendered height and remains stable on repeated measurements', t => {
  let page
  let tabTop = 750
  environment(t, { createSelectorQuery() {
    return { select() { return this }, boundingClientRect() { return this },
      exec(callback) { callback([{ bottom: 650 + (page.data.previewHeight - 480) * 0.5 }, { top: tabTop }]) } }
  } })
  page = loadPage()
  finish(page)
  assert.equal(page.data.previewHeight, 658)
  page.fitFirstViewport()
  assert.equal(page.data.previewHeight, 658)
  tabTop = 720
  page.fitFirstViewport()
  assert.equal(page.data.previewHeight, 598)
  page.fitFirstViewport()
  assert.equal(page.data.previewHeight, 598)
})

test('a delayed finish measurement cannot change another step after backwards navigation', t => {
  const measurements = []
  environment(t, { createSelectorQuery() {
    return { select() { return this }, boundingClientRect() { return this },
      exec(callback) { measurements.push(callback) } }
  } })
  const page = loadPage()
  finish(page)
  page.previous()
  measurements[2]([{ bottom: 640 }, { top: 750 }])
  assert.equal(page.data.currentStep, 2)
  assert.equal(page.data.previewHeight, 400)
})

test('a finish measurement from an earlier visit cannot resize the current finish preview', t => {
  const measurements = []
  environment(t, { createSelectorQuery() {
    return { select() { return this }, boundingClientRect() { return this },
      exec(callback) { measurements.push(callback) } }
  } })
  const page = loadPage()
  finish(page)
  page.previous()
  page.next()
  measurements[4]([{ bottom: 750 }, { top: 702 }])
  assert.equal(page.data.previewHeight, 362)
  measurements[2]([{ bottom: 750 }, { top: 702 }])
  assert.equal(page.data.previewHeight, 362)
})

test('all four steps retain the actual vessel, pattern and glaze through backwards navigation', t => {
  environment(t)
  const page = loadPage()
  page.selectShape(tap('yuhuchun'))
  page.next()
  page.selectPattern(tap('pattern-cloud'))
  page.next()
  assert.equal(page.data.currentStep, 2)
  page.selectGlaze(tap('glaze-sky'))
  const image = page.data.previewImage
  assert.match(image, /yuhuchun\/cloud-sky\.jpg$/)
  page.next()
  assert.equal(page.data.currentStep, 3)
  assert.equal(page.data.previewImage, image)
  assert.match(page.data.workName, /天青.*祥云纹.*玉壶春瓶/)
  page.previous()
  page.previous()
  page.previous()
  assert.equal(page.data.selectedShape, 'yuhuchun')
  assert.equal(page.data.selectedPattern, 'pattern-cloud')
  assert.equal(page.data.selectedGlaze, 'glaze-sky')
})

test('glaze locks reject clicks and local unlock records enable only known glazes', t => {
  const { storage, toasts } = environment(t)
  const page = loadPage()
  page.selectGlaze(tap('glaze-cobalt'))
  page.selectGlaze(tap('missing'))
  page.selectGlaze({})
  assert.equal(page.data.selectedGlaze, 'glaze-white')
  assert.equal(toasts.length, 1)
  storage.set('unlockedGlazeIds', ['glaze-cobalt', 'missing'])
  page.onShow()
  page.selectGlaze(tap('glaze-cobalt'))
  assert.equal(page.data.selectedGlaze, 'glaze-cobalt')
  assert.equal(require('../data/glazes').find(item => item.id === 'glaze-cobalt').unlocked, false)
})

test('a reload restores the selected glaze, step, custom name and stable creation id', t => {
  const { storage } = environment(t)
  let page = loadPage()
  finish(page)
  page.previous()
  page.selectGlaze(tap('glaze-sky'))
  page.next()
  page.onNameInput(nameInput('雨过天青'))
  const id = page.data.workId
  page = loadPage()
  assert.equal(page.data.currentStep, 3)
  assert.equal(page.data.selectedGlaze, 'glaze-sky')
  assert.equal(page.data.workName, '雨过天青')
  assert.equal(page.data.workId, id)
  assert.equal(storage.get('craftDraft').workName, '雨过天青')
  page.previous()
  page.selectGlaze(tap('glaze-white'))
  assert.equal(page.data.workName, '雨过天青')
})

test('locked and malformed restored glaze choices fall back to white while preserving older draft keys', t => {
  const { storage } = environment(t)
  for (const selectedGlaze of ['glaze-cobalt', 'missing', null]) {
    storage.set('craftDraft', { selectedShape: 'yuhuchun', selectedPattern: 'pattern-cloud', selectedGlaze, glaze: 'legacy', currentStep: 2 })
    const page = loadPage()
    assert.equal(page.data.selectedGlaze, 'glaze-white')
    assert.equal(page.data.selectedShape, 'yuhuchun')
    page.next()
    assert.equal(storage.get('craftDraft').glaze, 'legacy')
  }
})

test('save, reload, duplicate click and later edits all retain one persistent work', t => {
  const { storage } = environment(t)
  let page = loadPage()
  finish(page)
  page.onNameInput(nameInput('  我的莲纹瓶  '))
  page.saveWork()
  page.saveWork()
  let works = storage.get('craftWorks')
  assert.equal(works.length, 1)
  assert.equal(works[0].name, '我的莲纹瓶')
  assert.equal(works[0].image, page.data.previewImage)
  assert.equal(works[0].shapeId, 'meiping')
  assert.equal(works[0].patternId, 'pattern-lotus')
  assert.equal(works[0].glazeId, 'glaze-white')
  const id = works[0].id
  const createdAt = works[0].createdAt
  page = loadPage()
  assert.equal(page.data.saved, true)
  page.saveWork()
  page.previous()
  page.selectGlaze(tap('glaze-sky'))
  assert.equal(page.data.saved, false)
  page.next()
  page.saveWork()
  works = storage.get('craftWorks')
  assert.equal(works.length, 1)
  assert.equal(works[0].id, id)
  assert.equal(works[0].createdAt, createdAt)
  assert.equal(works[0].glazeId, 'glaze-sky')
  assert.equal(works[0].name, '我的莲纹瓶')
})

test('starting another work creates a fresh draft without removing the saved work', t => {
  const { storage, navigations } = environment(t)
  const page = loadPage()
  finish(page)
  page.saveWork()
  const oldId = page.data.workId
  page.viewWorks()
  assert.deepEqual(navigations, ['/pages/works/index'])
  page.startAgain()
  assert.equal(page.data.currentStep, 0)
  assert.equal(page.data.saved, false)
  assert.notEqual(page.data.workId, oldId)
  assert.equal(page.data.selectedGlaze, 'glaze-white')
  assert.equal(storage.get('craftWorks').length, 1)
  assert.equal(storage.get('craftDraft').workId, page.data.workId)
  finish(page)
  page.saveWork()
  assert.equal(storage.get('craftWorks').length, 2)
})

test('a draft write failure blocks collection write and preserves the finish state', t => {
  const { storage, toasts } = environment(t)
  const page = loadPage()
  finish(page)
  page.onNameInput(nameInput('保留我的输入'))
  const originalSet = wx.setStorageSync
  wx.setStorageSync = (key, value) => { if (key === 'craftDraft') throw Error('full'); originalSet(key, value) }
  page.saveWork()
  assert.equal(storage.has('craftWorks'), false)
  assert.equal(page.data.saved, false)
  assert.equal(page.data.saving, false)
  assert.equal(page.data.currentStep, 3)
  assert.equal(page.data.workName, '保留我的输入')
  assert.ok(toasts.some(value => value.includes('失败')))
})

test('a collection write failure can be retried with the same persisted id', t => {
  const { storage } = environment(t)
  const page = loadPage()
  finish(page)
  const originalSet = wx.setStorageSync
  wx.setStorageSync = (key, value) => { if (key === 'craftWorks') throw Error('full'); originalSet(key, value) }
  page.saveWork()
  const id = storage.get('craftDraft').workId
  assert.equal(page.data.saved, false)
  wx.setStorageSync = originalSet
  const reopened = loadPage()
  reopened.saveWork()
  assert.equal(storage.get('craftWorks').length, 1)
  assert.equal(storage.get('craftWorks')[0].id, id)
})

test('blank names cannot be saved and stale locked selections cannot complete a work', t => {
  const { storage, toasts } = environment(t)
  const page = loadPage()
  finish(page)
  page.onNameInput(nameInput('   '))
  page.saveWork()
  assert.equal(storage.has('craftWorks'), false)
  assert.ok(toasts.some(value => value.includes('名称')))
  page.onNameInput(nameInput('作品'))
  page.data.selectedGlaze = 'glaze-rouge'
  page.saveWork()
  assert.equal(storage.has('craftWorks'), false)
})

test('starting anew when storage fails leaves the existing draft and saved result intact', t => {
  const { storage } = environment(t)
  const page = loadPage()
  finish(page)
  page.saveWork()
  const before = structuredClone(page.data)
  const draft = structuredClone(storage.get('craftDraft'))
  wx.setStorageSync = () => { throw Error('full') }
  page.startAgain()
  assert.equal(page.data.workId, before.workId)
  assert.equal(page.data.currentStep, 3)
  assert.equal(page.data.saved, true)
  assert.deepEqual(storage.get('craftDraft'), draft)
})
