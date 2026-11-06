const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const root = path.resolve(__dirname, '..')
const showcase = { chatCases: [{ id: 'sample-chat', question: '青花瓷的蓝色从哪里来？', answer: '青花的蓝色来自钴料，绘制在胎体上，罩透明釉后高温烧成。', ceramicId: 'ceramic-001', source: 'showcase', createdAt: '2026-10-14' }] }
function deferred() { let resolve; const promise = new Promise(a => { resolve = a }); return { promise, resolve } }
function harness(options = {}) {
  let definition; let sequence = 0; const calls = []; const storage = options.storage || new Map(); const toasts = []
  const service = { async callAI(action, payload) { calls.push({ action, payload: structuredClone(payload) }); return options.call ? options.call(action, payload) : { status: 'succeeded', answer: '青花以钴料绘于胎体，罩透明釉后高温烧成。蓝白相映，形成清雅而鲜明的视觉节奏。', sources: [{ id: 'ceramic-001', name: '青花缠枝莲纹梅瓶' }] } } }
  const wx = { getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, structuredClone(value)), showToast: value => toasts.push(value), getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 24, safeArea: { bottom: 778 } }), getMenuButtonBoundingClientRect: () => ({ top: 30, height: 32, bottom: 62 }), ...options.wx }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/ai-chat/index.js'), 'utf8'), { Page: value => { definition = value }, wx, getCurrentPages: () => [], console, setTimeout: options.setTimeout || (() => 1), clearTimeout: options.clearTimeout || (() => {}), require: id => {
    if (id === '../../utils/cloud-service') return options.actualService ? require('../utils/cloud-service') : { createCloudService: () => service, createRequestId: prefix => `${prefix}-${++sequence}` }
    if (id === '../../data/showcase') return showcase
    return require(path.resolve(root, 'pages/ai-chat', id))
  } })
  const page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
  return { page, calls, storage, toasts }
}
const input = value => ({ detail: { value } })
const tap = id => ({ currentTarget: { dataset: { id } } })

