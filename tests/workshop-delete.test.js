const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const test = require('node:test')

const pageFile = path.resolve(__dirname, '../pages/workshop/index.js')
const work = (id) => ({ id, name: `作品${id}`, image: '/assets/workshop/ai-creation.jpg', createdAt: '2026-10-16' })
const event = (id) => ({ currentTarget: { dataset: { id } } })

function setup(t, local = []) {
  const previous = { wx: global.wx, Page: global.Page }
  const state = { collection: [...local], load: null, remove: null, loads: 0, deletes: [], modals: [], toasts: [], routes: [] }
  const storage = new Map([['craftWorks', local]])
  global.wx = {
    getStorageSync: (key) => storage.get(key) || '',
    setStorageSync: (key, value) => storage.set(key, value),
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 800, statusBarHeight: 44 }),
    showModal: (options) => state.modals.push(options),
    showToast: (options) => state.toasts.push(options.title),
    navigateTo: (options) => state.routes.push(options.url)
  }
  const helper = {
    async loadWorkCollection() { state.loads += 1; return state.load ? state.load() : [...state.collection] },
    async deleteWorkRecord(item) {
      state.deletes.push(item.id)
      if (state.remove) await state.remove(item)
      state.collection = state.collection.filter((row) => row.id !== item.id)
      storage.set('craftWorks', (storage.get('craftWorks') || []).filter((row) => row.id !== item.id))
      return true
    }
  }
  let definition
  const originalLoad = Module._load
  global.Page = (value) => { definition = value }
  Module._load = function(request, parent, main) {
    return request === '../../utils/work-collection' ? helper : originalLoad.call(this, request, parent, main)
  }
  try { delete require.cache[require.resolve(pageFile)]; require(pageFile) }
  finally { Module._load = originalLoad; global.Page = previous.Page }
  const page = { ...definition, data: structuredClone(definition.data), setData(update, callback) { Object.assign(this.data, update); if (callback) callback() } }
  t.after(() => { if (page.onUnload) page.onUnload(); Object.assign(global, previous) })
  return { page, state, storage }
}

test('workshop presents local work immediately and then merges all generated history into the collection', async (t) => {
  const { page, state } = setup(t, [work('local')])
  let release
  state.load = () => new Promise((resolve) => { release = resolve })
  const showing = page.onShow()
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['local'])
  assert.equal(state.loads, 1)
  release([work('cloud-a'), work('cloud-b'), work('local')])
  await showing
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['cloud-a', 'cloud-b', 'local'])
  assert.equal(page.data.workCount, 3)
  page.openWorks()
  assert.deepEqual(state.routes, ['/pages/works/index'])
})

test('each work deletion asks for confirmation and refreshes cards, count and final empty state', async (t) => {
  const { page, state } = setup(t, [work('local')])
  state.collection.push(work('cloud'))
  await page.onShow()
  const first = page.deleteWork(event('cloud'))
  assert.equal(state.modals.length, 1)
  assert.match(state.modals[0].content, /作品cloud/)
  assert.deepEqual(state.deletes, [])
  state.modals[0].success({ confirm: true })
  await first
  assert.deepEqual(state.deletes, ['cloud'])
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['local'])
  assert.equal(page.data.workCount, 1)
  const second = page.deleteWork(event('local'))
  state.modals[1].success({ confirm: true })
  await second
  assert.deepEqual(page.data.recentWorks, [])
  assert.equal(page.data.workCount, 0)
})

test('canceling or failing deletion preserves the list and failed deletion can be retried', async (t) => {
  const { page, state } = setup(t, [work('keep')])
  await page.onShow()
  const canceled = page.deleteWork(event('keep'))
  state.modals[0].success({ confirm: false })
  await canceled
  assert.deepEqual(state.deletes, [])
  state.remove = () => { throw new Error('unavailable') }
  const failing = page.deleteWork(event('keep'))
  state.modals[1].success({ confirm: true })
  await failing
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['keep'])
  assert.equal(page.data.workCount, 1)
  assert.match(state.toasts.at(-1), /删除失败/)
  state.remove = null
  const retry = page.deleteWork(event('keep'))
  state.modals[2].success({ confirm: true })
  await retry
  assert.equal(page.data.workCount, 0)
})

test('repeated deletion taps cannot open duplicate confirmations or repeat a pending deletion', async (t) => {
  const { page, state } = setup(t, [work('one')])
  await page.onShow()
  let release
  state.remove = () => new Promise((resolve) => { release = resolve })
  const deleting = page.deleteWork(event('one'))
  await page.deleteWork(event('one'))
  assert.equal(state.modals.length, 1)
  state.modals[0].success({ confirm: true })
  await new Promise((resolve) => setImmediate(resolve))
  await page.deleteWork(event('one'))
  assert.deepEqual(state.deletes, ['one'])
  release()
  await deleting
  assert.equal(page.data.workCount, 0)
})

