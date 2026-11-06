const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const root = path.resolve(__dirname, '..')
const ceramics = require('../data/ceramics')
const recognized = { status: 'recognized', shape: '碗', category: '青瓷', patterns: ['莲瓣'], glazeDescription: '天青色釉面', technique: '施釉烧制', observations: ['口沿呈莲瓣形', '釉面可见开片'], cultureIntro: '莲瓣造型表达宋人自然而含蓄的审美。', relatedCeramicId: 'ceramic-002' }
const showcase = { identificationCases: [{ id: 'sample-bowl', name: '莲瓣碗', image: '/assets/ceramics/song-ru-lotus-bowl.jpg', result: recognized, source: 'showcase', createdAt: '2026-10-14' }] }
function deferred() { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function harness(options = {}) {
  let definition; let sequence = 0
  const calls = []; const uploads = []; const storage = options.storage || new Map(); const toasts = []; const nav = []; const previews = []
  const service = {
    async uploadImage(file, purpose) { uploads.push({ file, purpose }); return options.upload ? options.upload(file) : { assetId: `asset-${file}` } },
    async callAI(action, payload) { calls.push({ action, payload: structuredClone(payload) }); return options.call ? options.call(action, payload) : { requestId: payload.clientRequestId, status: 'succeeded', result: recognized } },
    async resolveAssets(ids) { return options.resolveAssets ? options.resolveAssets(ids) : ids.map(assetId => ({ assetId, url: 'https://private.example/image.jpg' })) }
  }
  const wx = {
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, statusBarHeight: 44, safeArea: { bottom: 810 } }),
    getMenuButtonBoundingClientRect: () => ({ top: 52, height: 32, bottom: 84 }),
    chooseMedia: (config) => config.success({ tempFiles: [{ tempFilePath: 'photo-a.jpg' }] }),
    getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast: value => toasts.push(value), navigateTo: value => nav.push(value.url), previewImage: value => previews.push(value),
    ...options.wx
  }
  const sandbox = { Page: value => { definition = value }, wx, getCurrentPages: options.getCurrentPages || (() => []), console, setTimeout: options.setTimeout || (() => 1), clearTimeout: options.clearTimeout || (() => {}), require: id => {
    if (id === '../../utils/cloud-service') return options.actualService ? require('../utils/cloud-service') : { createCloudService: () => service, createRequestId: prefix => `${prefix}-${++sequence}` }
    if (id === '../../data/showcase') return showcase
    return require(path.resolve(root, 'pages/ai-identify', id))
  } }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/ai-identify/index.js'), 'utf8'), sandbox)
  const page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
  return { page, wx, storage, calls, uploads, toasts, nav, previews }
}
const tap = id => ({ currentTarget: { dataset: { id } } })

test('the header returns to the previous page when one is available', () => {
  const back = []; const home = []
  const { page } = harness({ getCurrentPages: () => [{ route: 'pages/workshop/index' }, { route: 'pages/ai-identify/index' }], wx: { navigateBack: config => back.push(config.delta), switchTab: config => home.push(config.url) } })
  page.onLoad(); page.goBack()
  assert.deepEqual(back, [1]); assert.deepEqual(home, [])
})

test('the header reaches the homepage with no previous page or a failed native return', () => {
  for (const hasPrevious of [false, true]) {
    const home = []
    const { page } = harness({ getCurrentPages: () => hasPrevious ? [{}, {}] : [{}], wx: { navigateBack: config => config.fail({ errMsg: 'navigateBack:fail' }), switchTab: config => home.push(config.url) } })
    page.onLoad(); page.goBack()
    assert.deepEqual(home, ['/pages/home/index'])
  }
})