test('cultural chat sends the real question, ceramic context and user-assistant history', async () => {
  const { page, calls } = harness()
  assert.equal(typeof page.onHide, 'function'); page.onLoad({ ceramicId: 'ceramic-001' }); page.input(input('青花的蓝色从哪里来？')); await page.send()
  assert.equal(calls[0].action, 'chat.answer'); assert.equal(calls[0].payload.ceramicId, 'ceramic-001'); assert.equal(calls[0].payload.question, '青花的蓝色从哪里来？'); assert.ok(calls[0].payload.clientRequestId); assert.equal(calls[0].payload.history.length, 0)
  page.input(input('它为什么显得清雅？')); await page.send(); assert.equal(calls[1].payload.history.length, 2); assert.deepEqual(calls[1].payload.history.map(m => m.role), ['user', 'assistant'])
  assert.equal(page.data.messages.length, 4); assert.match(page.data.messages[1].text, /钴料/)
})
test('typing and restored query prefill respect the 500-character input limit', () => {
  const { page } = harness(); page.onLoad({ question: encodeURIComponent('瓷'.repeat(550)) }); assert.equal(page.data.input.length, 500)
  page.input(input('青'.repeat(700))); assert.equal(page.data.input.length, 500); assert.equal(page.data.inputLength, 500)
  page.input({}); assert.equal(page.data.input.length, 500)
})
test('blank questions do not request a model', async () => {
  const { page, calls } = harness(); page.onLoad(); page.input(input('   ')); await page.send(); assert.equal(calls.length, 0)
})
test('pending questions stay outside completed history and duplicate taps submit once', async () => {
  const wait = deferred(); const { page, calls } = harness({ call: () => wait.promise }); page.onLoad(); page.input(input('如何理解釉下彩？'))
  const first = page.send(); const second = page.send(); assert.equal(calls.length, 1); assert.equal(page.data.pendingQuestion, '如何理解釉下彩？'); assert.equal(page.data.messages.length, 0)
  page.input(input('保留的新草稿')); wait.resolve({ status: 'succeeded', answer: '釉下彩先绘制于胎体，再罩釉烧成。', sources: [] }); await Promise.all([first, second]); assert.equal(page.data.messages.length, 2); assert.equal(page.data.input, '保留的新草稿')
})
test('display history retains older rounds while model context stays within four rounds', async () => {
  const { page, calls } = harness(); page.onLoad()
  for (let i = 0; i < 6; i++) { page.input(input(`问题${i}`)); await page.send() }
  assert.equal(page.data.messages.length, 12); assert.equal(page.data.messages[0].text, '问题0')
  assert.equal(calls[5].payload.history.length, 8); assert.ok(calls.every(c => c.payload.history.every(m => ['user', 'assistant'].includes(m.role))))
})
test('reentering shows the welcome state and completed history is opened explicitly', async () => {
  const first = harness(); assert.equal(typeof first.page.onUnload, 'function'); first.page.onLoad({ ceramicId: 'ceramic-006' }); first.page.input(input('说说这件瓷器')); await first.page.send(); first.page.input(input('下一条草稿')); first.page.onUnload()
  const second = harness({ storage: first.storage }); second.page.onLoad({ ceramicId: 'ceramic-006' }); assert.equal(second.page.data.ceramicId, 'ceramic-006'); assert.equal(second.page.data.messages.length, 0); assert.equal(second.page.data.input, ''); assert.equal(second.page.data.hasConversation, false)
  second.page.openHistory(); await second.page.selectConversation(tap(first.page.data.conversationId)); assert.equal(second.page.data.messages.length, 2); assert.equal(second.page.data.input, '下一条草稿')
  const other = harness({ storage: first.storage }); other.page.onLoad({ ceramicId: 'ceramic-001' }); assert.equal(other.page.data.messages.length, 0)
})
test('active request is resumed with its exact id only after selecting its history record', async () => {
  const first = harness({ call: () => ({ status: 'running', requestId: 'server-id' }) }); assert.equal(typeof first.page.onHide, 'function'); first.page.onLoad({ ceramicId: 'ceramic-002' }); first.page.input(input('莲瓣造型有什么寓意？')); await first.page.send(); first.page.onHide()
  const second = harness({ storage: first.storage }); second.page.onLoad({ ceramicId: 'ceramic-002' }); await second.page.onShow(); assert.equal(second.calls.length, 0); assert.equal(second.page._active, null); assert.equal(second.page.data.hasConversation, false)
  second.page.openHistory(); await second.page.selectConversation(tap(first.page.data.conversationId))
  assert.equal(second.calls.length, 1); assert.deepEqual(second.calls[0].payload, first.calls[0].payload); assert.equal(second.page.data.messages.length, 2)
})
test('network errors preserve a retry snapshot and never insert a fixed successful answer', async () => {
  let count = 0; const { page, calls } = harness({ call: () => { if (++count === 1) throw Object.assign(new Error('云服务尚未配置'), { code: 'CLOUD_UNAVAILABLE', retryable: true }); return { status: 'succeeded', answer: '这是服务返回的文化介绍。', sources: [] } } })
  assert.equal(typeof page.retry, 'function'); page.onLoad(); page.input(input('什么是粉彩？')); await page.send()
  assert.equal(page.data.messages.length, 0); assert.match(page.data.error, /尚未配置/); await page.retry(); assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(page.data.messages[1].text, '这是服务返回的文化介绍。')
})
test('unknown and malformed answers remain unresolved without becoming a completed round', async () => {
  for (const response of [{ status: 'unknown' }, { status: 'succeeded', answer: '' }, { status: 'succeeded', answer: { text: 'wrong' } }]) {
    const { page } = harness({ call: () => response }); page.onLoad(); page.input(input('问瓷')); await page.send(); assert.equal(page.data.messages.length, 0); assert.ok(page.data.error); assert.notEqual(page.data.status, 'succeeded')
  }
})
test('pre-generated chat cases remain isolated from live message history and requests', async () => {
  const { page, calls, storage } = harness(); assert.equal(typeof page.showCases, 'function'); page.onLoad(); page.showCases(); page.selectCase(tap('sample-chat'))
  assert.equal(page.data.mode, 'showcase'); assert.match(page.data.caseLabel, /预生成展示案例/); assert.equal(page.data.messages.length, 0)
  await page.send(); page.onHide(); assert.equal(calls.length, 0); assert.ok([...storage.values()].every(s => !s.messages || s.messages.length === 0))
  page.returnToLive(); assert.equal(page.data.mode, 'live'); assert.equal(page.data.messages.length, 0)
})
test('four quick questions send directly and collapse the welcome area immediately', async () => {
  const wait = deferred(); const { page, calls } = harness({ call: () => wait.promise }); page.onLoad()
  assert.equal(page.data.quickQuestions.length, 4); assert.equal(page.data.hasConversation, false)
  const sending = page.quickQuestion(tap('0')); assert.equal(calls.length, 1); assert.equal(calls[0].payload.question, page.data.quickQuestions[0]); assert.equal(page.data.hasConversation, true)
  wait.resolve({ status: 'succeeded', answer: '青花以钴料烧成。', sources: [] }); await sending
  assert.equal(page.data.input, ''); assert.equal(page.data.messages.length, 2)
})
test('history sanitizer rejects system messages, orphans and malformed stored requests', () => {
  const file = path.join(root, 'utils/ai-chat-history.js'); assert.ok(fs.existsSync(file), 'local chat history helper must exist')
  const { sanitizeHistory, sanitizeSession } = require(file)
  const messages = [{ role: 'system', text: '规则' }, { role: 'assistant', text: '孤立回复' }, { role: 'user', text: '真实问题' }, { role: 'assistant', text: '真实回答' }, { role: 'user', text: '尚未回答' }]
  assert.deepEqual(sanitizeHistory(messages).map(m => m.text), ['真实问题', '真实回答'])
  const session = sanitizeSession({ messages, input: '草稿', active: { payload: { question: 'q', clientRequestId: '' } } }, '')
  assert.equal(session.active, null); assert.equal(session.messages.length, 2)
})
test('actual cloud contract receives context and a missing connection never gives a fake answer', async () => {
  const wire = []; const connected = harness({ actualService: true, wx: { cloud: { callFunction(config) { wire.push(config.data); config.success({ result: { ok: true, data: { status: 'succeeded', answer: '服务返回的真实内容。', sources: [] } } }) } } } })
  connected.page.onLoad({ ceramicId: 'ceramic-006' }); connected.page.input(input('器型有什么特点？')); await connected.page.send()
  assert.equal(wire[0].version, 1); assert.equal(wire[0].action, 'chat.answer'); assert.equal(wire[0].payload.ceramicId, 'ceramic-006'); assert.equal(connected.page.data.messages[1].text, '服务返回的真实内容。')
  const unavailable = harness({ actualService: true }); unavailable.page.onLoad(); unavailable.page.input(input('说说宋瓷')); await unavailable.page.send()
  assert.equal(unavailable.page.data.messages.length, 0); assert.equal(unavailable.page.data.errorCode, 'CLOUD_UNAVAILABLE'); assert.equal(unavailable.page.data.status, 'failed')
})
test('a running cultural answer stops background polling on hide', async () => {
  const scheduled = []; const cleared = []; const { page } = harness({ call: () => ({ status: 'running' }), setTimeout: callback => { scheduled.push(callback); return 23 }, clearTimeout: id => cleared.push(id) })
  page.onLoad(); page.input(input('什么是青瓷？')); await page.send(); assert.equal(scheduled.length, 1); page.onHide(); assert.deepEqual(cleared, [23])
})
test('storage read errors do not overwrite unread history or stop the current question', async () => {
  const stored = { input: 'old draft', custom: 'keep' }; const storage = new Map([['aiChatSessionV1:general', stored]])
  const { page } = harness({ storage, wx: { getStorageSync() { throw new Error('storage locked') } } }); page.onLoad(); page.input(input('简短介绍青花')); await page.send(); page.onHide()
  assert.deepEqual(storage.get('aiChatSessionV1:general'), stored); assert.equal(page.data.messages.length, 2)
})
test('a long service answer stays visible while the next request respects the backend context limit', async () => {
  const answer = '真实回答'.repeat(1250); const { page, calls } = harness({ call: () => ({ status: 'succeeded', answer, sources: [] }) })
  page.onLoad(); page.input(input('第一问')); await page.send(); assert.equal(page.data.messages[1].text.length, answer.length); assert.ok(page.data.messages[1].text === answer)
  page.input(input('第二问')); await page.send(); assert.equal(calls[1].payload.history[1].text.length, 1500); assert.equal(page.data.messages[1].text.length, answer.length)
})
test('transport uncertainty preserves the original chat id even when a different question is sent', async () => {
  for (const code of ['NETWORK_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE']) {
    const { page, calls } = harness({ call: () => { throw Object.assign(new Error('连接未确认'), { code }) } })
    page.onLoad(); page.input(input('原问题')); await page.send(); assert.equal(page.data.status, 'unknown')
    page.input(input('不要悄悄创建新请求')); await page.send(); assert.equal(calls.length, 2); assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(page.data.input, '不要悄悄创建新请求')
  }
})
test('explicitly restarting a failed answer uses a new id and its original question snapshot', async () => {
  let count = 0; const { page, calls } = harness({ call: () => ++count === 1 ? { status: 'failed', error: { code: 'MODEL_ERROR', message: '已明确失败' } } : { status: 'succeeded', answer: '新请求完成。', sources: [] } })
  assert.equal(typeof page.restart, 'function'); page.onLoad({ ceramicId: 'ceramic-002' }); page.input(input('失败的问题')); await page.send(); assert.equal(page.data.status, 'failed'); await page.restart()
  assert.equal(calls.length, 2); assert.notEqual(calls[1].payload.clientRequestId, calls[0].payload.clientRequestId); assert.equal(calls[1].payload.question, calls[0].payload.question); assert.equal(calls[1].payload.ceramicId, 'ceramic-002'); assert.equal(page.data.messages.length, 2)
})
test('canceling an uncertain answer restart keeps its active snapshot and makes no new call', async () => {
  const modals = []; const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { modals.push(config); config.success({ confirm: false, cancel: true }) } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); page.input(input('原问题')); await page.send(); const original = structuredClone(page._active); await page.restart()
  assert.equal(calls.length, 1); assert.deepEqual(structuredClone(page._active), original); assert.equal(modals.length, 1); assert.match(modals[0].content, /上次结果未确认.*再次请求可能额外计费/)
})
test('confirming an uncertain answer restart uses a new id and the current question', async () => {
  const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { config.success({ confirm: true }) } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); page.input(input('原问题')); await page.send(); page.input(input('当前新问题')); await page.restart()
  assert.equal(calls.length, 2); assert.notEqual(calls[1].payload.clientRequestId, calls[0].payload.clientRequestId); assert.equal(calls[1].payload.question, '当前新问题')
})
test('a running chat restart only queries the original id without prompting or creating a new task', async () => {
  let modals = 0; const { page, calls } = harness({ call: () => ({ status: 'running' }), wx: { showModal() { modals += 1 } } })
  assert.equal(typeof page.restart, 'function'); page.onLoad(); page.input(input('原问题')); await page.send(); await page.restart()
  assert.equal(calls.length, 2); assert.deepEqual(calls[1].payload, calls[0].payload); assert.equal(modals, 0)
})
test('a chat confirmed as running while its restart dialog is open still cannot create a new id', async () => {
  let modal; let count = 0; const { page, calls } = harness({ call: () => ({ status: ++count === 1 ? 'unknown' : 'running' }), wx: { showModal(config) { modal = config } } })
  page.onLoad(); page.input(input('原问题')); await page.send(); const restarting = page.restart(); await page.retry(); modal.success({ confirm: true }); await restarting
  assert.ok(calls.every(call => call.payload.clientRequestId === calls[0].payload.clientRequestId))
})
test('duplicate uncertain chat restart taps show one dialog and create at most one new request', async () => {
  let modal; let modals = 0; const { page, calls } = harness({ call: () => ({ status: 'unknown' }), wx: { showModal(config) { modals += 1; modal = config } } })
  page.onLoad(); page.input(input('原问题')); await page.send(); const first = page.restart(); const second = page.restart(); assert.equal(modals, 1); modal.success({ confirm: true }); await Promise.all([first, second]); assert.equal(calls.length, 2)
})

