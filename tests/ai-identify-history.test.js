const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const result = { status: 'recognized', shape: '碗', category: '青瓷', patterns: ['莲瓣'], glazeDescription: '天青釉', technique: '施釉烧制', observations: ['莲瓣形口沿'], cultureIntro: '莲瓣造型取意自然。' }
function historyModule() {
  const file = path.join(root, 'utils/ai-identify-history.js')
  assert.ok(fs.existsSync(file), '识瓷历史模块应已实现')
  return require(file)
}
function platform(storage = new Map()) {
  return { storage, getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, structuredClone(value)) }
}
function record(n = 1, extra = {}) { return { requestId: `request-${n}`, assetId: `asset-${n}`, result, createdAt: n * 1000, ...extra } }
function deferred() { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function harness(options = {}) {
  const file = path.join(root, 'pages/ai-identify-history/index.js')
  assert.ok(fs.existsSync(file), '识瓷历史页面应已实现')
  let definition
  const wx = { ...platform(options.storage), getWindowInfo: () => ({ windowHeight: 844, statusBarHeight: 44, safeArea: { bottom: 810 } }), getMenuButtonBoundingClientRect: () => ({ top: 52, height: 32 }), navigateTo: config => nav.push(config.url), navigateBack: () => nav.push('back'), redirectTo: config => nav.push(config.url), ...options.wx }
  const batches = []; const nav = []; const writes = []
  const service = { async resolveAssets(ids) { batches.push(Array.from(ids)); return options.resolveAssets ? options.resolveAssets(ids) : ids.map(assetId => ({ assetId, url: `https://private.example/${assetId}.jpg` })) }, callAI() { assert.fail('历史页不得调用模型') }, uploadImage() { assert.fail('历史页不得上传图片') } }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value }, wx, getCurrentPages: () => options.stack || [], require: id => id === '../../utils/cloud-service' ? { createCloudService: () => service } : require(path.resolve(root, 'pages/ai-identify-history', id)) })
  const page = { ...definition, data: structuredClone(definition.data), setData(update) { writes.push(structuredClone(update)); Object.assign(this.data, update) } }
  page.onLoad()
  return { page, wx, batches, nav, writes }
}
const tap = id => ({ currentTarget: { dataset: { id } } })

