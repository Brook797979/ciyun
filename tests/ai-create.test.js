const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages/ai-create/index.js')

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
    switchTab(options) { navigations.push(['tab', options.url]) },
    navigateTo(options) { navigations.push(['navigate', options.url]) },
    navigateBack(options) { navigations.push(['back', options.delta]) },
    request() { assert.fail('AI creation must not call an unconfigured service') },
    ...overrides
  }
  global.getCurrentPages = () => []
  t.after(() => {
    global.wx = originalWx
    global.getCurrentPages = originalPages
  })
  return { storage, toasts, navigations }
}

function loadPage() {
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
    setData(update) { Object.assign(this.data, update) }
  }
}

function selection(id) { return { currentTarget: { dataset: { id } } } }
function keyword(value) { return { currentTarget: { dataset: { keyword: value } } } }
function input(value) { return { detail: { value } } }

function buildRequest(prompt, styleId) {
  return require('../utils/ai-generation').buildGenerationRequest(prompt, styleId)
}

test('AI data offers five named styles and two replaceable-image examples', () => {
  const dataPath = path.join(root, 'data/ai-create.js')
  assert.ok(fs.existsSync(dataPath), 'AI creation needs its editable content catalog')
  const data = require(dataPath)
  assert.deepEqual(data.styles.map((item) => item.name), ['青花', '粉彩', '单色釉', '水墨写意', '仿古风格'])
  assert.equal(new Set(data.styles.map((item) => item.id)).size, 5)
  for (const style of data.styles) {
    assert.equal(typeof style.summary, 'string')
    assert.ok(style.summary.trim(), `${style.name} needs a visible description`)
    assert.equal(typeof style.generationPrompt, 'string')
    assert.ok(style.generationPrompt.trim().length > style.name.length, `${style.name} needs actual visual instructions`)
  }
  assert.equal(new Set(data.styles.map((item) => item.generationPrompt)).size, 5)
  assert.deepEqual(data.examples.map((item) => item.title), ['月映山居', '花鸟春韵'])
  for (const item of [...data.styles, ...data.examples]) {
    assert.match(item.image, /^\/assets\/ai-create\/[a-z-]+\.jpg$/)
    assert.ok(fs.existsSync(path.join(root, item.image)), `Missing AI artwork: ${item.image}`)
  }
  for (const example of data.examples) {
    assert.ok(example.description.trim())
    assert.ok(example.prompt.trim() && example.prompt.length <= 200)
    assert.ok(data.styles.some((style) => style.id === example.styleId))
    assert.ok(example.tags.length > 0)
  }
})

test('AI creation starts blank and retains the compatible style, keyword and navigation contracts', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(page.data.prompt, '')
  assert.equal(page.data.promptLength, 0)
  assert.equal(page.data.selectedStyle, 'qinghua')
  assert.equal(page.data.keywords.length, 6)
  assert.deepEqual(page.data.tabs.map(({ id, name, url }) => [id, name, url]), [
    ['home', '首页', '/pages/home/index'], ['museum', '瓷馆', '/pages/museum/index'],
    ['workshop', '工坊', '/pages/workshop/index'], ['challenge', '挑战', '/pages/challenge/index'],
    ['profile', '我的', '/pages/profile/index']
  ])
  for (const tab of page.data.tabs) {
    assert.equal(tab.icon, `/assets/icons/tab-${tab.id}.png`)
    assert.equal(tab.iconActive, `/assets/icons/tab-${tab.id}-active.png`)
  }
})

test('typing enforces the 200-character limit and updates the visible counter', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadPage()
  page.input(input('青花山水'.repeat(60)))
  assert.equal(page.data.prompt, '青花山水'.repeat(50))
  assert.equal(page.data.promptLength, 200)
  page.input(input('春山如黛'))
  assert.equal(page.data.prompt, '春山如黛')
  assert.equal(page.data.promptLength, 4)
  for (const event of [undefined, {}, input(null), input(12)]) page.input(event)
  assert.equal(page.data.prompt, '春山如黛')
  assert.deepEqual(toasts, [], 'typing must not trigger save notifications')
})

test('style selection accepts catalog ids and ignores malformed or unknown ids', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.selectStyle, 'function')
  for (const style of page.data.styles) {
    page.selectStyle(selection(style.id))
    assert.equal(page.data.selectedStyle, style.id)
  }
  const selectedStyle = page.data.selectedStyle
  for (const event of [undefined, {}, selection('missing')]) page.selectStyle(event)
  assert.equal(page.data.selectedStyle, selectedStyle)
})

test('keyword taps append a separator once and reject unlisted input', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.addKeyword, 'function')
  const [first, second] = page.data.keywords
  page.addKeyword(keyword(first))
  assert.equal(page.data.prompt, first)
  page.addKeyword(keyword(second))
  assert.equal(page.data.prompt, `${first}、${second}`)
  page.addKeyword(keyword(first))
  for (const event of [undefined, {}, keyword('unlisted'), keyword(null)]) page.addKeyword(event)
  assert.equal(page.data.prompt, `${first}、${second}`)
  assert.equal(page.data.promptLength, page.data.prompt.length)
})

test('a keyword that would exceed 200 characters leaves the existing description intact', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.addKeyword, 'function')
  page.input(input('瓷'.repeat(199)))
  page.addKeyword(keyword(page.data.keywords[0]))
  assert.equal(page.data.prompt, '瓷'.repeat(199))
  assert.equal(page.data.promptLength, 199)
  assert.ok(toasts.some(({ title }) => /200/.test(title)))
})

test('keyword refresh cycles through three six-word batches without altering the prompt', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.refreshKeywords, 'function')
  page.input(input('保留我的山水创意'))
  const batches = [page.data.keywords.slice()]
  for (let i = 0; i < 3; i += 1) {
    page.refreshKeywords()
    assert.equal(page.data.keywords.length, 6)
    assert.equal(page.data.prompt, '保留我的山水创意')
    assert.equal(page.data.promptLength, 8)
    batches.push(page.data.keywords.slice())
  }
  assert.notDeepEqual(batches[0], batches[1])
  assert.notDeepEqual(batches[1], batches[2])
  assert.deepEqual(batches[3], batches[0])
})