test('new conversations and history selection preserve separate transcripts across reopening', async () => {
  const first = harness(); first.page.onLoad(); first.page.input(input('先聊青花')); await first.page.send()
  const originalId = first.page.data.conversationId
  first.page.newConversation(); assert.equal(first.page.data.messages.length, 0); assert.equal(first.page.data.hasConversation, false)
  first.page.input(input('再聊汝窑')); await first.page.send(); const nextId = first.page.data.conversationId
  assert.notEqual(nextId, originalId)
  first.page.openHistory(); assert.equal(first.page.data.historyOpen, true); assert.equal(first.page.data.conversations.length, 2)
  await first.page.selectConversation(tap(originalId)); assert.equal(first.page.data.messages[0].text, '先聊青花'); assert.equal(first.page.data.historyOpen, false)
  first.page.onUnload(); const restored = harness({ storage: first.storage }); restored.page.onLoad()
  assert.notEqual(restored.page.data.conversationId, originalId); assert.equal(restored.page.data.messages.length, 0); assert.equal(restored.page.data.hasConversation, false)
  restored.page.openHistory(); await restored.page.selectConversation(tap(originalId)); assert.equal(restored.page.data.messages[0].text, '先聊青花')
})

test('sources belong to individual assistant messages and unknown sources never create images', async () => {
  let sequence = 0; const { page } = harness({ call: () => ({ status: 'succeeded', answer: '文化回答', sources: sequence++ === 0 ? [{ id: 'ceramic-001' }, { id: 'untrusted', image: 'https://evil.test/a.jpg' }] : [] }) })
  page.onLoad(); page.input(input('青花')); await page.send(); page.input(input('谢谢')); await page.send()
  assert.deepEqual(page.data.messages[1].sources.map(s => s.id), ['ceramic-001']); assert.equal((page.data.messages[3].sources || []).length, 0)
  assert.equal(page.data.viewMessages[1].sources.length, 1); assert.ok(page.data.viewMessages[1].sources[0].image); assert.equal(page.data.viewMessages[3].sources.length, 0)
})

