const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagePath = path.resolve(__dirname, '../pages/ai-result/index.js')
const taskInput = { userPrompt: '月下竹影瓷瓶', styleId: 'qinghua', styleName: '青花' }

function environment(t, respond) {
  const previous = { wx: global.wx, Page: global.Page, getCurrentPages: global.getCurrentPages, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout }
  const storage = new Map()
  const calls = []
  const timers = new Map()
  const previews = []
  const toasts = []
  const navigations = []
  let timerId = 0
  global.setTimeout = (fn, delay) => { timerId += 1; timers.set(timerId, { fn, delay }); return timerId }
  global.clearTimeout = (id) => timers.delete(id)
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : '' },
    setStorageSync(key, value) { storage.set(key, value) },
    getWindowInfo() { return { statusBarHeight: 44, windowHeight: 844, safeArea: { bottom: 810 } } },
    getMenuButtonBoundingClientRect() { return { top: 50, height: 32 } },
    showToast(options) { toasts.push(options) },
    previewImage(options) { previews.push(options) },
    navigateTo(options) { navigations.push(options.url) }, navigateBack() {}, switchTab() {},
    cloud: { callFunction(options) {
      calls.push(options.data)
      try {
        const result = respond(options.data.action, options.data.payload)
        return Promise.resolve(result).then((data) => ({ result: { ok: true, data } }))
      } catch (error) { return Promise.reject(error) }
    } }
  }
  let page
  t.after(() => {
    if (page && page.onUnload) page.onUnload()
    Object.assign(global, previous)
  })
  function load(options) {
    assert.ok(fs.existsSync(pagePath), 'A real AI result page is required')
    let definition
    global.Page = (value) => { definition = value }
    delete require.cache[require.resolve(pagePath)]
    require(pagePath)
    page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
    page.onLoad(options)
    return page
  }
  async function nextPoll() {
    const [id, timer] = [...timers][0]
    timers.delete(id)
    await timer.fn()
  }
  return { load, calls, storage, timers, previews, toasts, navigations, nextPoll }
}

function completeTask() { return { taskId: 'task-1', status: 'succeeded', input: taskInput, result: { assetId: 'asset-1', fileId: 'cloud://private-file' } } }
function resolvedAssets() { return { assets: [{ assetId: 'asset-1', fileId: 'cloud://private-file', url: 'https://cdn.example/art.jpg', expiresAt: Date.now() + 600000 }] } }

test('result shows real task states and disallows saving until permanent storage has succeeded', async (t) => {
  let status = 'queued'
  const env = environment(t, (action) => {
    assert.equal(action, 'generation.get')
    return { taskId: 'task-1', status, input: taskInput, error: status === 'failed' ? { code: 'GENERATION_FAILED', message: 'Provider secret' } : undefined }
  })
  const page = env.load({ taskId: 'task-1' })
  for (status of ['queued', 'running', 'storing', 'failed', 'unknown']) {
    await page.onShow()
    assert.equal(page.data.status, status)
    assert.ok(page.data.statusTitle)
    assert.equal(page.data.canSave, false)
    await page.saveArtwork()
    assert.equal(env.storage.has('craftWorks'), false)
    page.onHide()
  }
  assert.equal(page.data.isShowcase, false)
  assert.equal(page.data.image, '')
})

test('foreground task queries back off at 3, 5 and 10 seconds, then stop on hide and resume on return', async (t) => {
  const env = environment(t, () => ({ taskId: 'task-1', status: 'running', input: taskInput }))
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal([...env.timers.values()][0].delay, 3000)
  await env.nextPoll()
  assert.equal([...env.timers.values()][0].delay, 5000)
  await env.nextPoll()
  assert.equal([...env.timers.values()][0].delay, 10000)
  page.onHide()
  assert.equal(env.timers.size, 0)
  const previousCalls = env.calls.length
  await page.onShow()
  assert.equal(env.calls.length, previousCalls + 1)
  assert.equal([...env.timers.values()][0].delay, 3000)
  page.onUnload()
  assert.equal(env.timers.size, 0)
})