test('random inspiration avoids the current prompt and selects its matching style', (t) => {
  createEnvironment(t)
  const originalRandom = Math.random
  Math.random = () => 0
  t.after(() => { Math.random = originalRandom })
  const page = loadPage()
  assert.equal(typeof page.randomInspiration, 'function')
  const seen = new Map()
  for (let i = 0; i < 3; i += 1) {
    const previous = page.data.prompt
    page.randomInspiration()
    assert.ok(page.data.prompt.trim())
    assert.notEqual(page.data.prompt, previous)
    assert.equal(page.data.promptLength, page.data.prompt.length)
    assert.ok(page.data.promptLength <= 200)
    assert.ok(page.data.styles.some((style) => style.id === page.data.selectedStyle))
    if (seen.has(page.data.prompt)) assert.equal(page.data.selectedStyle, seen.get(page.data.prompt))
    seen.set(page.data.prompt, page.data.selectedStyle)
  }
  assert.ok(seen.size >= 2)
})

test('applying an example restores its description and style then acknowledges the action', (t) => {
  const { toasts } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.applyExample, 'function')
  for (const example of page.data.examples) {
    page.applyExample(selection(example.id))
    assert.equal(page.data.prompt, example.prompt)
    assert.equal(page.data.promptLength, example.prompt.length)
    assert.equal(page.data.selectedStyle, example.styleId)
  }
  const state = structuredClone(page.data)
  for (const event of [undefined, {}, selection('missing')]) page.applyExample(event)
  assert.deepEqual(page.data, state)
  assert.equal(toasts.length, 2)
  assert.ok(toasts.every(({ title }) => /已套用/.test(title)))
})

test('loading starts blank even when a valid older draft exists and retains its unrelated metadata', (t) => {
  const { storage } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  const draft = { prompt: '江南烟雨', selectedStyle: page.data.styles[1].id, legacy: { keep: true } }
  storage.set('aiCraftDraft', draft)
  page.onLoad()
  assert.equal(page.data.prompt, '')
  assert.equal(page.data.promptLength, 0)
  assert.equal(page.data.selectedStyle, 'qinghua')
  assert.deepEqual(storage.get('aiCraftDraft'), draft)
})

test('malformed or overlong older drafts cannot replace the blank initial editor', (t) => {
  const { storage } = createEnvironment(t)
  for (const draft of [null, [], 'broken', { prompt: 12, selectedStyle: 'missing' }]) {
    storage.set('aiCraftDraft', draft)
    const page = loadPage()
    assert.equal(typeof page.onLoad, 'function')
    page.onLoad()
    assert.equal(page.data.prompt, '')
    assert.equal(page.data.promptLength, 0)
    assert.equal(page.data.selectedStyle, 'qinghua')
  }
  storage.set('aiCraftDraft', { prompt: '山'.repeat(220), selectedStyle: 'qinghua' })
  const page = loadPage()
  page.onLoad()
  assert.equal(page.data.prompt, '')
  assert.equal(page.data.promptLength, 0)
})

test('leaving a loaded page saves its prompt, style and generation request while retaining other draft keys', (t) => {
  const { storage, toasts } = createEnvironment(t)
  storage.set('aiCraftDraft', { legacy: { keep: 'yes' }, generated: false })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.equal(typeof page.onHide, 'function')
  page.onLoad()
  page.input(input('青花竹影'))
  page.selectStyle(selection(page.data.styles[2].id))
  page.onHide()
  assert.deepEqual(storage.get('aiCraftDraft'), {
    legacy: { keep: 'yes' }, generated: false, prompt: '青花竹影', selectedStyle: page.data.styles[2].id,
    generationRequest: buildRequest('青花竹影', page.data.styles[2].id)
  })
  assert.deepEqual(toasts, [])
})

test('unloading preserves new input and style without requiring generation', (t) => {
  const { storage, toasts } = createEnvironment(t)
  storage.set('aiCraftDraft', { source: 'legacy', nested: { keep: true } })
  const page = loadPage()
  assert.equal(typeof page.onUnload, 'function')
  page.onLoad()
  page.input(input('月下竹影，清风入瓷'))
  page.selectStyle(selection(page.data.styles[3].id))
  page.onUnload()
  assert.deepEqual(storage.get('aiCraftDraft'), {
    source: 'legacy', nested: { keep: true }, prompt: '月下竹影，清风入瓷', selectedStyle: page.data.styles[3].id,
    generationRequest: buildRequest('月下竹影，清风入瓷', page.data.styles[3].id)
  })
  assert.deepEqual(toasts, [])
})

test('unloading before loading does not replace an existing draft', (t) => {
  const { storage, toasts } = createEnvironment(t)
  const draft = { prompt: '已保存的创意', selectedStyle: 'qinghua', keep: true }
  storage.set('aiCraftDraft', draft)
  const page = loadPage()
  assert.equal(typeof page.onUnload, 'function')
  page.onUnload()
  assert.deepEqual(storage.get('aiCraftDraft'), draft)
  assert.deepEqual(toasts, [])
})

test('storage read errors keep the page usable and never overwrite an unread draft', (t) => {
  const { storage, toasts } = createEnvironment(t, {
    getStorageSync() { throw new Error('unavailable') }
  })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.equal(typeof page.onHide, 'function')
  assert.doesNotThrow(() => page.onLoad())
  page.input(input('青花竹影'))
  assert.doesNotThrow(() => page.generate())
  assert.doesNotThrow(() => page.onHide())
  assert.equal(storage.has('aiCraftDraft'), false)
  assert.ok(toasts.some(({ title }) => /失败/.test(title)))
  assert.equal(toasts.some(({ title }) => /已保存/.test(title)), false)
})

test('generation validates an empty description without saving or inventing output', (t) => {
  const { storage, toasts } = createEnvironment(t)
  const page = loadPage()
  page.input(input('   '))
  page.generate()
  assert.equal(storage.has('aiCraftDraft'), false)
  assert.equal(page.data.generated, undefined)
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].title, /描述/)
})