test('assistant text copies on long press while user or missing ids cannot copy', async () => {
  const copied = []; const { page } = harness({ wx: { setClipboardData(config) { copied.push(config.data); if (config.success) config.success() } } })
  page.onLoad(); page.input(input('什么是青花')); await page.send()
  page.copyMessage(tap(page.data.messages[0].id)); page.copyMessage(tap('missing')); page.copyMessage(tap(page.data.messages[1].id))
  assert.equal(copied.length, 1); assert.equal(copied[0], page.data.messages[1].text)
})

test('keyboard moves composer and resizes conversation space, and listener is removed on unload', () => {
  let listener; let removed; const { page } = harness({ wx: { onKeyboardHeightChange(fn) { listener = fn }, offKeyboardHeightChange(fn) { removed = fn } } })
  page.onLoad(); const initial = page.data.contentHeight; listener({ height: 300 })
  assert.equal(page.data.keyboardHeight, 300); assert.ok(page.data.contentHeight < initial)
  page.keyboardChange({ detail: { height: 0 } }); assert.equal(page.data.keyboardHeight, 0); assert.equal(page.data.contentHeight, initial)
  page.onUnload(); assert.equal(removed, listener)
})

test('pending request prevents history switches or new conversations without losing its id', async () => {
  const wait = deferred(); const { page, calls } = harness({ call: () => wait.promise }); page.onLoad(); page.input(input('原问题')); const sending = page.send()
  const id = page.data.conversationId; const request = page._active.payload.clientRequestId
  page.newConversation(); await page.selectConversation(tap('other')); assert.equal(page.data.conversationId, id); assert.equal(page._active.payload.clientRequestId, request); assert.equal(calls.length, 1)
  wait.resolve({ status: 'succeeded', answer: '完成回答', sources: [] }); await sending
})