test('a query that completes after leaving cannot repaint the page or restart polling', async (t) => {
  let respond
  const env = environment(t, () => new Promise((resolve) => { respond = resolve }))
  const page = env.load({ taskId: 'task-1' })
  const query = page.onShow()
  page.onHide()
  respond(completeTask())
  await query
  assert.equal(env.timers.size, 0)
  assert.equal(page.data.image, '')
  assert.equal(env.calls.length, 1)
})

test('the first delayed task read shows a neutral reading state before any real task state', async (t) => {
  let respond
  const env = environment(t, () => new Promise((resolve) => { respond = resolve }))
  const page = env.load({ taskId: 'task-1' })
  const reading = page.onShow()
  assert.equal(page.data.initialLoading, true)
  assert.equal(page.data.status, 'unknown', 'Do not invent queued before the server returns')
  assert.equal(page.data.canSave, false)
  assert.equal(env.calls.length, 1)
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/ai-result/index.wxml'), 'utf8')
  const readingBlock = wxml.match(/<block wx:if="\{\{initialLoading\}\}">([\s\S]*?)<\/block>/)
  assert.ok(readingBlock, 'Initial reading must take precedence over the unknown recovery card')
  assert.match(readingBlock[1], /正在读取作品进度/)
  assert.doesNotMatch(readingBlock[1], /refreshResult|createAgain|正在为你生成/)
  respond({ taskId: 'task-1', status: 'running', input: taskInput })
  await reading
  assert.equal(page.data.initialLoading, false)
  assert.equal(page.data.status, 'running')
  assert.equal(env.calls.length, 1)
  assert.equal([...env.timers.values()][0].delay, 3000)
})

test('opening a completed historical task keeps reading until its private image is resolved', async (t) => {
  let resolveImage
  const env = environment(t, (action) => action === 'generation.get'
    ? completeTask()
    : new Promise((resolve) => { resolveImage = resolve }))
  const page = env.load({ taskId: 'task-1' })
  const reading = page.onShow()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(page.data.status, 'succeeded')
  assert.equal(page.data.initialLoading, true)
  assert.equal(page.data.image, '')
  resolveImage(resolvedAssets())
  await reading
  assert.equal(page.data.initialLoading, false)
  assert.equal(page.data.canSave, true)
  assert.equal(page.data.image, 'https://cdn.example/art.jpg')
  assert.deepEqual(env.calls.map((call) => call.action), ['generation.get', 'assets.resolve'])
})

test('a failed first read leaves the neutral reading state and shows real recovery without submitting again', async (t) => {
  const env = environment(t, () => { throw { errMsg: 'timeout' } })
  const page = env.load({ taskId: 'task-1' })
  assert.equal(page.data.initialLoading, true)
  await page.onShow()
  assert.equal(page.data.initialLoading, false)
  assert.equal(page.data.status, 'unknown')
  assert.ok(page.data.statusMessage)
  assert.equal(page.data.canSave, false)
  assert.deepEqual(env.calls.map((call) => call.action), ['generation.get'])
  assert.equal([...env.timers.values()][0].delay, 3000)
})

test('an old hidden reading session cannot dismiss the new session loading state or replace its output', async (t) => {
  const replies = []
  const env = environment(t, () => new Promise((resolve) => { replies.push(resolve) }))
  const page = env.load({ taskId: 'task-1' })
  const oldReading = page.onShow()
  page.onHide()
  const currentReading = page.onShow()
  replies[0](completeTask())
  await oldReading
  assert.equal(page.data.initialLoading, true)
  assert.equal(page.data.image, '')
  assert.equal(env.timers.size, 0)
  replies[1]({ taskId: 'task-1', status: 'storing', input: taskInput })
  await currentReading
  assert.equal(page.data.initialLoading, false)
  assert.equal(page.data.status, 'storing')
  assert.equal(env.calls.length, 2)
  page.onHide()
  const refresh = page.onShow()
  assert.equal(page.data.initialLoading, false, 'A known task does not return to the first-read placeholder')
  replies[2]({ taskId: 'task-1', status: 'running', input: taskInput })
  await refresh
})