test('generation saves a valid draft, submits its real request and opens its task result', async (t) => {
  const requests = []
  const { storage, toasts, navigations } = createEnvironment(t, { cloud: { callFunction(options) {
    requests.push(options.data)
    return Promise.resolve({ result: { ok: true, data: { taskId: 'task-1', status: 'queued' } } })
  } } })
  storage.set('aiCraftDraft', { source: 'legacy' })
  const page = loadPage()
  page.input(input('青花山水'))
  await page.generate()
  assert.deepEqual(storage.get('aiCraftDraft'), {
    source: 'legacy', prompt: '青花山水', selectedStyle: 'qinghua',
    generationRequest: buildRequest('青花山水', 'qinghua')
  })
  assert.deepEqual(toasts, [])
  assert.equal(page.data.generated, undefined)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].action, 'generation.create')
  assert.equal(requests[0].payload.userPrompt, '青花山水')
  assert.equal(requests[0].payload.styleId, 'qinghua')
  assert.ok(requests[0].payload.clientRequestId)
  assert.deepEqual(navigations, [['navigate', '/pages/ai-result/index?taskId=task-1']])
})

test('storage write failure cannot announce generation success', (t) => {
  const { storage, toasts } = createEnvironment(t, {
    setStorageSync() { throw new Error('full') }
  })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.equal(typeof page.onHide, 'function')
  page.onLoad()
  page.input(input('青花山水'))
  assert.doesNotThrow(() => page.generate())
  assert.doesNotThrow(() => page.onHide())
  assert.equal(storage.has('aiCraftDraft'), false)
  assert.ok(toasts.length > 0 && toasts.every(({ title }) => /失败/.test(title)))
})

test('native metrics keep the input heading below the capsule and respect the bottom safe area', (t) => {
  createEnvironment(t, {
    getWindowInfo() { return { windowWidth: 390, windowHeight: 844, statusBarHeight: 44, safeArea: { bottom: 810 } } },
    getMenuButtonBoundingClientRect() { return { top: 52, bottom: 84, height: 32 } }
  })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad()
  assert.equal(page.data.statusBarHeight, 44)
  assert.equal(page.data.navTop, 52)
  assert.equal(page.data.navHeight, 32)
  assert.equal(page.data.brandTop, 84 + 12 * 390 / 750)
  assert.equal(page.data.heroHeight, 84 + 240 * 390 / 750)
  assert.ok(page.data.taglineTop > page.data.navTop + page.data.navHeight)
  assert.equal(page.data.safeBottom, 34)
})

test('missing, throwing or invalid native APIs retain safe layout defaults', (t) => {
  createEnvironment(t, { getWindowInfo: undefined, getMenuButtonBoundingClientRect: undefined })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.doesNotThrow(() => page.onLoad())
  assert.equal(page.data.statusBarHeight, 24)
  assert.equal(page.data.navTop, 30)
  assert.equal(page.data.navHeight, 32)
  assert.equal(page.data.brandTop, 68)
  assert.equal(page.data.heroHeight, 182)
  global.wx.getWindowInfo = () => { throw new Error('unavailable') }
  global.wx.getSystemInfoSync = () => ({ windowWidth: 375, statusBarHeight: 48, windowHeight: 812 })
  for (const menu of [null, { top: 20, height: 32 }, { top: 60, height: -5 }]) {
    global.wx.getMenuButtonBoundingClientRect = () => menu
    const fallback = loadPage()
    fallback.onLoad()
    assert.equal(fallback.data.statusBarHeight, 48)
    assert.equal(fallback.data.navTop, 54)
    assert.equal(fallback.data.navHeight, 32)
  }
  global.wx.getMenuButtonBoundingClientRect = () => { throw new Error('unavailable') }
  assert.doesNotThrow(() => page.onLoad())
})

test('invalid safe-area dimensions do not add an oversized bottom spacer', (t) => {
  createEnvironment(t)
  for (const safeArea of [undefined, null, {}, { bottom: null }, { bottom: -1 }, { bottom: 900 }]) {
    global.wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 24, safeArea })
    const page = loadPage()
    assert.equal(typeof page.onLoad, 'function')
    page.onLoad()
    assert.equal(page.data.safeBottom, 0)
  }
})

test('resize updates safe metrics without changing the description or selected style', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.onResize, 'function')
  page.onLoad()
  page.input(input('保留创意'))
  page.selectStyle(selection(page.data.styles[1].id))
  global.wx.getWindowInfo = () => ({ windowWidth: 430, windowHeight: 932, statusBarHeight: 44, safeArea: { bottom: 898 } })
  global.wx.getMenuButtonBoundingClientRect = () => ({ top: 50, height: 32 })
  page.onResize({ size: { windowWidth: 430, windowHeight: 932 } })
  assert.equal(page.data.heroHeight, 82 + 240 * 430 / 750)
  assert.equal(page.data.safeBottom, 34)
  assert.equal(page.data.prompt, '保留创意')
  assert.equal(page.data.selectedStyle, page.data.styles[1].id)
})

test('tab taps validate catalog ids or urls before using shared navigation', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.onTabTap, 'function')
  page.onTabTap(selection('museum'))
  page.onTabTap({ currentTarget: { dataset: { url: '/pages/challenge/index' } } })
  for (const event of [undefined, {}, selection('missing'), { currentTarget: { dataset: { url: 'https://example.com' } } }]) page.onTabTap(event)
  assert.deepEqual(navigations, [['tab', '/pages/museum/index'], ['tab', '/pages/challenge/index']])
})

test('back uses the native stack and returns direct entries to workshop', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.goBack, 'function')
  global.getCurrentPages = () => [{ route: 'pages/workshop/index' }, { route: 'pages/ai-create/index' }]
  page.goBack()
  global.getCurrentPages = undefined
  page.goBack()
  global.getCurrentPages = () => [{}, {}]
  global.wx.navigateBack = undefined
  assert.doesNotThrow(() => page.goBack())
  assert.deepEqual(navigations, [['back', 1], ['tab', '/pages/workshop/index'], ['tab', '/pages/workshop/index']])
})