test('general assistant back action returns to home tab', () => {
  const switched = []; const { page } = harness({ wx: { switchTab(config) { switched.push(config.url) } } }); page.onLoad(); page.goBack(); assert.deepEqual(switched, ['/pages/home/index'])
})

test('invalid recommendation indices never submit a question', async () => {
  const { page, calls } = harness(); page.onLoad(); await page.quickQuestion(tap('')); await page.quickQuestion(tap('oops')); await page.quickQuestion(tap('-1')); assert.equal(calls.length, 0)
})

test('a stale page cannot overwrite newer rounds saved by another page of the same conversation', async () => {
  const first = harness(); first.page.onLoad({ ceramicId: 'ceramic-001' }); first.page.input(input('第一问')); await first.page.send(); first.page.onHide()
  const second = harness({ storage: first.storage }); second.page.onLoad({ ceramicId: 'ceramic-001' }); await second.page.selectConversation(tap(first.page.data.conversationId)); second.page.input(input('第二问')); await second.page.send(); second.page.onHide()
  first.page.onHide()
  const restored = harness({ storage: first.storage }); restored.page.onLoad({ ceramicId: 'ceramic-001' }); await restored.page.selectConversation(tap(first.page.data.conversationId)); assert.equal(restored.page.data.messages.length, 4); assert.equal(restored.page.data.messages[2].text, '第二问')
})

test('returning to a visible conversation refreshes newer locally saved rounds', async () => {
  const first = harness(); first.page.onLoad(); first.page.input(input('第一问')); await first.page.send(); first.page.onHide()
  const second = harness({ storage: first.storage }); second.page.onLoad(); await second.page.selectConversation(tap(first.page.data.conversationId)); second.page.input(input('第二问')); await second.page.send(); second.page.onHide()
  await first.page.onShow(); assert.equal(first.page.data.messages.length, 4)
})

test('a smaller window before opening the keyboard resets the full viewport baseline', () => {
  let height = 812; const { page } = harness({ wx: { getWindowInfo: () => ({ windowWidth: 375, windowHeight: height, statusBarHeight: 24 }) } }); page.onLoad()
  height = 650; page.onResize(); page.keyboardChange({ detail: { height: 300 } }); assert.equal(page.data.keyboardHeight, 300)
})