test('a deletion confirmation from a hidden previous session cannot delete after returning', async (t) => {
  const { page, state } = setup(t, [work('keep')])
  await page.onShow()
  const pending = page.deleteWork(event('keep'))
  page.onHide()
  await page.onShow()
  state.modals[0].success({ confirm: true })
  await pending
  assert.deepEqual(state.deletes, [])
  assert.equal(page.data.workCount, 1)
})

test('a late pre-deletion cloud list cannot bring a removed card back', async (t) => {
  const { page, state } = setup(t, [work('old')])
  let releaseOld
  state.load = () => state.loads === 1 ? new Promise((resolve) => { releaseOld = resolve }) : state.collection
  const oldSync = page.onShow()
  const deleting = page.deleteWork(event('old'))
  state.modals[0].success({ confirm: true })
  await deleting
  assert.equal(page.data.workCount, 0)
  releaseOld([work('old')])
  await oldSync
  assert.equal(page.data.workCount, 0)
  assert.deepEqual(page.data.recentWorks, [])
})

test('a private image response from before deletion cannot repaint a removed work', async (t) => {
  const generated = { ...work('ai-old'), creationType: 'ai', source: 'generated', taskId: 'old', assetId: 'asset-old', fileId: 'cloud://old' }
  const { page, state } = setup(t, [generated])
  let releaseImage
  global.wx.cloud = { callFunction: () => new Promise((resolve) => { releaseImage = resolve }) }
  const oldSync = page.onShow()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(page.data.recentWorks[0].imageLoading, true)
  const deleting = page.deleteWork(event('ai-old'))
  state.modals[0].success({ confirm: true })
  await deleting
  releaseImage({ result: { ok: true, data: { assets: [{ assetId: 'asset-old', url: 'https://example.test/old.png' }] } } })
  await oldSync
  assert.deepEqual(page.data.recentWorks, [])
  assert.equal(page.data.workCount, 0)
})

test('cloud failure keeps local cards and exposes retry instead of claiming an empty history', async (t) => {
  const { page, state } = setup(t, [work('local')])
  state.load = () => { throw new Error('offline') }
  await page.onShow()
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['local'])
  assert.ok(page.data.workError)
  state.load = () => [work('cloud'), work('local')]
  await page.retryWorks()
  assert.equal(page.data.workError, '')
  assert.equal(page.data.workCount, 2)
})

test('returning after another page deleted a local work uses fresh storage even if cloud sync fails', async (t) => {
  const { page, state, storage } = setup(t, [work('removed'), work('keep')])
  await page.onShow()
  page.onHide()
  storage.set('craftWorks', [work('keep')])
  state.load = () => { throw new Error('offline') }
  await page.onShow()
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['keep'])
  assert.equal(page.data.workCount, 1)
  assert.ok(page.data.workError)
})

test('an old session confirmation neither blocks a new deletion nor clears its pending guard', async (t) => {
  const { page, state } = setup(t, [work('old'), work('current')])
  await page.onShow()
  const oldConfirmation = page.deleteWork(event('old'))
  page.onHide()
  await page.onShow()
  const currentConfirmation = page.deleteWork(event('current'))
  assert.equal(state.modals.length, 2)
  assert.equal(page.data.deletingWorkId, 'current')
  state.modals[0].success({ confirm: true })
  await oldConfirmation
  assert.deepEqual(state.deletes, [])
  assert.equal(page.data.deletingWorkId, 'current')
  await page.deleteWork(event('current'))
  assert.equal(state.modals.length, 2)
  state.modals[1].success({ confirm: true })
  await currentConfirmation
  assert.deepEqual(state.deletes, ['current'])
  assert.deepEqual(page.data.recentWorks.map((item) => item.id), ['old'])
})

test('delete controls have isolated tap handling, a labeled 44px target and a sync recovery entry', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/workshop/index.wxml'), 'utf8')
  const css = fs.readFileSync(path.resolve(__dirname, '../pages/workshop/index.wxss'), 'utf8')
  assert.match(wxml, /catchtap="deleteWork"/)
  assert.match(wxml, /data-id="\{\{item\.id\}\}"/)
  assert.match(wxml, /aria-label="删除/)
  assert.match(wxml, /bindtap="retryWorks"/)
  assert.match(wxml, /wx:elif="\{\{workError\}\}"/)
  assert.match(css, /\.recent-work-delete\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/)
})