test('completed tasks resolve their own asset before image preview and saving', async (t) => {
  const env = environment(t, (action, payload) => {
    if (action === 'generation.get') return completeTask()
    assert.equal(action, 'assets.resolve')
    assert.deepEqual(payload, { assetIds: ['asset-1'] })
    return resolvedAssets()
  })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.status, 'succeeded')
  assert.equal(page.data.image, 'https://cdn.example/art.jpg')
  assert.equal(page.data.canSave, true)
  assert.equal(env.timers.size, 0)
  await page.previewArtwork()
  assert.deepEqual(env.previews, [{ current: 'https://cdn.example/art.jpg', urls: ['https://cdn.example/art.jpg'] }])
  page.nameInput({ detail: { value: '  竹影入瓷  ' } })
  await page.saveArtwork()
  await page.saveArtwork()
  const works = env.storage.get('craftWorks')
  assert.equal(works.length, 1)
  assert.equal(works[0].id, 'ai-task-1')
  assert.equal(works[0].name, '竹影入瓷')
  assert.equal(works[0].creationType, 'ai')
  assert.equal(works[0].assetId, 'asset-1')
  assert.equal(works[0].fileId, 'cloud://private-file')
  assert.equal(works[0].taskId, 'task-1')
  assert.equal(works[0].userPrompt, taskInput.userPrompt)
  assert.equal(works[0].styleId, taskInput.styleId)
  assert.equal(works[0].styleName, taskInput.styleName)
})

test('private asset resolver failure stays visible and cannot save or fall back to a showcase image', async (t) => {
  const env = environment(t, (action) => {
    if (action === 'generation.get') return completeTask()
    throw { errMsg: 'request failed secret private-path' }
  })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.status, 'succeeded')
  assert.equal(page.data.canSave, false)
  assert.equal(page.data.image, '')
  assert.ok(page.data.imageError)
  assert.equal(page.data.isShowcase, false)
  await page.saveArtwork()
  assert.equal(env.storage.has('craftWorks'), false)
})

test('a task network timeout becomes unknown and continues querying the same task', async (t) => {
  let attempt = 0
  const env = environment(t, (action, payload) => {
    assert.equal(action, 'generation.get')
    assert.deepEqual(payload, { taskId: 'task-1' })
    attempt += 1
    if (attempt === 1) throw { errMsg: 'timeout' }
    return { taskId: 'task-1', status: 'running', input: taskInput }
  })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.status, 'unknown')
  assert.ok(page.data.statusMessage)
  await env.nextPoll()
  assert.equal(page.data.status, 'running')
})

test('case routes are labeled as pregenerated examples and preserve their packaged source on save', async (t) => {
  const env = environment(t, () => assert.fail('Showcase must not request a private generation task'))
  const example = require('../data/showcase').generationCases[0]
  assert.ok(example)
  const page = env.load({ caseId: example.id })
  await page.onShow()
  assert.equal(page.data.isShowcase, true)
  assert.equal(page.data.initialLoading, false)
  assert.equal(page.data.pageTitle, '预生成展示案例')
  assert.match(page.data.sourceLabel, /案例/)
  assert.equal(page.data.image, example.image)
  assert.equal(page.data.caseDate, example.createdAt.slice(0, 10))
  assert.match(fs.readFileSync(path.resolve(__dirname, '../pages/ai-result/index.wxml'), 'utf8'), /案例日期/)
  assert.match(page.data.image, /^\/assets\//)
  await page.saveArtwork()
  await page.saveArtwork()
  const [work] = env.storage.get('craftWorks')
  assert.equal(work.id, `showcase-${example.id}`)
  assert.equal(work.source, 'showcase')
  assert.equal(work.creationType, 'ai')
  assert.equal(work.image, example.image)
  assert.equal(work.assetId, undefined)
})

test('missing and invalid routes explain the problem without inventing output', async (t) => {
  const env = environment(t, () => assert.fail('Invalid route must not call cloud'))
  const page = env.load({ caseId: 'missing' })
  await page.onShow()
  assert.equal(page.data.canSave, false)
  assert.equal(page.data.status, 'failed')
  assert.equal(page.data.initialLoading, false)
  assert.ok(page.data.statusMessage)
  assert.equal(page.data.image, '')
})

test('share links use public entry routes and never expose private asset or task ids', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  const share = page.onShareAppMessage()
  assert.equal(share.path, '/pages/ai-create/index')
  assert.equal(share.imageUrl, undefined)
  assert.equal(/task-1|private-file|cdn.example/.test(JSON.stringify(share)), false)
})