test('a stale in-flight reply resumes a newer active request after the old flight settles', async () => {
  const wait = deferred(); const scheduled = []; let firstCalls = 0
  const first = harness({ call: () => ++firstCalls === 1 ? wait.promise : { status: 'running' }, setTimeout: callback => { scheduled.push(callback); return 1 } })
  first.page.onLoad(); first.page.input(input('第一问')); const sending = first.page.send(); first.page.onHide()
  let secondCalls = 0; const second = harness({ storage: first.storage, call: () => ++secondCalls === 1 ? { status: 'succeeded', answer: '第一答', sources: [] } : { status: 'running' } })
  second.page.onLoad(); await second.page.selectConversation(tap(first.page.data.conversationId)); second.page.input(input('第二问')); await second.page.send(); second.page.onHide()
  const showing = first.page.onShow(); wait.resolve({ status: 'succeeded', answer: '第一答', sources: [] }); await Promise.all([sending, showing])
  assert.equal(first.calls.length, 2); assert.equal(first.calls[1].payload.question, '第二问'); assert.equal(first.page.data.status, 'running'); assert.ok(scheduled.length > 0)
})

test('a newer explicit restart snapshot wins over an unchanged stale unknown request', async () => {
  const first = harness({ call: () => ({ status: 'unknown' }) }); first.page.onLoad(); first.page.input(input('旧问题')); await first.page.send(); first.page.onHide()
  let count = 0; const second = harness({ storage: first.storage, call: () => ({ status: ++count === 1 ? 'unknown' : 'running' }), wx: { showModal(config) { config.success({ confirm: true }) } } })
  second.page.onLoad(); await second.page.selectConversation(tap(first.page.data.conversationId)); second.page.input(input('明确重提的新问题')); await second.page.restart(); const newId = second.page._active.payload.clientRequestId; second.page.onHide()
  await first.page.onShow(); assert.equal(first.calls.at(-1).payload.clientRequestId, newId); assert.equal(first.calls.at(-1).payload.question, '明确重提的新问题')
})

test('a stale unknown request stays retired after its replacement has completed elsewhere', async () => {
  const first = harness({ call: () => ({ status: 'unknown' }) }); first.page.onLoad(); first.page.input(input('旧问题')); await first.page.send(); first.page.onHide()
  let count = 0; const second = harness({ storage: first.storage, call: () => ++count === 1 ? { status: 'unknown' } : { status: 'succeeded', answer: '新的回答', sources: [] }, wx: { showModal(config) { config.success({ confirm: true }) } } })
  second.page.onLoad(); await second.page.selectConversation(tap(first.page.data.conversationId)); second.page.input(input('新问题')); await second.page.restart(); second.page.onHide()
  await first.page.onShow(); assert.equal(first.calls.length, 1); assert.equal(first.page._active, null); assert.equal(first.page.data.messages[0].text, '新问题')
})

test('legacy V1 records move into history without replacing the welcome state', async () => {
  const storage = new Map([['aiChatSessionV1:general', { messages: [{ role: 'user', text: '旧版问题' }, { role: 'assistant', text: '旧版回答' }], input: '旧版草稿', active: null }]])
  const { page, calls } = harness({ storage }); page.onLoad(); await page.onShow()
  assert.equal(page.data.messages.length, 0); assert.equal(page.data.hasConversation, false); assert.equal(page.data.input, ''); assert.equal(calls.length, 0)
  page.openHistory(); assert.equal(page.data.conversations.length, 1); const record = page.data.conversations[0]; await page.selectConversation(tap(record.id))
  assert.equal(page.data.messages[0].text, '旧版问题'); assert.equal(page.data.input, '旧版草稿'); assert.equal(calls.length, 0)
})

test('a new entry does not append new questions to an archived conversation', async () => {
  const first = harness(); first.page.onLoad(); first.page.input(input('上一段的问题')); await first.page.send(); first.page.onUnload()
  const second = harness({ storage: first.storage }); second.page.onLoad(); second.page.input(input('这次的新问题')); await second.page.send()
  assert.notEqual(second.page.data.conversationId, first.page.data.conversationId); assert.equal(second.calls[0].payload.history.length, 0)
  second.page.openHistory(); assert.equal(second.page.data.conversations.length, 2)
})