test('one creative description produces five distinct requests with the selected visual instructions', () => {
  const catalog = require('../data/ai-create')
  const description = '设计一件瓷瓶，以月夜竹影为主题'
  const requests = catalog.styles.map((style) => {
    const request = buildRequest(description, style.id)
    assert.equal(request.version, 1)
    assert.equal(request.userPrompt, description)
    assert.equal(request.styleId, style.id)
    assert.equal(request.styleName, style.name)
    assert.equal(typeof request.prompt, 'string')
    assert.ok(request.prompt.includes(description), 'The chosen style must retain the creative subject')
    assert.ok(style.generationPrompt && request.prompt.includes(style.generationPrompt), 'The request must carry visual instructions, not just a style id')
    return request
  })
  assert.equal(new Set(requests.map((request) => request.prompt)).size, 5)
})

test('generation request normalizes input and safely falls back from an unknown style', () => {
  for (const value of ['', '  \n ', undefined, null, 12, {}, []]) {
    assert.equal(buildRequest(value, 'qinghua'), null)
  }
  const request = buildRequest(`  ${'瓷'.repeat(210)}  `, 'unknown')
  assert.equal(request.userPrompt, '瓷'.repeat(200))
  assert.equal(request.styleId, 'qinghua')
  assert.equal(request.styleName, '青花')
  assert.deepEqual(buildRequest('  月夜竹影  ', undefined), buildRequest('月夜竹影', 'qinghua'))
})

test('a pastel description with antique selected keeps its subject and gives the chosen style explicit priority', () => {
  const description = '设计一件粉彩瓷瓶，以花鸟春韵为主题。使用柔和的粉色、嫩绿和淡黄色。'
  const request = buildRequest(description, 'antique')
  assert.equal(request.styleId, 'antique')
  assert.equal(request.userPrompt, description, 'Style selection must not rewrite the user input')
  assert.match(request.prompt, /仿古/)
  assert.match(request.prompt, /以所选风格为准/)
  assert.match(request.prompt, /器型/)
  assert.match(request.prompt, /主题/)
  assert.ok(request.prompt.includes(require('../data/ai-create').styles.find((style) => style.id === 'antique').generationPrompt))
})

test('switching styles before generation saves the latest request without changing the description', async (t) => {
  const { storage, toasts } = createEnvironment(t, { cloud: { callFunction() { return Promise.resolve({ result: { ok: true, data: { taskId: 'task', status: 'succeeded' } } }) } } })
  const page = loadPage()
  page.onLoad()
  page.input(input('月夜竹影瓷瓶'))
  page.selectStyle(selection('qinghua'))
  await page.generate()
  const firstRequest = structuredClone(storage.get('aiCraftDraft').generationRequest)
  assert.ok(firstRequest)
  page.onHide()
  page.onShow()
  page.input(input('月夜竹影瓷瓶'))
  page.selectStyle(selection('antique'))
  await page.generate()
  const draft = storage.get('aiCraftDraft')
  assert.equal(page.data.prompt, '月夜竹影瓷瓶')
  assert.equal(draft.selectedStyle, 'antique')
  assert.deepEqual(draft.generationRequest, buildRequest('月夜竹影瓷瓶', 'antique'))
  assert.notEqual(draft.generationRequest.prompt, firstRequest.prompt)
  assert.deepEqual(toasts, [])
})

test('submission locks immediately and freezes the prompt and style while the editable draft changes', async (t) => {
  let respond
  const calls = []
  const { storage, navigations } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data.payload)
    return new Promise((resolve) => { respond = resolve })
  } } })
  const page = loadPage()
  page.onLoad()
  page.input(input('月夜竹影'))
  page.selectStyle(selection('ink'))
  const submission = page.generate()
  assert.equal(page.data.submitting, true)
  page.generate()
  page.input(input('新创意'))
  page.selectStyle(selection('antique'))
  page.onHide()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].userPrompt, '月夜竹影')
  assert.equal(calls[0].styleId, 'ink')
  assert.equal(storage.get('aiCraftDraft').prompt, '新创意')
  assert.equal(storage.get('aiGenerationActive').input.userPrompt, '月夜竹影')
  respond({ result: { ok: true, data: { taskId: 'frozen-task', status: 'queued' } } })
  await submission
  assert.equal(page.data.submitting, true)
  assert.deepEqual(navigations, [['navigate', '/pages/ai-result/index?taskId=frozen-task']])
})

test('a timed-out submission restores the original request id and input without creating another job', async (t) => {
  const calls = []
  let attempt = 0
  const { storage, navigations } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(structuredClone(options.data.payload))
    attempt += 1
    return attempt === 1
      ? Promise.reject({ errMsg: 'callFunction:fail timeout' })
      : Promise.resolve({ result: { ok: true, data: { taskId: 'recovered-task', status: 'running' } } })
  } } })
  let page = loadPage()
  page.onLoad()
  page.input(input('原始竹影'))
  await page.generate()
  assert.equal(page.data.recoveryPending, true)
  assert.equal(storage.get('aiGenerationActive').status, 'unknown')
  page.input(input('后续编辑'))
  page.onUnload()
  page = loadPage()
  page.onLoad()
  assert.equal(page.data.prompt, '')
  await page.retryGeneration()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], calls[0])
  assert.equal(calls[1].userPrompt, '原始竹影')
  assert.deepEqual(navigations, [['navigate', '/pages/ai-result/index?taskId=recovered-task']])
})

test('server configuration failure is visible and never navigates to an invented result', async (t) => {
  const { navigations } = createEnvironment(t, { cloud: { callFunction() {
    return Promise.resolve({ result: { ok: false, error: { code: 'CONFIG_MISSING', message: 'secret', retryable: false } } })
  } } })
  const page = loadPage()
  page.input(input('青花'))
  await page.generate()
  assert.equal(page.data.submitting, false)
  assert.ok(page.data.generationError)
  assert.equal(page.data.recoveryPending, false)
  assert.deepEqual(navigations, [])
  assert.equal(page.data.generated, undefined)
})