test('new results save cultural explanations while old history and sessions display compatible introductions without a model call', async () => {
  const cultureIntro = '青花以蓝白相映展现清雅意趣。但具体年代、窑口及真伪需结合更多信息鉴定。'
  const oldResult = { ...recognized, cultureIntro }
  const expected = '青花以蓝白相映展现清雅意趣。'
  const fresh = harness({ call: async () => ({ requestId: 'culture-new', status: 'succeeded', result: oldResult }) })
  fresh.page.onLoad(); await fresh.page.choose(); await fresh.page.analyze()
  assert.equal(fresh.page.data.result.cultureIntro, expected)
  assert.equal(fresh.storage.get('aiIdentifyHistoryV1')[0].result.cultureIntro, expected)
  for (const history of [false, true]) {
    const storage = new Map([
      ['aiIdentifySessionV1', { imagePath: 'expired.jpg', assetId: 'saved-image', result: oldResult }],
      ['aiIdentifyHistoryV1', [{ id: 'culture-old', requestId: 'culture-old', assetId: 'saved-image', result: oldResult, createdAt: '2026-10-15' }]]
    ])
    const restored = harness({ storage })
    restored.page.onLoad(history ? { recordId: 'culture-old' } : {}); await restored.page.onShow()
    assert.equal(restored.page.data.result.cultureIntro, expected)
    assert.equal(restored.calls.length, 0)
    assert.equal(storage.get('aiIdentifyHistoryV1')[0].result.cultureIntro, cultureIntro)
  }
})

test('camera and album buttons pass distinct image sources to the native picker', async () => {
  const sources = []
  const { page } = harness({ wx: { chooseMedia: config => { sources.push([...config.sourceType]); config.success({ tempFiles: [{ tempFilePath: 'picked.jpg' }] }) } } })
  page.onLoad()
  await page.chooseCamera(); await page.chooseAlbum()
  assert.deepEqual(sources, [['camera'], ['album']])
})
test('successful identification automatically persists one durable history record', async () => {
  const { page, storage } = harness()
  page.onLoad(); await page.choose(); await page.analyze()
  const saved = storage.get('aiIdentifyHistoryV1')
  assert.equal(saved.length, 1)
  assert.equal(saved[0].assetId, 'asset-photo-a.jpg')
  assert.equal(saved[0].result.shape, '碗')
  assert.ok(saved[0].requestId)
  page.openHistory()
})
test('history details reopen without uploading or requesting a model and preserve the active session', async () => {
  const session = { imagePath: 'other.jpg', assetId: '', active: null }
  const storage = new Map([['aiIdentifySessionV1', session], ['aiIdentifyHistoryV1', [{ id: 'record-one', requestId: 'record-one', assetId: 'private-asset', result: recognized, createdAt: '2026-10-15T10:00:00.000Z' }]]])
  const { page, calls, uploads } = harness({ storage })
  page.onLoad({ recordId: 'record-one' }); await page.onShow(); page.onHide()
  assert.equal(page.data.result.shape, '碗')
  assert.equal(page.data.imagePath, 'https://private.example/image.jpg')
  assert.equal(calls.length, 0); assert.equal(uploads.length, 0)
  assert.deepEqual(storage.get('aiIdentifySessionV1'), session)
})
test('history storage failures keep the real result visible and explain that it was not saved', async () => {
  const { page } = harness({ wx: { setStorageSync: key => { if (key === 'aiIdentifyHistoryV1') throw new Error('quota') } } })
  page.onLoad(); await page.choose(); await page.analyze()
  assert.equal(page.data.status, 'succeeded')
  assert.equal(page.data.result.shape, '碗')
  assert.match(page.data.storageWarning, /识别记录/)
})
test('result names and visible feature tags come from the actual response', async () => {
  const result = { ...recognized, name: '青瓷莲瓣碗', tags: ['青瓷', '莲瓣', '开片'] }
  const { page, nav } = harness({ call: async (action, payload) => ({ requestId: payload.clientRequestId, status: 'succeeded', result }) })
  page.onLoad(); await page.choose(); await page.analyze()
  assert.equal(page.data.resultName, '青瓷莲瓣碗')
  assert.deepEqual([...page.data.resultTags], ['青瓷', '莲瓣', '开片'])
  page.openHistory(); assert.equal(nav.at(-1), '/pages/ai-identify-history/index')
})
test('returning from examples restores the current photo result name and tags', async () => {
  const { page } = harness({ call: async (action, payload) => ({ requestId: payload.clientRequestId, status: 'succeeded', result: { ...recognized, name: '用户照片中的莲瓣碗', tags: ['莲瓣', '天青釉'] } }) })
  page.onLoad(); await page.choose(); await page.analyze(); page.showCases(); page.selectCase(tap('sample-bowl')); page.returnToLive()
  assert.equal(page.data.resultName, '用户照片中的莲瓣碗')
  assert.deepEqual([...page.data.resultTags], ['莲瓣', '天青釉'])
  assert.deepEqual(page.data.featureCards.map(item => item.name), ['器型', '纹饰', '釉色', '工艺'])
})
test('an expired private preview that cannot be renewed never opens its expired URL', async () => {
  const { page, previews } = harness({ resolveAssets: async () => { throw new Error('offline') } })
  page.onLoad(); page.setData({ assetId: 'asset-one', imagePath: 'https://private.example/expired.jpg' }); page._imageExpiresAt = 1
  await page.previewImage()
  assert.equal(previews.length, 0)
  assert.match(page.data.imageWarning, /预览/)
})
test('viewing records from a history detail returns to the existing list without growing the page stack', () => {
  const back = []
  const { page, nav } = harness({ getCurrentPages: () => [{ route: 'pages/ai-identify-history/index' }, { route: 'pages/ai-identify/index' }], wx: { navigateBack: value => back.push(value.delta) } })
  page.onLoad(); page.setData({ fromHistory: true }); page.openHistory()
  assert.deepEqual(back, [1]); assert.equal(nav.length, 0)
})
test('the primary action after a definite model failure creates a retry instead of reopening the cached failure', async () => {
  let attempt = 0
  const { page, calls } = harness({ call: async (action, payload) => { if (!attempt++) throw Object.assign(new Error('model unavailable'), { code: 'MODEL_ERROR' }); return { requestId: payload.clientRequestId, status: 'succeeded', result: recognized } } })
  page.onLoad(); await page.choose(); await page.analyze(); assert.equal(page.data.status, 'failed')
  await page.startIdentify()
  assert.equal(page.data.status, 'succeeded'); assert.notEqual(calls[1].payload.clientRequestId, calls[0].payload.clientRequestId)
})