test('a failed legacy migration is retained when storage recovers and a new conversation is saved', async () => {
  const storage = new Map([['aiChatSessionV1:general', { messages: [{ role: 'user', text: '必须保留的旧问题' }, { role: 'assistant', text: '旧回答' }], input: '', active: null }]])
  let writes = 0; const first = harness({ storage, wx: { setStorageSync(key, value) { if (++writes === 1) throw new Error('temporary write failure'); storage.set(key, structuredClone(value)) } } })
  first.page.onLoad(); assert.match(first.page.data.storageWarning, /旧对话/); first.page.openHistory(); assert.ok(first.page.data.conversations.some(item => item.title === '必须保留的旧问题')); first.page.closeHistory()
  first.page.input(input('新的会话问题')); await first.page.send(); first.page.onUnload()
  const restored = harness({ storage }); restored.page.onLoad(); restored.page.openHistory()
  assert.equal(restored.page.data.conversations.length, 2); assert.ok(restored.page.data.conversations.some(item => item.title === '必须保留的旧问题'))
})

test('the cloud wrapper describes a model format failure without directing users to query a task', async () => {
  const { createCloudService } = require('../utils/cloud-service')
  const service = createCloudService({ cloud: { callFunction(config) { config.success({ result: { ok: false, error: { code: 'MODEL_INVALID_RESPONSE', retryable: true } } }) } } })
  await assert.rejects(service.callAI('chat.answer', { question: '介绍中国瓷器', clientRequestId: 'format-error' }), {
    code: 'MODEL_INVALID_RESPONSE', message: 'AI返回内容格式异常，请重新尝试'
  })
})

test('a real cloud format error explains restarting while programmatic retries preserve the original request', async () => {
  const wire = []; const { page } = harness({ actualService: true, wx: { cloud: { callFunction(config) {
    wire.push(structuredClone(config.data.payload)); config.success({ result: { ok: false, error: { code: 'MODEL_INVALID_RESPONSE', retryable: true } } })
  } } } })
  page.onLoad(); page.input(input('介绍下中国瓷器的发展')); await page.send()
  assert.equal(page.data.status, 'failed'); assert.equal(page.data.errorCode, 'MODEL_INVALID_RESPONSE')
  assert.equal(page.data.error, 'AI返回的内容格式异常，请重新提问'); assert.equal(page.data.canRetry, false)
  await page.retry(); assert.equal(wire.length, 2); assert.deepEqual(wire[1], wire[0])
})

test('real cloud uncertainty still queries the same request and asks before a potentially billable restart', async () => {
  for (const code of ['RESULT_UNKNOWN', 'MODEL_TIMEOUT', 'NETWORK_TIMEOUT']) {
    const wire = []; const modals = []; const { page } = harness({ actualService: true, wx: {
      cloud: { callFunction(config) {
        wire.push(structuredClone(config.data.payload))
        if (code === 'NETWORK_TIMEOUT') config.fail({ errMsg: 'callFunction:fail timeout' })
        else config.success({ result: { ok: false, error: { code, retryable: true } } })
      } },
      showModal(config) { modals.push(config); config.success({ confirm: false }) }
    } })
    page.onLoad(); page.input(input('原来的问题')); await page.send()
    assert.equal(page.data.status, 'unknown'); assert.equal(page.data.errorCode, code); assert.equal(page.data.canRetry, true)
    assert.match(page.data.error, /状态暂未确认.*查询原请求/)
    await page.retry(); assert.equal(wire.length, 2); assert.deepEqual(wire[1], wire[0])
    await page.restart(); assert.equal(wire.length, 2); assert.equal(modals.length, 1); assert.match(modals[0].content, /额外计费/)
  }
})

test('the error actions offer original-request queries only for unknown results', () => {
  const template = fs.readFileSync(path.join(root, 'pages/ai-chat/index.wxml'), 'utf8')
  const condition = action => {
    const button = template.match(new RegExp(`<button\\b([^>]*\\bbindtap="${action}"[^>]*)>`))
    assert.ok(button, `${action} action must exist`)
    const binding = button[1].match(/wx:if="\{\{([\s\S]*?)\}\}"/)
    assert.ok(binding, `${action} action must have a visibility condition`)
    return binding[1]
  }
  const query = condition('retry'); const restart = condition('restart')
  assert.equal(vm.runInNewContext(query, { canRetry: true, status: 'failed' }), false)
  assert.equal(vm.runInNewContext(query, { canRetry: true, status: 'unknown' }), true)
  assert.equal(vm.runInNewContext(query, { canRetry: false, status: 'unknown' }), false)
  assert.equal(vm.runInNewContext(restart, { status: 'failed' }), true)
})

function viewportQuery(rects, callbacks) {
  return {
    selectViewport() { return { boundingClientRect() { return this } } },
    select() { return { boundingClientRect() { return this } } },
    exec(callback) { if (callbacks) callbacks.push(() => callback(rects())); else callback(rects()) }
  }
}