test('a provider timeout preserves the request for manual recovery rather than permitting a new job', async (t) => {
  const calls = []
  const { storage } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data.payload)
    return Promise.resolve({ result: { ok: false, error: { code: 'MODEL_TIMEOUT', retryable: true } } })
  } } })
  const page = loadPage()
  page.onLoad()
  page.input(input('原始创意'))
  await page.generate()
  assert.equal(page.data.recoveryPending, true)
  page.input(input('已改动的创意'))
  await page.generate()
  assert.deepEqual(calls[1], calls[0])
  assert.equal(storage.get('aiGenerationActive').status, 'unknown')
})

test('an interrupted submitting record is recoverable after reopening with its original payload', async (t) => {
  const calls = []
  const { storage } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data.payload)
    return Promise.resolve({ result: { ok: true, data: { taskId: 'restored-task', status: 'queued' } } })
  } } })
  storage.set('aiGenerationActive', { clientRequestId: 'original-request', status: 'submitting', input: { userPrompt: '原始创意', styleId: 'ink', styleName: '水墨写意' } })
  const page = loadPage()
  page.onLoad()
  assert.equal(page.data.recoveryPending, true)
  await page.retryGeneration()
  assert.deepEqual(calls, [{ clientRequestId: 'original-request', userPrompt: '原始创意', styleId: 'ink' }])
})

test('legacy showcase navigation remains compatible without claiming a live result', (t) => {
  const { navigations } = createEnvironment(t)
  const page = loadPage()
  page.selectExperience({ currentTarget: { dataset: { mode: 'showcase' } } })
  assert.equal(page.data.experienceMode, 'showcase')
  const example = page.data.generationCases[0]
  page.openCase(selection(example.id))
  assert.deepEqual(navigations, [['navigate', `/pages/ai-result/index?caseId=${example.id}`]])
  page.selectExperience({ currentTarget: { dataset: { mode: 'live' } } })
  assert.equal(page.data.experienceMode, 'live')
  assert.equal(page.data.generated, undefined)
})

test('an acknowledged unfinished task opens its existing result instead of submitting a second job', async (t) => {
  const calls = []
  const { navigations } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data)
    return Promise.resolve({ result: { ok: true, data: { taskId: 'active-task', status: 'running' } } })
  } } })
  const page = loadPage()
  page.onLoad()
  page.input(input('竹影'))
  await page.generate()
  page.onHide()
  page.onShow()
  page.input(input('另一份创意'))
  await page.generate()
  assert.equal(calls.length, 1)
  assert.deepEqual(navigations, [
    ['navigate', '/pages/ai-result/index?taskId=active-task'],
    ['navigate', '/pages/ai-result/index?taskId=active-task']
  ])
})

test('returning from a completed result reloads task status and permits an explicitly requested new design', async (t) => {
  const calls = []
  const { storage } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data)
    return Promise.resolve({ result: { ok: true, data: { taskId: `task-${calls.length}`, status: 'queued' } } })
  } } })
  const page = loadPage()
  page.onLoad()
  page.input(input('竹影'))
  await page.generate()
  storage.set('aiGenerationActive', { ...storage.get('aiGenerationActive'), status: 'succeeded' })
  page.onShow()
  page.input(input('新创意'))
  await page.generate()
  assert.equal(calls.length, 2)
  assert.notEqual(calls[0].payload.clientRequestId, calls[1].payload.clientRequestId)
  assert.equal(calls[1].payload.userPrompt, '新创意')
})

test('canceling the unknown-task cost notice cannot create a new request from the creative page', async (t) => {
  const calls = []
  const modals = []
  const { storage, navigations } = createEnvironment(t, {
    showModal(options) { modals.push(options); options.success({ confirm: false, cancel: true }) },
    cloud: { callFunction(options) { calls.push(options.data); return Promise.resolve({ result: { ok: true, data: { taskId: 'new-task', status: 'queued' } } }) } }
  })
  const original = { clientRequestId: 'original-request', taskId: 'original-task', status: 'unknown', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } }
  storage.set('aiGenerationActive', structuredClone(original))
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  await page.generate()
  assert.equal(modals.length, 1)
  assert.equal(modals[0].content, '上次生成结果尚未确认，再次生成可能额外计费')
  assert.deepEqual(calls, [])
  assert.deepEqual(navigations, [])
  assert.deepEqual(storage.get('aiGenerationActive'), original)
  await page.openRecentTask()
  assert.deepEqual(navigations, [['navigate', '/pages/ai-result/index?taskId=original-task']])
})

test('confirmed unknown-task new creation submits a fresh key only after the cost notice', async (t) => {
  const calls = []
  const events = []
  const { storage } = createEnvironment(t, {
    showModal(options) { events.push('confirmed'); options.success({ confirm: true }) },
    cloud: { callFunction(options) { events.push('submitted'); calls.push(options.data); return Promise.resolve({ result: { ok: true, data: { taskId: 'new-task', status: 'queued' } } }) } }
  })
  storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'original-task', status: 'unknown', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } })
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  await page.generate()
  assert.deepEqual(events, ['confirmed', 'submitted'])
  assert.equal(calls.length, 1)
  assert.notEqual(calls[0].payload.clientRequestId, 'original-request')
  assert.equal(calls[0].payload.userPrompt, '新的创意')
})

test('consent from the result page is scoped to its original task and is consumed by a new submission', async (t) => {
  const calls = []
  const { storage } = createEnvironment(t, {
    showModal() { assert.fail('The same task cost notice was already confirmed on its result page') },
    cloud: { callFunction(options) { calls.push(options.data); return Promise.resolve({ result: { ok: true, data: { taskId: 'new-task', status: 'queued' } } }) } }
  })
  storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'original-task', status: 'unknown', newCreationConsentFor: 'original-task', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } })
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  await page.generate()
  assert.equal(calls.length, 1)
  assert.equal(storage.get('aiGenerationActive').newCreationConsentFor, undefined)
})

