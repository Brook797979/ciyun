const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const storePath = path.join(root, 'utils/craft-works.js')

function createEnvironment(t, initialWorks) {
  const originalWx = global.wx
  const storage = new Map()
  if (initialWorks !== undefined) storage.set('craftWorks', initialWorks)
  const navigations = []
  const toasts = []
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    setStorageSync(key, value) { storage.set(key, value) },
    navigateTo({ url }) { navigations.push(url) },
    switchTab({ url }) { navigations.push(url) },
    showToast(options) { toasts.push(options) }
  }
  t.after(() => { global.wx = originalWx })
  return { storage, navigations, toasts }
}

function loadStore() {
  assert.ok(fs.existsSync(storePath), 'the shared craftWorks store must be implemented')
  return require(storePath)
}

function loadPage(route) {
  const originalPage = global.Page
  const pagePath = path.join(root, `pages/${route}/index.js`)
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

function work(overrides = {}) {
  return {
    id: 'work-meiping', name: '青花梅瓶', image: '/assets/craft/works/meiping-lotus-celadon.jpg',
    shapeId: 'meiping', patternId: 'pattern-lotus', glazeId: 'celadon',
    shape: '梅瓶', pattern: '缠枝莲纹', glaze: '青釉', creationType: 'digital',
    ...overrides
  }
}

test('work ids remain distinct when several drafts begin in the same millisecond', (t) => {
  createEnvironment(t)
  const { createWorkId } = loadStore()
  t.mock.method(Date, 'now', () => 1791590400000)
  t.mock.method(Math, 'random', () => 0.5)
  const ids = Array.from({ length: 100 }, () => createWorkId())
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0))
  assert.equal(new Set(ids).size, ids.length)
})

test('works reads only complete covers and orders legacy and current records newest first', (t) => {
  const older = { id: 'legacy', name: '旧作', image: '/assets/old.jpg', createdAt: '2026-08-18' }
  const newer = work({ createdAt: '2026-10-10T08:00:00.000Z' })
  const original = [older, null, {}, work({ id: ' ', image: '/valid.jpg' }), work({ image: '' }), newer]
  createEnvironment(t, original)
  const { getWorks } = loadStore()
  assert.deepEqual(getWorks(), [newer, older])
  assert.deepEqual(original, [older, null, {}, work({ id: ' ', image: '/valid.jpg' }), work({ image: '' }), newer])
})

test('missing and malformed work collections read as empty', (t) => {
  const { storage } = createEnvironment(t)
  const { getWorks } = loadStore()
  assert.deepEqual(getWorks(), [])
  for (const value of [null, {}, 'invalid', 42]) {
    storage.set('craftWorks', value)
    assert.deepEqual(getWorks(), [])
  }
})

test('saving a new work persists its final image and all three selections', (t) => {
  const { storage } = createEnvironment(t)
  const { getWorks, saveWork } = loadStore()
  const input = work()
  const saved = saveWork(input)
  assert.deepEqual(saved, { ...input, createdAt: saved.createdAt, updatedAt: saved.updatedAt })
  assert.ok(Number.isFinite(Date.parse(saved.createdAt)))
  assert.equal(saved.createdAt, saved.updatedAt)
  assert.deepEqual(storage.get('craftWorks'), [saved])
  assert.deepEqual(getWorks(), [saved])
  assert.equal(input.createdAt, undefined, 'saving must not mutate the draft input')
})