test('ready uses the actual viewport when cached windowHeight leaves unused space below the chat', () => {
  const { page } = harness({ wx: {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 24, safeArea: { bottom: 778 } }),
    createSelectorQuery: () => viewportQuery(() => [{ width: 375, height: 812 }, { width: 375, height: 812 }])
  } })
  page.onLoad(); assert.equal(page.data.windowHeight, 667); page.onReady()
  assert.equal(page.data.windowHeight, 812); assert.equal(page.data.safeBottom, 34)
  assert.equal(page.data.headerHeight + page.data.contentHeight + page.data.composerHeight, 812)
})

test('viewport measurement falls back to the independently filled page when native viewport rect is absent', () => {
  const { page } = harness({ wx: { createSelectorQuery: () => viewportQuery(() => [null, { width: 390, height: 844 }]) } })
  page.onLoad(); page.onReady(); assert.equal(page.data.windowHeight, 844); assert.equal(page.data.windowWidth, 390)
})

test('cached safe area coordinates do not turn unused viewport space into bottom padding', () => {
  for (const info of [
    { windowHeight: 667, safeArea: { bottom: 647 } },
    { screenHeight: 812, windowHeight: 667, safeArea: { bottom: 778 } }
  ]) {
    const { page } = harness({ wx: {
      getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24, ...info }),
      createSelectorQuery: () => viewportQuery(() => [{ width: 375, height: 812 }, null])
    } })
    page.onLoad(); page.onReady()
    const inset = info.screenHeight ? 34 : 20
    assert.equal(page.data.safeBottom, inset); assert.equal(page.data.composerHeight, 64 + inset)
  }
})

test('a keyboard-shrunken viewport is measured without reserving the keyboard a second time', () => {
  let actualHeight = 812
  const { page } = harness({ wx: { createSelectorQuery: () => viewportQuery(() => [{ width: 375, height: actualHeight }, null]) } })
  page.onLoad(); page.onReady(); actualHeight = 512; page.keyboardChange({ detail: { height: 300 } })
  assert.equal(page.data.windowHeight, 512); assert.equal(page.data.keyboardHeight, 0); assert.equal(page.data.keyboardVisible, true); assert.equal(page.data.composerHeight, 64)
  actualHeight = 812; page.keyboardChange({ detail: { height: 0 } }); assert.equal(page.data.keyboardVisible, false); assert.equal(page.data.safeBottom, 34)
})

test('late viewport measurements cannot undo a newer size or update an unloaded page', () => {
  const callbacks = []; let actualHeight = 667
  const { page } = harness({ wx: { createSelectorQuery: () => { const height = actualHeight; return viewportQuery(() => [{ width: 375, height }, null], callbacks) } } })
  page.onLoad(); page.onReady(); actualHeight = 812; page.onResize(); callbacks[1](); callbacks[0](); assert.equal(page.data.windowHeight, 812)
  actualHeight = 700; page.onResize(); page.onUnload(); const before = structuredClone(page.data); callbacks[2](); assert.deepEqual(structuredClone(page.data), before)
})

test('unavailable viewport measurement keeps native layout usable without throwing', () => {
  const { page } = harness({ wx: { createSelectorQuery() { throw new Error('not supported') } } }); page.onLoad()
  assert.doesNotThrow(() => page.onReady()); assert.doesNotThrow(() => page.onResize()); assert.ok(page.data.contentHeight > 0)
})

test('a V1 conversation keeps a stable import id after the twelve-record archive evicts it', () => {
  const { ARCHIVE_KEY, createConversation } = require('../utils/ai-chat-conversations')
  const storage = new Map([['aiChatSessionV1:ceramic-001', { messages: [
    { role: 'user', text: '旧问题' }, { role: 'assistant', text: '旧回答' }
  ] }]])
  const first = harness({ storage }); first.page.onLoad({ ceramicId: 'ceramic-001' })
  assert.equal(storage.get(ARCHIVE_KEY).conversations[0].id, 'legacy-ceramic-001')
  storage.set(ARCHIVE_KEY, { version: 2, conversations: Array.from({ length: 12 }, (_, index) => ({
    ...createConversation(`other-${index}`, 'ceramic-002', Date.now() + index + 100), input: '其他对话草稿'
  })) })
  const restored = harness({ storage }); restored.page.onLoad({ ceramicId: 'ceramic-001' })
  const imported = storage.get(ARCHIVE_KEY).conversations.find(item => item.ceramicId === 'ceramic-001')
  assert.ok(imported); assert.equal(imported.id, 'legacy-ceramic-001'); assert.equal(imported.messages[0].text, '旧问题')
  assert.equal(restored.page.data.hasConversation, false)
})