test('an explicit new creation after an unresolved request also requires a cost notice and leaves it intact on cancel', async (t) => {
  const { storage } = createEnvironment(t, { showModal(options) { options.success({ confirm: false }) }, cloud: { callFunction() { assert.fail('Canceling must not submit a new request') } } })
  const original = { clientRequestId: 'original-request', status: 'unknown', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } }
  storage.set('aiGenerationActive', structuredClone(original))
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  await page.newCreation()
  assert.deepEqual(storage.get('aiGenerationActive'), original)
  assert.equal(page.data.recoveryPending, true)
})

test('unknown-task consent for another task cannot bypass the cost notice', async (t) => {
  let modals = 0
  const { storage } = createEnvironment(t, { showModal(options) { modals += 1; options.success({ confirm: false }) }, cloud: { callFunction() { assert.fail('Mismatched consent must not submit') } } })
  storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'original-task', status: 'unknown', newCreationConsentFor: 'different-task', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } })
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  await page.generate()
  assert.equal(modals, 1)
  assert.equal(storage.get('aiGenerationActive').taskId, 'original-task')
})

test('repeated taps during the cost notice cannot create multiple modals or jobs', async (t) => {
  let finishModal
  let modals = 0
  const calls = []
  const { storage } = createEnvironment(t, { showModal(options) { modals += 1; finishModal = options.success }, cloud: { callFunction(options) { calls.push(options.data); return Promise.resolve({ result: { ok: true, data: { taskId: 'new-task', status: 'queued' } } }) } } })
  storage.set('aiGenerationActive', { clientRequestId: 'original-request', taskId: 'original-task', status: 'unknown', input: { userPrompt: '原创意', styleId: 'ink', styleName: '水墨写意' } })
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  const first = page.generate()
  const second = page.generate()
  assert.equal(modals, 1)
  assert.equal(calls.length, 0)
  finishModal({ confirm: true })
  await Promise.all([first, second])
  assert.equal(calls.length, 1)
})

test('saving a fresh blank editor clears stale generation parameters without losing unrelated metadata', (t) => {
  const { storage } = createEnvironment(t)
  const oldRequest = { version: 1, userPrompt: '旧描述', styleId: 'qinghua', styleName: '青花', prompt: '旧提示词' }
  storage.set('aiCraftDraft', {
    prompt: '竹影与远山', selectedStyle: 'ink', generationRequest: oldRequest, custom: { keep: true }
  })
  const page = loadPage()
  page.onLoad()
  page.onHide()
  const draft = storage.get('aiCraftDraft')
  assert.equal(draft.generationRequest, null)
  assert.equal(draft.prompt, '')
  assert.equal(draft.selectedStyle, 'qinghua')
  assert.notDeepEqual(draft.generationRequest, oldRequest)
  assert.deepEqual(draft.custom, { keep: true })
})

test('clearing the description clears a previous generation request when the page saves', (t) => {
  const { storage } = createEnvironment(t)
  storage.set('aiCraftDraft', {
    prompt: '旧描述', selectedStyle: 'ink', generationRequest: { prompt: '已失效的提示词' }, keep: true
  })
  const page = loadPage()
  page.onLoad()
  page.input(input('   '))
  page.onUnload()
  const draft = storage.get('aiCraftDraft')
  assert.equal(draft.generationRequest, null)
  assert.equal(draft.prompt, '   ')
  assert.equal(draft.keep, true)
})

test('style metadata follows initialization, restoration and every selection source', (t) => {
  const { storage } = createEnvironment(t)
  const page = loadPage()
  const assertStyle = () => {
    const style = page.data.styles.find((item) => item.id === page.data.selectedStyle)
    assert.equal(page.data.selectedStyleName, style.name)
    assert.equal(page.data.selectedStyleSummary, style.summary)
    assert.ok(page.data.selectedStyleSummary.trim())
  }
  assertStyle()
  storage.set('aiCraftDraft', { prompt: '山水', selectedStyle: 'ink' })
  page.onLoad()
  assertStyle()
  for (const style of page.data.styles) {
    page.selectStyle(selection(style.id))
    assertStyle()
  }
  for (const example of page.data.examples) {
    page.applyExample(selection(example.id))
    assertStyle()
  }
  page.randomInspiration()
  assertStyle()
})

test('the focused input catalog provides four full-theme recommendations without changing model styles', () => {
  const catalog = require('../data/ai-create')
  assert.ok(Array.isArray(catalog.recommendations), 'The reference input page needs its four theme recommendations')
  assert.deepEqual(catalog.recommendations.map((item) => item.title), ['月下荷塘', '山水清韵', '花鸟春晓', '祥云瑞意'])
  assert.equal(new Set(catalog.recommendations.map((item) => item.id)).size, 4)
  for (const recommendation of catalog.recommendations) {
    assert.ok(recommendation.prompt.length > recommendation.title.length * 4, 'A recommendation must fill an actionable creative description')
    assert.ok(recommendation.prompt.length <= 200)
    assert.ok(catalog.styles.some((style) => style.id === recommendation.styleId))
  }
  assert.deepEqual(catalog.styles.map((style) => style.id), ['qinghua', 'fencai', 'monochrome', 'ink', 'antique'])
})

test('recommendation chips fill the complete theme and matching style for a real generation request', async (t) => {
  const calls = []
  const { storage } = createEnvironment(t, { cloud: { callFunction(options) {
    calls.push(options.data)
    return Promise.resolve({ result: { ok: true, data: { taskId: 'recommendation-task', status: 'queued' } } })
  } } })
  const page = loadPage()
  page.onLoad()
  assert.equal(typeof page.applyRecommendation, 'function')
  const recommendation = require('../data/ai-create').recommendations[2]
  page.applyRecommendation(selection(recommendation.id))
  assert.equal(page.data.prompt, recommendation.prompt)
  assert.equal(page.data.promptLength, recommendation.prompt.length)
  assert.equal(page.data.selectedStyle, recommendation.styleId)
  assert.equal(page.data.selectedRecommendation, recommendation.id)
  assert.equal(page.data.generated, undefined)
  await page.generate()
  assert.equal(calls[0].payload.userPrompt, recommendation.prompt)
  assert.equal(calls[0].payload.styleId, recommendation.styleId)
  assert.equal(storage.get('aiCraftDraft').generationRequest.userPrompt, recommendation.prompt)
})