test('photo choice shows a preview and sends its uploaded asset to the real identification action', async () => {
  const { page, calls, uploads, previews } = harness()
  assert.equal(typeof page.analyze, 'function')
  page.onLoad(); await page.choose(); page.previewImage(); await page.analyze()
  assert.equal(page.data.imagePath, 'photo-a.jpg')
  assert.deepEqual(uploads, [{ file: 'photo-a.jpg', purpose: 'identify' }])
  assert.equal(calls[0].action, 'identify.analyze')
  assert.equal(calls[0].payload.assetId, 'asset-photo-a.jpg')
  assert.ok(calls[0].payload.clientRequestId)
  assert.equal(page.data.result.shape, '碗')
  assert.equal(page.data.featureCards.length, 4)
  assert.equal(previews[0].current, 'photo-a.jpg')
})
test('selection cancellation leaves the current image and result intact without an error', async () => {
  const { page, toasts } = harness({ wx: { chooseMedia: config => config.fail({ errMsg: 'chooseMedia:fail cancel' }) } })
  assert.equal(typeof page.onLoad, 'function'); page.onLoad(); page.setData({ imagePath: 'existing.jpg', result: recognized })
  await page.choose()
  assert.equal(page.data.imagePath, 'existing.jpg'); assert.equal(page.data.result.shape, '碗'); assert.equal(page.data.error, ''); assert.equal(toasts.length, 0)
})
test('legacy image picker is supported and an empty selection cannot start an AI request', async () => {
  const { page, calls } = harness({ wx: { chooseMedia: undefined, chooseImage: config => config.success({ tempFilePaths: ['legacy.jpg'] }) } })
  assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.analyze(); assert.equal(calls.length, 0)
  await page.choose(); assert.equal(page.data.imagePath, 'legacy.jpg')
})
test('duplicate identify taps share one upload and immutable request', async () => {
  const wait = deferred(); const { page, calls, uploads } = harness({ call: () => wait.promise })
  assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.choose()
  const first = page.analyze(); const second = page.analyze(); await new Promise(setImmediate)
  assert.equal(calls.length, 1); assert.equal(uploads.length, 1)
  wait.resolve({ status: 'succeeded', result: recognized }); await Promise.all([first, second])
})
test('a changed image rejects an older result even when that request resolves last', async () => {
  const wait = deferred(); const { page, wx } = harness({ call: () => wait.promise })
  assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.choose(); const pending = page.analyze(); await new Promise(setImmediate)
  wx.chooseMedia = config => config.success({ tempFiles: [{ tempFilePath: 'photo-b.jpg' }] }); await page.choose()
  wait.resolve({ status: 'succeeded', result: recognized }); await pending
  assert.equal(page.data.imagePath, 'photo-b.jpg'); assert.equal(page.data.result, null); assert.equal(page.data.status, 'ready')
})
test('a changed image while uploading prevents the old asset from being submitted', async () => {
  const wait = deferred(); const { page, wx, calls } = harness({ upload: () => wait.promise })
  assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.choose(); const pending = page.analyze()
  wx.chooseMedia = config => config.success({ tempFiles: [{ tempFilePath: 'photo-b.jpg' }] }); await page.choose()
  wait.resolve({ assetId: 'old-asset' }); await pending; assert.equal(calls.length, 0); assert.equal(page.data.imagePath, 'photo-b.jpg')
})
test('uncertain and non-ceramic observations remain visibly distinct and never become a default porcelain', async () => {
  for (const result of [{ ...recognized, status: 'uncertain', relatedCeramicId: '' }, { status: 'not_ceramic', observations: ['照片为木质摆件'], cultureIntro: '' }]) {
    const { page } = harness({ call: () => ({ status: 'succeeded', result }) })
    assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.choose(); await page.analyze()
    assert.equal(page.data.result.status, result.status); assert.ok(page.data.resultTitle)
    assert.notEqual(page.data.result.shape, '青花梅瓶'); assert.equal(page.data.relatedCeramic, null)
  }
})
test('malformed provider output reports a response error without an invented result', async () => {
  const { page } = harness({ call: () => ({ status: 'succeeded', result: { shape: 'invented' } }) })
  assert.equal(typeof page.analyze, 'function'); page.onLoad(); await page.choose(); await page.analyze()
  assert.equal(page.data.result, null); assert.equal(page.data.status, 'unknown'); assert.match(page.data.error, /返回|结果/)
})
test('cloud configuration failure remains a real error and retry reuses the input key', async () => {
  let count = 0; const { page, calls } = harness({ call: () => { count += 1; if (count === 1) throw Object.assign(new Error('尚未配置识瓷服务'), { code: 'PROVIDER_NOT_CONFIGURED', retryable: true }); return { status: 'succeeded', result: recognized } } })
  assert.equal(typeof page.retry, 'function'); page.onLoad(); await page.choose(); await page.analyze()
  assert.equal(page.data.result, null); assert.match(page.data.error, /尚未配置/); await page.retry()
  assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(page.data.result.shape, '碗')
})
test('leaving and reopening a running analysis restores its exact asset and request key', async () => {
  const first = harness({ call: () => ({ status: 'running', requestId: 'server-request' }) })
  assert.equal(typeof first.page.onHide, 'function'); first.page.onLoad(); await first.page.choose(); await first.page.analyze(); first.page.onHide()
  const second = harness({ storage: first.storage }); second.page.onLoad(); await second.page.onShow()
  assert.equal(second.calls.length, 1); assert.deepEqual(second.calls[0].payload, first.calls[0].payload); assert.equal(second.uploads.length, 0); assert.equal(second.page.data.result.shape, '碗')
})
test('pre-generated cases use an explicit separate mode and never invoke identification', async () => {
  const { page, calls, uploads } = harness()
  assert.equal(typeof page.showCases, 'function'); page.onLoad(); page.showCases(); page.selectCase(tap('sample-bowl'))
  assert.equal(page.data.mode, 'showcase'); assert.match(page.data.caseLabel, /预生成展示案例/); assert.equal(page.data.result.shape, '碗')
  await page.analyze(); assert.equal(calls.length, 0); assert.equal(uploads.length, 0)
  page.returnToLive(); assert.equal(page.data.mode, 'live'); assert.equal(page.data.result, null)
})
test('only a valid related museum id navigates and continued questions carry concise analysis', async () => {
  const { page, nav } = harness()
  assert.equal(typeof page.openRelated, 'function'); page.onLoad(); await page.choose(); await page.analyze(); page.openRelated(); page.ask()
  assert.equal(nav[0], '/pages/ceramic-detail/index?id=ceramic-002'); assert.match(nav[1], /ceramicId=ceramic-002/)
  page.setData({ relatedCeramic: null, result: { ...recognized, relatedCeramicId: 'missing' } }); page.openRelated(); assert.equal(nav.length, 2)
})
test('native capsule and bottom safe-area metrics remain usable at narrow widths', () => {
  const { page, wx } = harness()
  assert.equal(typeof page.onResize, 'function'); page.onLoad(); assert.ok(page.data.headerHeight >= 84); assert.equal(page.data.safeBottom, 34)
  wx.getWindowInfo = () => ({ windowWidth: 320, windowHeight: 568, statusBarHeight: 20 }); page.onResize(); assert.equal(page.data.safeBottom, 0)
})
test('restored private photos resolve by stable asset id without analyzing again', async () => {
  const storage = new Map([['aiIdentifySessionV1', { imagePath: 'expired-temp.jpg', assetId: 'saved-image', result: recognized }]])
  const { page, calls } = harness({ storage }); page.onLoad(); await page.onShow()
  assert.equal(page.data.imagePath, 'https://private.example/image.jpg'); assert.equal(calls.length, 0); assert.equal(page.data.result.shape, '碗')
})
test('a late private preview refresh cannot overwrite a newly selected image', async () => {
  let resolves = 0; const wait = deferred(); const storage = new Map([['aiIdentifySessionV1', { imagePath: 'expired.jpg', assetId: 'saved-image', result: recognized }]])
  const { page } = harness({ storage, resolveAssets: () => { resolves += 1; return wait.promise } }); page.onLoad(); const refreshing = page.onShow(); assert.equal(resolves, 1); await page.choose()
  wait.resolve([{ assetId: 'saved-image', url: 'https://private.example/old.jpg' }]); await refreshing
  assert.equal(page.data.imagePath, 'photo-a.jpg'); assert.equal(page.data.result, null)
})
test('the actual cloud adapter uploads and identifies only the selected photo', async () => {
  const wire = []; const { page } = harness({ actualService: true, wx: { cloud: {
    callFunction(config) { wire.push(config.data); const action = config.data.action; const payload = config.data.payload
      config.success({ result: { ok: true, data: action === 'assets.prepareUpload' ? { assetId: 'actual-image', cloudPath: 'private/test.jpg' } : action === 'assets.confirmUpload' ? { assetId: 'actual-image', fileId: 'cloud://test.jpg' } : { status: 'succeeded', requestId: payload.clientRequestId, result: recognized } } })
    }, uploadFile(config) { assert.equal(config.filePath, 'photo-a.jpg'); config.success({ fileID: 'cloud://test.jpg' }) }
  } } }); page.onLoad(); await page.choose(); await page.analyze()
  assert.deepEqual(wire.map(request => request.action), ['assets.prepareUpload', 'assets.confirmUpload', 'identify.analyze']); assert.equal(wire[2].payload.assetId, 'actual-image'); assert.equal(page.data.status, 'succeeded')
})
test('the actual cloud adapter without a configured connection displays failure and no result', async () => {
  const { page } = harness({ actualService: true }); page.onLoad(); await page.choose(); await page.analyze()
  assert.equal(page.data.status, 'failed'); assert.equal(page.data.result, null); assert.equal(page.data.errorCode, 'CLOUD_UNAVAILABLE'); assert.ok(page.data.error)
})
test('running identification stops background polling when the page is hidden', async () => {
  const scheduled = []; const cleared = []; const { page } = harness({ call: () => ({ status: 'running' }), setTimeout: callback => { scheduled.push(callback); return 17 }, clearTimeout: id => cleared.push(id) })
  page.onLoad(); await page.choose(); await page.analyze(); assert.equal(scheduled.length, 1); page.onHide(); assert.deepEqual(cleared, [17])
})
test('a private image refresh error preserves its analysis and offers image loading recovery', async () => {
  const storage = new Map([['aiIdentifySessionV1', { imagePath: 'expired-temp.jpg', assetId: 'saved-image', result: recognized }]])
  const { page } = harness({ storage, resolveAssets: () => { throw new Error('offline') } }); page.onLoad(); await page.onShow()
  assert.equal(page.data.result.shape, '碗'); assert.equal(page.data.status, 'succeeded'); assert.match(page.data.imageWarning, /预览/)
})
test('an unreadable local identify record is not overwritten by a new session', async () => {
  const stored = { imagePath: 'preserved.jpg', custom: 'keep' }; const storage = new Map([['aiIdentifySessionV1', stored]])
  const { page } = harness({ storage, wx: { getStorageSync() { throw new Error('storage locked') } } }); page.onLoad(); await page.choose(); await page.analyze(); page.onHide()
  assert.deepEqual(storage.get('aiIdentifySessionV1'), stored); assert.equal(page.data.status, 'succeeded')
})
test('transport uncertainty preserves the original identification key for subsequent queries', async () => {
  for (const code of ['NETWORK_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE']) {
    const { page, calls, uploads } = harness({ call: () => { throw Object.assign(new Error('连接未确认'), { code }) } })
    page.onLoad(); await page.choose(); await page.analyze(); assert.equal(page.data.status, 'unknown'); await page.analyze()
    assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(uploads.length, 1)
  }
})
test('explicitly restarting a failed identification uses a new id with the same uploaded asset', async () => {
  let count = 0; const { page, calls, uploads } = harness({ call: () => ++count === 1 ? { status: 'failed', error: { code: 'MODEL_ERROR', message: '已明确失败' } } : { status: 'succeeded', result: recognized } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); await page.choose(); await page.analyze(); assert.equal(page.data.status, 'failed'); await page.restart()
  assert.notEqual(calls[1].payload.clientRequestId, calls[0].payload.clientRequestId); assert.equal(calls[1].payload.assetId, calls[0].payload.assetId); assert.equal(uploads.length, 1)
})
test('canceling uncertain identification restart does not discard or resubmit the original task', async () => {
  const modals = []; const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { modals.push(config); config.success({ confirm: false, cancel: true }) } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); await page.choose(); await page.analyze(); const original = structuredClone(page._active); await page.restart()
  assert.equal(calls.length, 1); assert.deepEqual(structuredClone(page._active), original); assert.match(modals[0].content, /上次结果未确认.*再次请求可能额外计费/)
})
test('confirming uncertain identification restart creates a new id while ordinary retry uses the old id', async () => {
  const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { config.success({ confirm: true }) } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); await page.choose(); await page.analyze(); await page.retry(); assert.deepEqual(calls[1].payload, calls[0].payload); await page.restart()
  assert.notEqual(calls[2].payload.clientRequestId, calls[0].payload.clientRequestId); assert.equal(calls[2].payload.assetId, calls[0].payload.assetId)
})
test('a running identification restart can only query its existing request', async () => {
  let modals = 0; const { page, calls } = harness({ call: () => ({ status: 'running' }), wx: { showModal() { modals += 1 } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); await page.choose(); await page.analyze(); await page.restart()
  assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(modals, 0)
})
test('identification found running while its restart dialog is open keeps the original id', async () => {
  let modal; let count = 0; const { page, calls } = harness({ call: () => ({ status: ++count === 1 ? 'unknown' : 'running' }), wx: { showModal(config) { modal = config } } })
  page.onLoad(); await page.choose(); await page.analyze(); const restarting = page.restart(); await page.retry(); modal.success({ confirm: true }); await restarting
  assert.ok(calls.every(call => call.payload.clientRequestId === calls[0].payload.clientRequestId))
})
test('duplicate uncertain identification restart taps show one dialog and start at most one new request', async () => {
  let modal; let modals = 0; const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { modals += 1; modal = config } } })
  page.onLoad(); await page.choose(); await page.analyze(); const first = page.restart(); const second = page.restart(); assert.equal(modals, 1); modal.success({ confirm: true }); await Promise.all([first, second]); assert.equal(calls.length, 2)
})
test('canceling photo reselection confirmation preserves the uncertain image and exact request', async () => {
  let picks = 0; const modals = []
  const { page, calls, uploads, storage } = harness({ call: () => ({ status: 'unknown' }), wx: {
    chooseMedia(config) { picks += 1; config.success({ tempFiles: [{ tempFilePath: 'same-photo.jpg' }] }) },
    showModal(config) { modals.push(config); config.success({ confirm: false, cancel: true }) }
  } })
  page.onLoad(); await page.choose(); await page.analyze()
  const active = structuredClone(page._active); const requestId = page.data.requestId; const saved = structuredClone(storage.get('aiIdentifySessionV1'))
  await page.choose()
  assert.equal(picks, 1); assert.equal(modals.length, 1); assert.match(modals[0].content, /上次结果未确认.*再次请求可能额外计费/)
  assert.equal(page.data.imagePath, 'same-photo.jpg'); assert.equal(page.data.requestId, requestId); assert.deepEqual(structuredClone(page._active), active)
  assert.equal(calls.length, 1); assert.equal(uploads.length, 1); assert.deepEqual(storage.get('aiIdentifySessionV1'), saved)
})
test('confirmed same-photo reselection picks once and starts a new id only after explicit analysis', async () => {
  let picks = 0; let modals = 0; let assets = 0
  const { page, calls, uploads } = harness({ call: () => ({ status: 'unknown' }), upload: () => ({ assetId: `new-asset-${++assets}` }), wx: {
    chooseMedia(config) { picks += 1; config.success({ tempFiles: [{ tempFilePath: 'same-photo.jpg' }] }) },
    showModal(config) { modals += 1; config.success({ confirm: true }) }
  } })
  page.onLoad(); await page.choose(); await page.analyze(); await page.choose()
  assert.equal(modals, 1); assert.equal(picks, 2); assert.equal(page.data.status, 'ready'); assert.equal(calls.length, 1); assert.equal(uploads.length, 1)
  await page.analyze()
  assert.equal(calls.length, 2); assert.notEqual(calls[1].payload.clientRequestId, calls[0].payload.clientRequestId); assert.notEqual(calls[1].payload.assetId, calls[0].payload.assetId)
})
test('duplicate uncertain photo reselection taps share one confirmation and one pending picker', async () => {
  let modal; let picker; let picks = 0; let modals = 0
  const { page, calls, uploads } = harness({ call: () => ({ status: 'unknown' }), wx: {
    chooseMedia(config) { picks += 1; if (picks === 1) config.success({ tempFiles: [{ tempFilePath: 'original.jpg' }] }); else picker = config },
    showModal(config) { modals += 1; modal = config }
  } })
  page.onLoad(); await page.choose(); await page.analyze()
  const first = page.choose(); const second = page.choose(); assert.equal(modals, 1); assert.equal(picks, 1)
  modal.success({ confirm: true }); await new Promise(setImmediate); const third = page.choose(); assert.equal(picks, 2); assert.equal(modals, 1)
  picker.success({ tempFiles: [{ tempFilePath: 'new.jpg' }] }); await Promise.all([first, second, third])
  assert.equal(page.data.imagePath, 'new.jpg'); assert.equal(calls.length, 1); assert.equal(uploads.length, 1)
})
test('canceling the photo picker after confirmation still preserves the original uncertain request', async () => {
  let picks = 0; let modals = 0
  const { page, calls, uploads } = harness({ call: () => ({ status: 'unknown' }), wx: {
    chooseMedia(config) { if (++picks === 1) config.success({ tempFiles: [{ tempFilePath: 'original.jpg' }] }); else config.fail({ errMsg: 'chooseMedia:fail cancel' }) },
    showModal(config) { modals += 1; config.success({ confirm: true }) }
  } })
  page.onLoad(); await page.choose(); await page.analyze(); const active = structuredClone(page._active); const requestId = page.data.requestId; await page.choose()
  assert.equal(modals, 1); assert.equal(picks, 2); assert.deepEqual(structuredClone(page._active), active); assert.equal(page.data.requestId, requestId)
  assert.equal(page.data.imagePath, 'original.jpg'); assert.equal(page.data.status, 'unknown'); assert.equal(calls.length, 1); assert.equal(uploads.length, 1)
})