test('owner-hidden or nonexistent tasks stop polling with a clear failure', async (t) => {
  const env = environment(t, () => ({ taskId: 'task-1', status: 'running', input: taskInput }))
  global.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: false, error: { code: 'NOT_FOUND', retryable: false } } })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.status, 'failed')
  assert.equal(env.timers.size, 0)
  assert.equal(page.data.canSave, false)
})

test('saving refreshes an expired private URL and refuses collection when its resolver fails', async (t) => {
  let resolveCount = 0
  const env = environment(t, (action) => {
    if (action === 'generation.get') return completeTask()
    resolveCount += 1
    if (resolveCount === 2) throw { errMsg: 'private-url unavailable' }
    const response = resolvedAssets()
    response.assets[0].expiresAt = Date.now() - 1
    return response
  })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.canSave, true)
  await page.saveArtwork()
  assert.equal(resolveCount, 2)
  assert.equal(env.storage.has('craftWorks'), false)
  assert.equal(page.data.canSave, false)
  assert.ok(page.data.imageError)
})

test('canceling a new creation from an unknown result preserves the original task and its queries', async (t) => {
  const env = environment(t, () => ({ taskId: 'task-1', status: 'unknown', input: taskInput }))
  const original = { clientRequestId: 'original-request', taskId: 'task-1', status: 'unknown', input: taskInput }
  env.storage.set('aiGenerationActive', structuredClone(original))
  const modals = []
  global.wx.showModal = (options) => { modals.push(options); options.success({ confirm: false, cancel: true }) }
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  const before = structuredClone(env.storage.get('aiGenerationActive'))
  await page.createAgain()
  assert.equal(modals.length, 1)
  assert.equal(modals[0].content, '上次生成结果尚未确认，再次生成可能额外计费')
  assert.deepEqual(env.navigations, [])
  assert.deepEqual(env.storage.get('aiGenerationActive'), before)
  await env.nextPoll()
  assert.ok(env.calls.every((call) => call.action === 'generation.get' && call.payload.taskId === 'task-1'))
})

test('confirming the unknown-result cost notice allows new creation without changing its original task id', async (t) => {
  const env = environment(t, () => ({ taskId: 'task-1', status: 'unknown', input: taskInput }))
  env.storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'task-1', status: 'unknown', input: taskInput })
  let modals = 0
  global.wx.showModal = (options) => { modals += 1; options.success({ confirm: true, cancel: false }) }
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  await page.createAgain()
  assert.equal(modals, 1)
  assert.deepEqual(env.navigations, ['/pages/ai-create/index'])
  assert.equal(env.storage.get('aiGenerationActive').taskId, 'task-1')
  assert.equal(env.storage.get('aiGenerationActive').clientRequestId, 'original-request')
  assert.equal(env.storage.get('aiGenerationActive').newCreationConsentFor, 'task-1')
  assert.equal(env.calls.some((call) => call.action === 'generation.create'), false)
})

test('known terminal results can return to creative editing without an unknown-result cost notice', async (t) => {
  let status = 'failed'
  const env = environment(t, (action) => action === 'generation.get' ? { ...completeTask(), status } : resolvedAssets())
  global.wx.showModal = () => assert.fail('A confirmed terminal outcome does not need the unknown-cost warning')
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  await page.createAgain()
  status = 'succeeded'
  await page.onShow()
  await page.createAgain()
  assert.equal(env.navigations.length, 2)
})

test('a transport-unknown result persists uncertainty so returning to the creative page cannot bypass its notice', async (t) => {
  const env = environment(t, () => { throw { errMsg: 'timeout' } })
  env.storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'task-1', status: 'running', input: taskInput })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.status, 'unknown')
  assert.equal(env.storage.get('aiGenerationActive').status, 'unknown')
  assert.equal(env.storage.get('aiGenerationActive').taskId, 'task-1')
})