test('recommendation chips reject malformed events and manual editing clears their selection', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.applyRecommendation, 'function')
  const recommendation = require('../data/ai-create').recommendations[0]
  page.applyRecommendation(selection(recommendation.id))
  const previous = structuredClone(page.data)
  for (const event of [undefined, {}, selection('missing'), selection(null)]) page.applyRecommendation(event)
  assert.deepEqual(page.data, previous)
  page.input(input('我自己的月夜构图'))
  assert.equal(page.data.selectedRecommendation, '')
  assert.equal(page.data.prompt, '我自己的月夜构图')
})

test('the input template focuses on creative text, four themes and one submit action', () => {
  const template = fs.readFileSync(path.join(root, 'pages/ai-create/index.wxml'), 'utf8')
  assert.match(template, /以文字为笔，创造独属于你的东方瓷器/)
  assert.match(template, /灵感推荐/)
  assert.match(template, /wx:for="\{\{recommendations\}\}"/)
  assert.match(template, /bindtap="applyRecommendation"/)
  assert.match(template, /bindtap="randomInspiration"/)
  assert.match(template, /<textarea[^>]+maxlength="200"[^>]+bindinput="input"/)
  assert.match(template, /bindtap="generate"/)
  assert.match(template, /bindtap="retryGeneration"/)
  assert.match(template, /bindtap="newCreation"/)
  assert.match(template, /visuals\.loading/)
  assert.ok(template.indexOf('class="creation-scene"') < template.indexOf('class="creation-hero'), 'The full-height scene must belong to the page rather than the short hero')
  assert.match(template, /placeholder="请输入你想生成的瓷器描述，例如：一只绘有月下荷塘的青花梅瓶"/)
  assert.doesNotMatch(template, /class="input-title"|↻/)
  const panelStart = template.indexOf('<view class="creation-panel')
  const panelTail = template.slice(panelStart)
  let depth = 0
  let panelEnd = 0
  for (const match of panelTail.matchAll(/<view\b[^>]*>|<\/view>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) { panelEnd = match.index + match[0].length; break }
  }
  assert.match(panelTail.slice(0, panelEnd), /class="input-recommendations"/, 'Theme recommendations belong inside the framed card')
  assert.match(template, /class="input-chip-flower"[^>]+src="\{\{visuals\.floret\}\}"/)
  assert.doesNotMatch(template, /<button\b|ai-style-list|ai-example-list|ai-experience-switch|ai-tabbar|风格选择|灵感示例|精选案例/)
})

test('view-based recent-task controls cannot interrupt a pending generation submission', async (t) => {
  let respond
  const { storage, navigations } = createEnvironment(t, { cloud: { callFunction() { return new Promise((resolve) => { respond = resolve }) } } })
  storage.set('aiGenerationActive', { clientRequestId: 'previous-request', taskId: 'previous-task', status: 'succeeded', input: { userPrompt: '旧创意', styleId: 'qinghua', styleName: '青花' } })
  const page = loadPage()
  page.onLoad()
  page.input(input('新的创意'))
  const pending = page.generate()
  await page.openRecentTask()
  assert.deepEqual(navigations, [])
  respond({ result: { ok: true, data: { taskId: 'new-task', status: 'queued' } } })
  await pending
  assert.deepEqual(navigations, [['navigate', '/pages/ai-result/index?taskId=new-task']])
})

test('entering or returning to creation resets the editor while preserving the submitted task', (t) => {
  const { storage } = createEnvironment(t)
  const oldDraft = { prompt: '历史作品乙：清风竹影梅瓶', selectedStyle: 'ink', sourceTask: 'history-b' }
  const active = { clientRequestId: 'saved-request', taskId: 'saved-task', status: 'queued', input: { userPrompt: oldDraft.prompt, styleId: 'ink' } }
  storage.set('aiCraftDraft', oldDraft)
  storage.set('aiGenerationActive', structuredClone(active))
  const page = loadPage()
  page.onLoad()
  const assertInitial = () => {
    assert.equal(page.data.prompt, '')
    assert.equal(page.data.promptLength, 0)
    assert.equal(page.data.selectedStyle, 'qinghua')
    assert.equal(page.data.selectedRecommendation, '')
  }
  assertInitial()
  page.onShow()
  assertInitial()
  page.applyRecommendation(selection('spring-blossoms'))
  assert.ok(page.data.prompt)
  page.onHide()
  page.onShow()
  assertInitial()
  assert.equal(page.data.activeTaskId, 'saved-task')
  assert.deepEqual(storage.get('aiGenerationActive'), active)
  global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
  assert.doesNotThrow(() => page.onShow())
  assertInitial()
})

test('both result navigation methods failing preserve the acknowledged task and allow recovery without resubmission', async (t) => {
  const calls = []
  const routes = []
  const { storage } = createEnvironment(t, {
    navigateTo(options) {
      routes.push(['navigate', options.url])
      queueMicrotask(() => { if (typeof options.fail === 'function') options.fail({ errMsg: 'navigateTo:fail page stack limit' }) })
    },
    redirectTo(options) {
      routes.push(['redirect', options.url])
      queueMicrotask(() => { if (typeof options.fail === 'function') options.fail({ errMsg: 'redirectTo:fail temporarily unavailable' }) })
    },
    cloud: { callFunction(options) {
      calls.push(options.data)
      return Promise.resolve({ result: { ok: true, data: { taskId: 'acknowledged-task', status: 'queued' } } })
    } }
  })
  const page = loadPage()
  page.onLoad()
  page.input(input('月下荷塘青花梅瓶'))
  await page.generate()
  await new Promise((resolve) => queueMicrotask(resolve))
  assert.match(page.data.generationError, /任务已提交.*继续/)
  assert.equal(page.data.activeTaskId, 'acknowledged-task')
  assert.equal(page.data.activeTaskPending, true)
  assert.equal(page.data.recoveryPending, false)
  assert.equal(storage.get('aiGenerationActive').taskId, 'acknowledged-task')
  const requestId = storage.get('aiGenerationActive').clientRequestId
  global.wx.navigateTo = (options) => { routes.push(['navigate', options.url]) }
  await page.openRecentTask()
  assert.equal(calls.length, 1)
  assert.equal(storage.get('aiGenerationActive').clientRequestId, requestId)
  assert.deepEqual(routes, [
    ['navigate', '/pages/ai-result/index?taskId=acknowledged-task'],
    ['redirect', '/pages/ai-result/index?taskId=acknowledged-task'],
    ['navigate', '/pages/ai-result/index?taskId=acknowledged-task']
  ])
})