test('saving the same id updates it once while preserving creation time and unrelated records', (t) => {
  const prior = work({ createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z', note: '保留' })
  const other = work({ id: 'other', name: '另一件', createdAt: '2026-09-04' })
  const legacyFragment = { id: 'unfinished-legacy', note: '保留旧记录' }
  const original = [other, prior, legacyFragment]
  const { storage } = createEnvironment(t, original)
  const { saveWork } = loadStore()
  const updated = saveWork(work({ name: '重新命名', glazeId: 'white', glaze: '白釉', createdAt: '2099-01-01' }))
  assert.equal(updated.createdAt, prior.createdAt)
  assert.equal(updated.note, prior.note)
  assert.notEqual(updated.updatedAt, prior.updatedAt)
  assert.equal(updated.name, '重新命名')
  assert.equal(updated.glazeId, 'white')
  const rows = storage.get('craftWorks')
  assert.equal(rows.filter(({ id }) => id === prior.id).length, 1)
  assert.deepEqual(rows.find(({ id }) => id === other.id), other)
  assert.deepEqual(rows.find(({ id }) => id === legacyFragment.id), legacyFragment)
  assert.deepEqual(original, [other, prior, legacyFragment])
  saveWork(work({ name: '再次保存' }))
  assert.equal(storage.get('craftWorks').length, 3)
})

test('unreadable storage is reported without replacing an existing collection', (t) => {
  const original = [work({ id: 'original' })]
  const { storage } = createEnvironment(t, original)
  const { getWorks, saveWork } = loadStore()
  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  assert.throws(() => getWorks(), /storage unavailable/)
  assert.throws(() => saveWork(work()), /storage unavailable/)
  assert.deepEqual(storage.get('craftWorks'), original)
})

test('failed writes leave all previously stored works unchanged', (t) => {
  const original = [work({ name: '原来的名称', createdAt: '2026-09-02' })]
  const { storage } = createEnvironment(t, original)
  const { saveWork } = loadStore()
  global.wx.setStorageSync = () => { throw new Error('storage full') }
  assert.throws(() => saveWork(work({ name: '新名称' })), /storage full/)
  assert.deepEqual(storage.get('craftWorks'), original)
})

test('saving refuses malformed collections and incomplete work records', (t) => {
  const { storage } = createEnvironment(t, { old: 'unreadable collection' })
  const { saveWork } = loadStore()
  assert.throws(() => saveWork(work()))
  assert.deepEqual(storage.get('craftWorks'), { old: 'unreadable collection' })
  storage.set('craftWorks', [])
  for (const invalid of [null, {}, work({ id: '' }), work({ name: ' ' }), work({ image: '' })]) {
    assert.throws(() => saveWork(invalid))
    assert.deepEqual(storage.get('craftWorks'), [])
  }
})

test('works page refreshes the saved collection whenever it becomes visible', (t) => {
  const { storage } = createEnvironment(t, [work({ createdAt: '2026-10-10' }), { id: 'broken' }])
  const page = loadPage('works')
  assert.deepEqual(page.data.works, [], 'the page must not start with sample works')
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  assert.deepEqual(page.data.works.map(({ id }) => id), ['work-meiping'])
  storage.set('craftWorks', [work({ id: 'next', name: '新作品' })])
  page.onShow()
  assert.deepEqual(page.data.works.map(({ id }) => id), ['next'])
  storage.set('craftWorks', [])
  page.onShow()
  assert.deepEqual(page.data.works, [])
})

test('works page retains its last list after a read failure and can retry', (t) => {
  createEnvironment(t, [work()])
  const page = loadPage('works')
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  const lastWorks = structuredClone(page.data.works)
  const originalRead = global.wx.getStorageSync
  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  assert.doesNotThrow(() => page.onShow())
  assert.equal(page.data.loadError, true)
  assert.deepEqual(page.data.works, lastWorks)
  global.wx.getStorageSync = originalRead
  page.onShow()
  assert.equal(page.data.loadError, false)
})

test('the empty collection offers a direct route to digital crafting', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadPage('works')
  assert.equal(typeof page.startCraft, 'function')
  page.startCraft()
  assert.deepEqual(navigations, ['/pages/craft/index?new=1'])
  const template = fs.readFileSync(path.join(root, 'pages/works/index.wxml'), 'utf8')
  assert.match(template, /bindtap="startCraft"/)
  assert.match(template, /src="\{\{item\.image\}\}"[^>]*mode="aspectFit"/)
  assert.match(template, /暂无作品/)
})

test('profile refreshes the current original-work count independently of cumulative growth', (t) => {
  const { storage, navigations } = createEnvironment(t, [...Array.from({ length: 10 }, (_, index) => work({ id: `earned-work-${index}` })), { id: 'broken' }])
  const page = loadPage('profile')
  assert.equal(page.data.footprints.ownWorks, 0)
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  assert.equal(page.data.footprints.ownWorks, 10)
  page.openFootprint({ currentTarget: { dataset: { kind: 'works' } } })
  assert.deepEqual(navigations, ['/pages/works/index'])
  storage.set('craftWorks', [])
  page.onShow()
  assert.equal(page.data.footprints.ownWorks, 0)
  assert.ok(page.data.badges.find(({ id }) => id === 'craft').unlocked)
})

test('profile keeps the last known work count if storage cannot be read', (t) => {
  createEnvironment(t, [work()])
  const page = loadPage('profile')
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  assert.doesNotThrow(() => page.onShow())
  assert.equal(page.data.footprints.ownWorks, 1)
})

test('recent-work cards lead to the saved collection', (t) => {
  const { navigations } = createEnvironment(t, [work()])
  const page = loadPage('workshop')
  assert.equal(typeof page.openWorks, 'function')
  page.openWorks()
  assert.deepEqual(navigations, ['/pages/works/index'])
  const template = fs.readFileSync(path.join(root, 'pages/workshop/index.wxml'), 'utf8')
  assert.match(template, /class="recent-work-card"[^>]+bindtap="openWorks"/)
})

test('recent works show concise dates for ISO saves and preserve the last list on read failure', (t) => {
  createEnvironment(t, [work({ createdAt: '2026-10-10T08:00:00.000Z' })])
  const page = loadPage('workshop')
  page.onShow()
  assert.equal(page.data.recentWorks[0].displayDate, '2026.10.10')
  const lastWorks = structuredClone(page.data.recentWorks)
  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  assert.doesNotThrow(() => page.onShow())
  assert.deepEqual(page.data.recentWorks, lastWorks)
})