test('the result action returns to the empty identification screen without opening a picker or requesting a model', async () => {
  let picks = 0
  const { page, calls, uploads, storage } = harness({ wx: { chooseMedia(config) { picks += 1; config.success({ tempFiles: [{ tempFilePath: 'photo-a.jpg' }] }) } } })
  page.onLoad(); await page.choose(); await page.analyze()
  const records = structuredClone(storage.get('aiIdentifyHistoryV1'))
  page.setData({ imageWarning: 'old warning', error: 'old error', errorCode: 'OLD', storageWarning: 'old storage warning' })
  assert.equal(typeof page.returnToIdentify, 'function')
  page.returnToIdentify(); await page.onShow(); page.onHide()
  for (const key of ['imagePath', 'assetId', 'imageWarning', 'resultTitle', 'resultName', 'error', 'errorCode', 'requestId', 'recordId', 'storageWarning']) assert.equal(page.data[key], '', key)
  for (const key of ['result', 'relatedCeramic', 'selectedCase']) assert.equal(page.data[key], null, key)
  for (const key of ['resultTags', 'featureCards']) assert.equal(page.data[key].length, 0, key)
  for (const key of ['busy', 'canRetry', 'fromHistory', 'historySaved']) assert.equal(page.data[key], false, key)
  assert.equal(page.data.mode, 'live'); assert.equal(page.data.status, 'empty'); assert.equal(page._active, null)
  assert.deepEqual(storage.get('aiIdentifySessionV1'), { imagePath: '', assetId: '', result: null, active: null })
  assert.deepEqual(storage.get('aiIdentifyHistoryV1'), records)
  assert.equal(picks, 1); assert.equal(calls.length, 1); assert.equal(uploads.length, 1)
  const reopened = harness({ storage }); reopened.page.onLoad(); await reopened.page.onShow()
  assert.equal(reopened.page.data.status, 'empty'); assert.equal(reopened.calls.length, 0)
  const markup = fs.readFileSync(path.join(root, 'pages/ai-identify/index.wxml'), 'utf8')
  assert.match(markup, /bindtap="returnToIdentify"[^>]*>[\s\S]*?返回识瓷<\/button>/)
  assert.doesNotMatch(markup, />重新识别<\/button>/)
})