test('result title and introduction follow each creation prompt and can be saved without naming first', async (t) => {
  let prompt = '以月色与荷塘为主题的青花瓷瓶'
  const env = environment(t, (action) => action === 'generation.get'
    ? { ...completeTask(), input: { ...taskInput, userPrompt: prompt } }
    : resolvedAssets())
  let page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.equal(page.data.workName, '月下莲华')
  assert.match(page.data.artworkIntro, /月色|荷塘/)
  assert.match(page.data.artworkIntro, /灵感/)
  await page.saveArtwork()
  assert.equal(env.storage.get('craftWorks')[0].name, '月下莲华')
  page.onUnload()
  prompt = '一件描绘青竹的瓷瓶'
  page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.notEqual(page.data.workName, '月下莲华')
  assert.match(page.data.artworkIntro, /竹/)
  assert.doesNotMatch(page.data.artworkIntro, /荷塘/)
})

test('generic creative prompts keep a short grounded title without assuming the moon-lotus theme', async (t) => {
  const env = environment(t, (action) => action === 'generation.get'
    ? { ...completeTask(), input: { userPrompt: '简洁的几何纹杯子', styleId: 'monochrome', styleName: '单色釉' } }
    : resolvedAssets())
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  assert.ok(page.data.workName.length > 0 && page.data.workName.length <= 24)
  assert.match(page.data.artworkIntro, /几何纹杯子/)
  assert.match(page.data.artworkIntro, /单色釉/)
  assert.doesNotMatch(`${page.data.workName}${page.data.artworkIntro}`, /月下莲华|荷塘/)
})

test('renaming is optional and a blank dismissed edit restores a usable default name', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  page.editName()
  assert.equal(page.data.editingName, true)
  page.nameInput({ detail: { value: '  ' } })
  page.finishNameEditing()
  assert.equal(page.data.editingName, false)
  assert.ok(page.data.workName.trim())
  await page.saveArtwork()
  assert.equal(env.storage.get('craftWorks').length, 1)
})

test('regenerate opens a fresh editor without requiring a draft write or creating a paid task', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  env.storage.set('aiCraftDraft', { otherSetting: 'keep', prompt: 'older draft', selectedStyle: 'fencai' })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  global.wx.setStorageSync = () => { throw new Error('draft storage unavailable') }
  await page.createAgain()
  assert.deepEqual(env.navigations, ['/pages/ai-create/index'])
  assert.equal(env.storage.get('aiCraftDraft').prompt, 'older draft')
  assert.equal(env.storage.get('aiCraftDraft').selectedStyle, 'fencai')
  assert.equal(env.storage.get('aiCraftDraft').otherSetting, 'keep')
  assert.equal(env.calls.some((call) => call.action === 'generation.create'), false)
})

test('result design uses the shared creation frame and keeps recovery controls separate from saved output', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/ai-result/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.resolve(__dirname, '../pages/ai-result/index.wxss'), 'utf8')
  assert.match(wxml, /creation-nav-title[^>]*>AI创瓷</)
  assert.match(wxml, /以文字为笔，创造独属于你的东方瓷器/)
  assert.match(wxml, /正在为你生成瓷器作品/)
  assert.match(wxml, /AI正在描绘你的灵感/)
  assert.match(wxml, /visuals\.loading/)
  assert.match(wxml, /artworkIntro/)
  assert.match(wxml, /重新生成/)
  assert.match(wxml, /保存作品/)
  assert.match(wxml, /bindtap="refreshResult"/)
  assert.match(wxml, /bindtap="createAgain"/)
  assert.doesNotMatch(wxml, /open-type="share"|<button\b/)
  assert.match(wxss, /@import ['"]\.\.\/\.\.\/styles\/ai-creation\.wxss['"]/)
})

test('a displayed artwork load failure offers recovery and cannot save a broken preview', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  page.artworkImageError()
  assert.equal(page.data.canSave, false)
  assert.equal(page.data.image, '')
  assert.ok(page.data.imageError)
  await page.saveArtwork()
  assert.equal(env.storage.has('craftWorks'), false)
  await page.refreshResult()
  assert.equal(page.data.canSave, true)
  assert.ok(page.data.image)
})