test('persistent page stack exhaustion redirects to the same acknowledged result from submission and recent-task entry', async (t) => {
  const calls = []
  const routes = []
  const { storage } = createEnvironment(t, {
    navigateTo(options) {
      routes.push(['navigate', options.url])
      queueMicrotask(() => { if (typeof options.fail === 'function') options.fail({ errMsg: 'navigateTo:fail page stack limit' }) })
    },
    redirectTo(options) { routes.push(['redirect', options.url]); if (typeof options.success === 'function') options.success({}) },
    cloud: { callFunction(options) {
      calls.push(options.data)
      return Promise.resolve({ result: { ok: true, data: { taskId: 'stack-task', status: 'queued' } } })
    } }
  })
  const page = loadPage()
  page.onLoad()
  page.input(input('满栈时的月夜山水瓷瓶'))
  await page.generate()
  assert.deepEqual(routes, [['navigate', '/pages/ai-result/index?taskId=stack-task'], ['redirect', '/pages/ai-result/index?taskId=stack-task']])
  assert.equal(page.data.generationError, '')
  const requestId = storage.get('aiGenerationActive').clientRequestId
  page.onHide()
  page.onShow()
  await page.openRecentTask()
  await new Promise((resolve) => queueMicrotask(resolve))
  assert.deepEqual(routes.slice(2), [['navigate', '/pages/ai-result/index?taskId=stack-task'], ['redirect', '/pages/ai-result/index?taskId=stack-task']])
  assert.equal(calls.length, 1)
  assert.equal(storage.get('aiGenerationActive').taskId, 'stack-task')
  assert.equal(storage.get('aiGenerationActive').clientRequestId, requestId)
  assert.equal(page.data.recoveryPending, false)
})

test('generation keeps its loading screen through native navigation and restores editing only on return', async (t) => {
  let transition
  const calls = []
  const routes = []
  createEnvironment(t, {
    navigateTo(options) { routes.push(options.url); transition = options },
    navigateBack() { assert.fail('Generating must not go back first') },
    switchTab() { assert.fail('Generating must not visit another tab first') },
    cloud: { callFunction(options) {
      calls.push(options.data)
      return Promise.resolve({ result: { ok: true, data: { taskId: 'smooth-task', status: 'queued' } } })
    } }
  })
  const page = loadPage()
  page.onLoad()
  page.input(input('秋山红叶青花梅瓶'))
  await page.generate()
  assert.equal(page.data.submitting, true, 'The input form must stay hidden while navigation is pending')
  await page.generate()
  await page.newCreation()
  await page.openRecentTask()
  assert.equal(calls.length, 1)
  assert.deepEqual(routes, ['/pages/ai-result/index?taskId=smooth-task'])
  transition.success({})
  assert.equal(page.data.submitting, true, 'Do not reveal the editor during the native transition')
  page.onHide()
  assert.equal(page.data.submitting, true)
  page.onShow()
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.prompt, '')
  await page.openRecentTask()
  assert.equal(routes.length, 2)
  assert.equal(calls.length, 1)
})

test('result navigation stays busy during replacement and restores editing when both navigation methods fail', async (t) => {
  let first, replacement
  const calls = []
  createEnvironment(t, {
    navigateTo(options) { first = options },
    redirectTo(options) { replacement = options },
    cloud: { callFunction(options) {
      calls.push(options.data)
      return Promise.resolve({ result: { ok: true, data: { taskId: 'replace-task', status: 'running' } } })
    } }
  })
  const page = loadPage()
  page.onLoad()
  page.input(input('竹影水墨玉壶春瓶'))
  await page.generate()
  assert.equal(page.data.submitting, true)
  first.fail({ errMsg: 'navigateTo:fail page stack limit' })
  assert.equal(page.data.submitting, true)
  assert.equal(replacement.url, first.url)
  replacement.fail({ errMsg: 'redirectTo:fail unavailable' })
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.activeTaskId, 'replace-task')
  assert.match(page.data.generationError, /任务已提交/)
  await page.openRecentTask()
  assert.equal(page.data.submitting, true)
  assert.equal(calls.length, 1)
})

test('the visible view-works entry opens the full collection directly instead of the most recent task', async t => {
  const { storage, navigations } = createEnvironment(t)
  storage.set('aiGenerationActive', { clientRequestId: 'old-request', taskId: 'old-task', status: 'succeeded', input: { userPrompt: '旧作品', styleId: 'qinghua' } })
  const page = loadPage()
  page.onLoad()
  const template = fs.readFileSync(path.join(root, 'pages/ai-create/index.wxml'), 'utf8')
  const control = template.match(/<view\b([^>]*bindtap="([^"]+)"[^>]*)>(?:继续查看我的作品|查看作品)<\/view>/)
  assert.ok(control, 'Creation needs an entry to the saved and generated collection')
  await page[control[2]]()
  assert.deepEqual(navigations, [['navigate', '/pages/works/index?type=ai']])
  assert.doesNotMatch(control[1], /wx:if/, 'The collection is available even before the first generation')
  for (const flag of ['_submitting', '_openingResult', '_confirmingNewCreation']) {
    page[flag] = true
    await page[control[2]]()
    page[flag] = false
  }
  assert.equal(navigations.length, 1)
})