test('returning from a history detail clears the active session and ignores its late private photo refresh', async () => {
  const wait = deferred()
  const record = { id: 'record-one', requestId: 'record-one', assetId: 'private-asset', result: recognized, createdAt: '2026-10-15T10:00:00.000Z' }
  const storage = new Map([
    ['aiIdentifySessionV1', { imagePath: 'other.jpg', assetId: 'other-asset', result: recognized, active: null }],
    ['aiIdentifyHistoryV1', [record]]
  ])
  const { page, calls, uploads } = harness({ storage, resolveAssets: () => wait.promise })
  page.onLoad({ recordId: 'record-one' }); const showing = page.onShow()
  assert.equal(typeof page.returnToIdentify, 'function')
  page.returnToIdentify()
  wait.resolve([{ assetId: 'private-asset', url: 'https://private.example/history.jpg' }]); await showing
  assert.equal(page.data.status, 'empty'); assert.equal(page.data.imagePath, ''); assert.equal(page.data.result, null)
  assert.equal(page.data.fromHistory, false); assert.equal(page._historyView, false)
  assert.deepEqual(storage.get('aiIdentifySessionV1'), { imagePath: '', assetId: '', result: null, active: null })
  assert.deepEqual(storage.get('aiIdentifyHistoryV1'), [record]); assert.equal(calls.length, 0); assert.equal(uploads.length, 0)
  await page.chooseAlbum(); await page.analyze()
  assert.equal(page.data.status, 'succeeded'); assert.equal(storage.get('aiIdentifyHistoryV1').length, 2)
})