test('removing one local record preserves other records and survives a restarted service', () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx)
  const first = history.save(record(1)); const second = history.save(record(2))
  assert.equal(typeof history.remove, 'function')
  wx.cloud = { deleteFile() { assert.fail('删除历史不得删除云端照片') } }
  assert.equal(history.remove(first.id), true)
  assert.deepEqual(createIdentifyHistory(wx).list().map(item => item.id), [second.id])
  assert.equal(history.remove(second.id), true); assert.deepEqual(history.list(), [])
})
test('removing an unknown id is harmless and storage failures retain the original records', () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1))
  assert.equal(typeof history.remove, 'function')
  const original = structuredClone(wx.storage.get(STORAGE_KEY)); let writes = 0
  wx.setStorageSync = () => { writes += 1; throw new Error('locked') }
  assert.equal(history.remove('missing'), false); assert.equal(history.remove(''), false); assert.equal(writes, 0)
  assert.throws(() => history.remove(saved.id), /删除失败/); assert.deepEqual(wx.storage.get(STORAGE_KEY), original)
  wx.getStorageSync = () => { throw new Error('locked') }
  assert.throws(() => history.remove(saved.id), /读取失败/); assert.equal(writes, 1)
})
test('canceling deletion preserves the selected record, preview, and local storage', async () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1)); const modals = []
  const { page, nav } = harness({ storage: wx.storage, wx: { showModal(config) { modals.push(config); config.success({ confirm: false }) } } }); await page.onShow()
  assert.equal(typeof page.deleteRecord, 'function')
  const original = structuredClone(page.data.records); const stored = structuredClone(wx.storage.get(STORAGE_KEY))
  await page.deleteRecord(tap(saved.id))
  assert.deepEqual(structuredClone(page.data.records), original); assert.deepEqual(wx.storage.get(STORAGE_KEY), stored); assert.deepEqual(nav, [])
  assert.equal(modals.length, 1); assert.match(modals[0].content, /删除|恢复/); assert.equal(page.data.deletingId, '')
})
test('confirmed deletion removes only its selected local record and handles the last-record empty state', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const first = history.save(record(1)); const second = history.save(record(2))
  const { page, batches, nav } = harness({ storage: wx.storage, wx: { showModal(config) { config.success({ confirm: true }) } } }); await page.onShow()
  assert.equal(typeof page.deleteRecord, 'function')
  const originalSecond = structuredClone(page.data.records[0]); await page.deleteRecord(tap(first.id))
  assert.equal(page.data.records.length, 1); assert.deepEqual(structuredClone(page.data.records[0]), originalSecond); assert.equal(history.get(first.id), null)
  assert.equal(batches.length, 1); assert.deepEqual(nav, [])
  await page.deleteRecord(tap(second.id)); assert.equal(page.data.records.length, 0); assert.equal(page.data.loadingImages, false); assert.deepEqual(history.list(), [])
})
test('rapid deletion taps share one confirmation and cannot delete a second selected record', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const first = history.save(record(1)); const second = history.save(record(2)); let modal; let count = 0
  const { page, nav } = harness({ storage: wx.storage, wx: { showModal(config) { modal = config; count += 1 } } }); await page.onShow()
  assert.equal(typeof page.deleteRecord, 'function')
  const a = page.deleteRecord(tap(first.id)); const b = page.deleteRecord(tap(first.id)); const c = page.deleteRecord(tap(second.id)); page.openRecord(tap(second.id))
  assert.equal(a, b); assert.equal(a, c); assert.equal(count, 1); assert.deepEqual(nav, [])
  modal.success({ confirm: true }); await Promise.all([a, b, c]); assert.deepEqual(history.list().map(item => item.id), [second.id]); assert.equal(page.data.deletingId, '')
})
test('failed deletion displays an inline error and preserves the currently visible history', async () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform(); const saved = createIdentifyHistory(wx).save(record(1))
  const { page, wx: pageWx } = harness({ storage: wx.storage, wx: { showModal(config) { config.success({ confirm: true }) } } }); await page.onShow()
  assert.equal(typeof page.deleteRecord, 'function')
  const original = structuredClone(page.data.records); const stored = structuredClone(wx.storage.get(STORAGE_KEY))
  pageWx.setStorageSync = () => { throw new Error('locked') }; await page.deleteRecord(tap(saved.id))
  assert.deepEqual(structuredClone(page.data.records), original); assert.deepEqual(wx.storage.get(STORAGE_KEY), stored); assert.match(page.data.deleteError, /删除失败/); assert.equal(page.data.error, ''); assert.equal(page.data.deletingId, '')
})
test('a failed or unavailable confirmation never removes a local record', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1))
  for (const showModal of [undefined, config => config.fail({ errMsg: 'unavailable' }), () => { throw new Error('unavailable') }]) {
    const { page } = harness({ storage: wx.storage, wx: { showModal } }); await page.onShow(); assert.equal(typeof page.deleteRecord, 'function')
    await page.deleteRecord(tap(saved.id)); assert.equal(history.list().length, 1); assert.equal(page.data.records.length, 1); assert.match(page.data.deleteError, /确认|删除/); assert.equal(page.data.deletingId, '')
  }
})
test('promise-based confirmation can delete a record without callback delivery', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1))
  const { page } = harness({ storage: wx.storage, wx: { showModal: () => Promise.resolve({ confirm: true }) } }); await page.onShow(); assert.equal(typeof page.deleteRecord, 'function')
  await page.deleteRecord(tap(saved.id)); assert.deepEqual(history.list(), []); assert.equal(page.data.records.length, 0)
})
test('confirmation delivered after leaving the history page cannot delete or update its records', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1))
  for (const lifecycle of ['onHide', 'onUnload']) {
    let modal; const { page, writes } = harness({ storage: wx.storage, wx: { showModal(config) { modal = config } } }); await page.onShow(); assert.equal(typeof page.deleteRecord, 'function')
    const pending = page.deleteRecord(tap(saved.id)); page[lifecycle](); const count = writes.length; modal.success({ confirm: true }); await pending
    assert.equal(history.list().length, 1); assert.equal(writes.length, count)
  }
})
test('a pending image refresh cannot restore a deleted history card', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); const saved = history.save(record(1)); const wait = deferred()
  const { page } = harness({ storage: wx.storage, resolveAssets: () => wait.promise, wx: { showModal(config) { config.success({ confirm: true }) } } })
  const refreshing = page.onShow(); assert.equal(typeof page.deleteRecord, 'function'); await page.deleteRecord(tap(saved.id))
  wait.resolve([{ assetId: saved.assetId, url: 'https://private.example/late.jpg' }]); await refreshing
  assert.equal(page.data.records.length, 0); assert.equal(page.data.loadingImages, false); assert.deepEqual(history.list(), [])
})
test('history delete entry catches taps before they reach the result card', () => {
  const markup = fs.readFileSync(path.join(root, 'pages/ai-identify-history/index.wxml'), 'utf8')
  assert.match(markup, /<button[^>]*data-id="\{\{item\.id\}\}"[^>]*catchtap="deleteRecord"[^>]*>/)
  assert.match(markup, /\{\{deleteError\}\}/)
  assert.match(markup, /'删除记录'/)
})
test('malformed or unknown delete taps do not open a confirmation or change history', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx); history.save(record(1)); let count = 0
  const { page } = harness({ storage: wx.storage, wx: { showModal() { count += 1 } } }); await page.onShow()
  for (const event of [undefined, {}, { currentTarget: {} }, tap('missing')]) await page.deleteRecord(event)
  assert.equal(count, 0); assert.equal(history.list().length, 1); assert.equal(page.data.records.length, 1)
})