test('saving keeps the regenerate view disabled until saving finishes', async (t) => {
  let releaseAsset
  let resolves = 0
  const env = environment(t, (action) => {
    if (action === 'generation.get') return completeTask()
    resolves += 1
    if (resolves === 2) return new Promise((resolve) => { releaseAsset = resolve })
    const assets = resolvedAssets()
    assets.assets[0].expiresAt = Date.now() - 1
    return assets
  })
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  const saving = page.saveArtwork()
  assert.equal(page.data.saving, true)
  await page.createAgain()
  assert.deepEqual(env.navigations, [])
  releaseAsset(resolvedAssets())
  await saving
  assert.equal(page.data.saved, true)
  assert.equal(page.data.saving, false)
})

test('regenerating repeatedly returns to the nearest creation editor without growing the page stack', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  const stack = [{ route: 'pages/home/index' }, { route: 'pages/ai-create/index' }]
  const deltas = []
  global.getCurrentPages = () => stack
  global.wx.navigateBack = (options) => { deltas.push(options.delta); stack.splice(stack.length - options.delta) }
  global.wx.redirectTo = () => assert.fail('Existing creation editor should be reused')
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  for (let cycle = 0; cycle < 12; cycle += 1) {
    stack.push({ route: 'pages/ai-result/index' })
    await page.createAgain()
    assert.equal(stack.length, 2)
    assert.equal(stack[1].route, 'pages/ai-create/index')
  }
  assert.deepEqual(deltas, Array(12).fill(1))
  assert.deepEqual(env.navigations, [])
  assert.equal(env.storage.get('aiCraftDraft'), undefined)
  assert.equal(env.calls.some((call) => call.action === 'generation.create'), false)
  stack.push({ route: 'pages/ai-create/index' }, { route: 'pages/ai-result/index' })
  await page.createAgain()
  assert.equal(stack.length, 3, 'Use the closest editor when older editors are also in the stack')
  assert.equal(deltas.at(-1), 1)
})

test('a directly opened result replaces itself with a creation editor instead of pushing another page', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  global.getCurrentPages = () => [{ route: 'pages/works/index' }, { route: 'pages/ai-result/index' }]
  const redirects = []
  global.wx.redirectTo = (options) => redirects.push(options.url)
  global.wx.navigateBack = () => assert.fail('There is no creation editor in the stack')
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  await page.createAgain()
  assert.deepEqual(redirects, ['/pages/ai-create/index'])
  assert.deepEqual(env.navigations, [])
  assert.equal(env.storage.get('aiCraftDraft'), undefined)
})

test('an asynchronous back failure replaces the result with its editor without adding a page', async (t) => {
  const env = environment(t, (action) => action === 'generation.get' ? completeTask() : resolvedAssets())
  global.getCurrentPages = () => [{ route: 'pages/ai-create/index' }, { route: 'pages/ai-result/index' }]
  let backOptions
  const redirects = []
  global.wx.navigateBack = (options) => { backOptions = options }
  global.wx.redirectTo = (options) => redirects.push(options.url)
  const page = env.load({ taskId: 'task-1' })
  await page.onShow()
  await page.createAgain()
  assert.equal(backOptions.delta, 1)
  assert.deepEqual(redirects, [])
  backOptions.fail({ errMsg: 'navigateBack:fail' })
  assert.deepEqual(redirects, ['/pages/ai-create/index'])
  assert.deepEqual(env.navigations, [])
  assert.equal(env.calls.some((call) => call.action === 'generation.create'), false)
})

test('the full works collection is available before saving and cannot interrupt a pending save or confirmation', async t => {
  const env = environment(t, () => assert.fail('Opening the collection must not save or generate the current task'))
  const page = env.load({ taskId: 'task-1' })
  assert.equal(page.data.saved, false)
  page.viewWorks()
  assert.deepEqual(env.navigations, ['/pages/works/index?type=ai'])
  page._saving = true
  page.viewWorks()
  page._saving = false
  page._confirmingNewCreation = true
  page.viewWorks()
  assert.equal(env.navigations.length, 1)
  const template = fs.readFileSync(path.resolve(__dirname, '../pages/ai-result/index.wxml'), 'utf8')
  assert.doesNotMatch(template, /<view[^>]*wx:if="\{\{saved\}\}"[^>]*class="result-saved-note"/)
})