test('completed results survive a restarted history service without persisting temporary previews', () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform()
  const saved = createIdentifyHistory(wx).save(record(1, { imagePath: 'wxfile://tmp-photo.jpg', fileId: 'cloud://private/photo.jpg' }))
  const restarted = createIdentifyHistory(wx)
  assert.equal(restarted.get(saved.id).fileId, 'cloud://private/photo.jpg')
  assert.deepEqual(restarted.get(saved.id).result, result)
  assert.ok(!restarted.get(saved.id).imagePath)
  saved.result.shape = 'changed'
  assert.equal(restarted.get(saved.id).result.shape, '碗')
  assert.equal(restarted.get('missing'), null)
})
test('saving the same request updates its result once while preserving its identity and completion time', () => {
  const { createIdentifyHistory } = historyModule(); const history = createIdentifyHistory(platform())
  const first = history.save(record(1))
  const second = history.save(record(1, { createdAt: 9000, result: { ...result, name: '莲瓣碗' } }))
  assert.equal(second.id, first.id); assert.equal(second.createdAt, first.createdAt)
  assert.equal(history.list().length, 1); assert.equal(history.list()[0].result.name, '莲瓣碗')
})
test('colliding supplied and generated record ids never hide a different request', () => {
  const { createIdentifyHistory } = historyModule(); const history = createIdentifyHistory(platform())
  history.save(record(1, { id: 'identify-request-1' }))
  history.save(record(2, { id: 'identify-request-3' }))
  const third = history.save(record(3, { id: 'identify-request-1' }))
  const records = history.list()
  assert.equal(records.length, 3); assert.equal(new Set(records.map(item => item.id)).size, 3)
  assert.equal(history.get(third.id).requestId, 'request-3')
})
test('history retains the latest 100 records in descending completion order', () => {
  const { createIdentifyHistory } = historyModule(); const history = createIdentifyHistory(platform())
  for (let n = 105; n >= 1; n -= 1) history.save(record(n))
  const items = history.list()
  assert.equal(items.length, 100); assert.equal(items[0].requestId, 'request-105'); assert.equal(items[99].requestId, 'request-6')
})
test('corrupt entries and saved showcase data are skipped while valid older result structures remain readable', () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform()
  wx.storage.set(STORAGE_KEY, [null, 'broken', {}, record(4, { result: null }), record(5, { source: 'showcase' }), record(6, { result: { status: 'unknown' } }), record(2), record(1), record(2, { createdAt: 5000 })])
  assert.deepEqual(createIdentifyHistory(wx).list().map(item => item.requestId), ['request-2', 'request-1'])
  wx.storage.set(STORAGE_KEY, '{invalid-json')
  assert.deepEqual(createIdentifyHistory(wx).list(), [])
})
test('showcase or invalid records cannot be written as real identification history', () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx)
  assert.throws(() => history.save(record(1, { mode: 'showcase' })), /记录|案例/)
  assert.throws(() => history.save(record(1, { assetId: '' })), /记录/)
  assert.throws(() => history.save(record(1, { requestId: '' })), /记录/)
  assert.equal(wx.storage.size, 0)
})
test('corrupt dates and invalid Unicode ids cannot prevent other history entries from loading', () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform()
  wx.storage.set(STORAGE_KEY, [record(1), record(2, { createdAt: 1e30 }), record(3, { requestId: '\ud800' }), record(4, { id: '\ud800' })])
  assert.deepEqual(createIdentifyHistory(wx).list().map(item => item.requestId), ['request-1'])
})
test('read failure is surfaced and never overwrites unreadable history', () => {
  const { createIdentifyHistory, STORAGE_KEY } = historyModule(); const wx = platform(); const preserved = [record(1)]
  wx.storage.set(STORAGE_KEY, preserved); wx.getStorageSync = () => { throw new Error('storage locked') }
  const history = createIdentifyHistory(wx)
  assert.throws(() => history.list(), /读取失败/)
  assert.throws(() => history.save(record(2)), /读取失败/)
  assert.deepEqual(wx.storage.get(STORAGE_KEY), preserved)
})
test('write failure throws without pretending that a record was saved', () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); wx.setStorageSync = () => { throw new Error('quota exceeded') }
  assert.throws(() => createIdentifyHistory(wx).save(record(1)), /保存失败/)
  assert.equal(wx.storage.size, 0)
})
test('empty history and local read failure provide distinct page states', async () => {
  const empty = harness(); await empty.page.onShow()
  assert.equal(empty.page.data.records.length, 0); assert.equal(empty.page.data.error, ''); assert.equal(empty.batches.length, 0)
  const failed = harness({ wx: { getStorageSync() { throw new Error('locked') } } }); await failed.page.onShow()
  assert.match(failed.page.data.error, /读取失败/); assert.equal(failed.page.data.loading, false)
})
test('reopened history resolves stable asset ids before displaying images and keeps old result summaries', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const saved = createIdentifyHistory(wx).save(record(1))
  const { STORAGE_KEY } = historyModule(); wx.storage.get(STORAGE_KEY)[0].imagePath = 'https://private.example/expired?sign=old'
  const wait = deferred(); const { page, batches } = harness({ storage: wx.storage, resolveAssets: () => wait.promise })
  const pending = page.onShow()
  assert.equal(page.data.records[0].imagePath, ''); assert.deepEqual(batches, [['asset-1']])
  wait.resolve([{ assetId: 'asset-1', url: 'https://private.example/fresh.jpg' }]); await pending
  assert.equal(page.data.records[0].imagePath, 'https://private.example/fresh.jpg')
  assert.equal(page.data.records[0].title, '青瓷碗'); assert.equal(page.data.records[0].id, saved.id)
})
test('history image recovery splits asset requests into batches of at most 20', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx)
  for (let n = 1; n <= 43; n += 1) history.save(record(n))
  const { page, batches } = harness({ storage: wx.storage }); await page.onShow()
  assert.deepEqual(batches.map(batch => batch.length), [20, 20, 3])
  assert.ok(page.data.records.every(item => item.imagePath.startsWith('https://')))
})
test('missing previews show a recoverable placeholder while retaining their analysis', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); createIdentifyHistory(wx).save(record(1))
  let count = 0; const { page } = harness({ storage: wx.storage, resolveAssets: ids => { if (++count === 1) throw new Error('offline'); return ids.map(assetId => ({ assetId, url: 'https://private.example/retry.jpg' })) } })
  await page.onShow()
  assert.equal(page.data.records[0].imagePath, ''); assert.match(page.data.records[0].imageWarning, /图片|重试/); assert.equal(page.data.records[0].title, '青瓷碗')
  await page.retryImages(tap(page.data.records[0].id))
  assert.equal(page.data.records[0].imagePath, 'https://private.example/retry.jpg'); assert.equal(page.data.records[0].imageWarning, '')
})
test('a native image error clears an expired image and can resolve it again', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); createIdentifyHistory(wx).save(record(1))
  const { page, batches } = harness({ storage: wx.storage }); await page.onShow()
  const current = page.data.records[0]
  page.onImageError({ currentTarget: { dataset: { id: current.id, url: current.imagePath } } })
  assert.equal(page.data.records[0].imagePath, ''); assert.ok(page.data.records[0].imageWarning)
  await page.retryImages(tap(current.id)); assert.equal(batches.length, 2); assert.ok(page.data.records[0].imagePath)
})
test('image resolutions completing after hide or unload cannot update the departed page', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); createIdentifyHistory(wx).save(record(1))
  for (const lifecycle of ['onHide', 'onUnload']) {
    const wait = deferred(); const { page, writes } = harness({ storage: wx.storage, resolveAssets: () => wait.promise })
    const pending = page.onShow(); page[lifecycle](); const count = writes.length
    wait.resolve([{ assetId: 'asset-1', url: 'https://private.example/too-late.jpg' }]); await pending
    assert.equal(writes.length, count); assert.equal(page.data.records[0].imagePath, '')
  }
})
test('a newer history refresh rejects an older private-image response', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); createIdentifyHistory(wx).save(record(1))
  let count = 0; const wait = deferred(); const { page } = harness({ storage: wx.storage, resolveAssets: ids => ++count === 1 ? wait.promise : ids.map(assetId => ({ assetId, url: 'https://private.example/new.jpg' })) })
  const first = page.onShow(); await page.refresh()
  wait.resolve([{ assetId: 'asset-1', url: 'https://private.example/old.jpg' }]); await first
  assert.equal(page.data.records[0].imagePath, 'https://private.example/new.jpg')
})
test('history selection opens its stored result without uploading or analyzing', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const saved = createIdentifyHistory(wx).save(record(1, { id: 'history / one' }))
  const { page, nav } = harness({ storage: wx.storage }); await page.onShow(); page.openRecord(tap(saved.id)); page.openRecord(tap('not-present'))
  assert.deepEqual(nav, [`/pages/ai-identify/index?recordId=${encodeURIComponent(saved.id)}`])
})
test('history page refreshes its local records on return and handles capsule and safe-area metrics', async () => {
  const { createIdentifyHistory } = historyModule(); const wx = platform(); const history = createIdentifyHistory(wx)
  const { page } = harness({ storage: wx.storage }); await page.onShow(); page.onHide(); history.save(record(1)); await page.onShow()
  assert.equal(page.data.records.length, 1); assert.equal(page.data.safeBottom, 34); assert.ok(page.data.headerHeight >= 84)
})
test('history markup uses resolved paper and ink assets plus the shared workshop tabbar', () => {
  const { page, nav } = harness()
  const markup = fs.readFileSync(path.join(root, 'pages/ai-identify-history/index.wxml'), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(root, 'pages/ai-identify-history/index.json'), 'utf8'))
  assert.match(page.data.media.paper, /home-paper\.png$/); assert.match(page.data.media.header, /video-classroom-header\.jpg$/)
  assert.match(markup, /src="\{\{media\.paper\}\}"/); assert.match(markup, /porcelain-tabbar selected="workshop"/)
  assert.equal(json.usingComponents['porcelain-tabbar'], '/components/porcelain-tabbar/index')
  page.goBack(); assert.deepEqual(nav, ['/pages/ai-identify/index'])
})
