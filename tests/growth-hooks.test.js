const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const now = Date.UTC(2026, 9, 17, 4)
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])) }
  static now() { return now }
}

function environment(t, options = {}) {
  const previousWx = global.wx
  const stored = new Map(); const failWrites = new Set(); const events = []; const factoryCalls = []
  const platform = {
    getStorageSync: key => stored.get(key) || '',
    setStorageSync(key, value) {
      if (failWrites.has(key)) throw new Error('Storage write failed')
      stored.set(key, structuredClone(value))
    },
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 24 }),
    showToast() {}
  }
  global.wx = platform
  t.after(() => { global.wx = previousWx })
  const growth = { createGrowthProgress(owner) {
    factoryCalls.push(owner)
    if (options.failFactory) throw new Error('Growth storage read failed')
    return {
      recordGrowthEvent(type, event) {
        events.push({ type, event: structuredClone(event), owner })
        if (options.failGrowth) throw new Error('Growth storage write failed')
      },
      recordVisit() {
        events.push({ type: 'visit', owner })
        if (options.failGrowth) throw new Error('Growth storage write failed')
      }
    }
  } }
  let sequence = 0
  function load(relative, response) {
    const file = path.join(root, relative); const module = { exports: {} }; let page; let app
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports, wx: platform, Date: Clock,
      setTimeout: () => 1, clearTimeout() {}, getCurrentPages: () => [],
      Page: definition => { page = { ...definition, data: structuredClone(definition.data), setData(value, callback) { Object.assign(this.data, value); if (callback) callback() } } },
      App: definition => { app = definition },
      require(id) {
        const resolved = path.resolve(path.dirname(file), id)
        if (resolved === path.join(root, 'utils/growth-progress')) return options.realGrowth ? require(resolved) : growth
        if (response && resolved === path.join(root, 'utils/cloud-service')) return {
          createCloudService: () => ({ callAI: async () => response() }),
          createRequestId: prefix => `${prefix}-${++sequence}`
        }
        return require(resolved)
      }
    }, { filename: file })
    return page || app || module.exports
  }
  return { platform, stored, failWrites, events, factoryCalls, load }
}

const work = (id, extra = {}) => ({ id, name: '莲纹清韵', image: '/assets/work.png', creationType: 'digital', ...extra })
const identify = (id, status = 'recognized') => ({ requestId: id, assetId: `asset-${id}`, createdAt: now, result: { status, name: '莲瓣青瓷碗' } })

test('saved own digital and generated works emit stable work events; showcase collections do not', t => {
  const env = environment(t); const works = env.load('utils/craft-works.js')
  const digital = works.saveWork(work('digital-one'))
  const generated = works.saveWork(work('generated-one', { creationType: 'ai', source: 'generated' }))
  works.saveWork(work('sample', { creationType: 'ai', source: 'showcase' }))
  works.saveWork(work('sample-mode', { mode: 'showcase' }))
  works.saveWork(work('unconfirmed-ai', { creationType: 'ai' }))
  assert.equal(env.events.length, 2)
  for (const [index, saved] of [digital, generated].entries()) {
    assert.equal(env.events[index].type, 'work_created')
    assert.equal(env.events[index].owner, env.platform)
    assert.deepEqual(env.events[index].event, { id: saved.id, title: saved.name, createdAt: saved.createdAt, creationType: saved.creationType, source: saved.source })
    assert.ok(env.stored.get('craftWorks').some(item => item.id === saved.id))
  }
})

test('unsaved works never emit growth events', t => {
  const env = environment(t); const works = env.load('utils/craft-works.js')
  assert.throws(() => works.saveWork({ id: 'invalid' }), /作品信息不完整/)
  env.failWrites.add('craftWorks'); assert.throws(() => works.saveWork(work('not-saved')), /write failed/)
  assert.equal(env.events.length, 0)
})

test('valid ceramic recognition events follow history persistence and use its platform and request id', t => {
  const env = environment(t); const history = env.load('utils/ai-identify-history.js').createIdentifyHistory(env.platform)
  for (const status of ['recognized', 'uncertain']) history.save(identify(status, status))
  history.save(identify('not-ceramic', 'not_ceramic'))
  assert.throws(() => history.save({ ...identify('sample'), source: 'showcase' }), /展示案例/)
  assert.equal(env.events.length, 2)
  assert.deepEqual(env.events.map(({ type, event }) => [type, event]), ['recognized', 'uncertain'].map(status => [
    'identify_completed', { id: status, title: '莲瓣青瓷碗', createdAt: now, resultStatus: status }
  ]))
  assert.ok(env.events.every(({ owner }) => owner === env.platform))
  assert.equal(history.list().length, 3)
})

test('failed recognition history writes do not award growth', t => {
  const env = environment(t); env.failWrites.add('aiIdentifyHistoryV1')
  const history = env.load('utils/ai-identify-history.js').createIdentifyHistory(env.platform)
  assert.throws(() => history.save(identify('not-saved')), /保存失败/)
  assert.equal(env.events.length, 0)
})

test('real completions and replays emit growth while invalid or failed saves never do', t => {
  const env = environment(t); const progress = env.load('utils/challenge-progress.js')
  assert.throws(() => progress.recordChallengeCompletion('unknown'), /无效关卡/)
  assert.throws(() => progress.recordChallengeCompletion('level-002', { freeAccess: false }), /前置关卡/)
  assert.equal(progress.recordChallengeCompletion('level-001').completedCount, 1)
  progress.recordChallengeCompletion('level-001')
  assert.equal(env.events.length, 2)
  assert.deepEqual(env.events[0].event, { id: 'level-001', createdAt: now })
  assert.deepEqual(env.events[1].event, env.events[0].event)
  assert.equal(env.events[0].type, 'challenge_completed')
  env.failWrites.add('challengeProgress'); assert.throws(() => progress.recordChallengeCompletion('level-002'), /write failed/)
  assert.equal(env.events.length, 2)
})

test('only an explicitly valid ceramic detail id emits a viewed event after display succeeds', t => {
  const env = environment(t); const page = env.load('pages/ceramic-detail/index.js')
  page.onLoad({ id: 'ceramic-004' }); assert.equal(page.data.item.id, 'ceramic-004')
  page.onLoad({ id: 'missing' }); page.onLoad()
  assert.equal(env.events.length, 1)
  assert.deepEqual(env.events[0].event, { id: 'ceramic-004', title: require('../data/ceramics').find(item => item.id === 'ceramic-004').name, createdAt: now })
  assert.equal(env.events[0].type, 'ceramic_viewed')
  page.setData = () => { throw new Error('Display failed') }
  assert.throws(() => page.onLoad({ id: 'ceramic-001' }), /Display failed/)
  assert.equal(env.events.length, 1)
})

test('a completed live chat round emits its assistant id while non-success responses never award growth', async t => {
  const env = environment(t)
  const page = env.load('pages/ai-chat/index.js', () => ({ status: 'succeeded', answer: '青花是釉下彩。', sources: [] }))
  page.onLoad(); page.input({ detail: { value: '青花是什么？' } }); await page.send()
  const assistant = page.data.messages.at(-1)
  assert.equal(env.events.length, 1); assert.equal(env.events[0].type, 'chat_answered')
  assert.deepEqual(env.events[0].event, { id: assistant.id, conversationId: page.data.conversationId, title: '青花是什么？', createdAt: assistant.createdAt })
  for (const response of [{ status: 'running' }, { status: 'unknown' }, { status: 'failed' }, { status: 'succeeded', answer: '' }]) {
    const failed = env.load('pages/ai-chat/index.js', () => response)
    failed.onLoad(); failed.input({ detail: { value: '不能计分' } }); await failed.send()
  }
  assert.equal(env.events.length, 1)
})

test('app foreground visits are recorded without treating app module loading as a visit', t => {
  const env = environment(t); const app = env.load('app.js')
  assert.equal(env.events.length, 0); assert.equal(typeof app.onShow, 'function')
  app.onShow(); assert.equal(env.events.length, 1); assert.equal(env.events[0].type, 'visit'); assert.equal(env.events[0].owner, env.platform)
})

for (const failure of ['failGrowth', 'failFactory']) {
  test(`${failure} cannot turn successful works, recognition, chat, completion, browsing or visits into failures`, async t => {
    const env = environment(t, { [failure]: true })
    assert.equal(env.load('utils/craft-works.js').saveWork(work('saved')).id, 'saved')
    const history = env.load('utils/ai-identify-history.js').createIdentifyHistory(env.platform)
    assert.equal(history.save(identify('saved')).requestId, 'saved')
    assert.equal(env.load('utils/challenge-progress.js').recordChallengeCompletion('level-001').completedCount, 1)
    const detail = env.load('pages/ceramic-detail/index.js'); assert.doesNotThrow(() => detail.onLoad({ id: 'ceramic-001' }))
    const chat = env.load('pages/ai-chat/index.js', () => ({ status: 'succeeded', answer: '真实完成的回答', sources: [] }))
    chat.onLoad(); chat.input({ detail: { value: '瓷器' } }); await chat.send()
    assert.equal(chat.data.status, 'succeeded'); assert.equal(chat.data.messages.length, 2); assert.equal(chat.data.error, '')
    const app = env.load('app.js'); assert.equal(typeof app.onShow, 'function'); assert.doesNotThrow(() => app.onShow())
    assert.equal(env.factoryCalls.length, 6)
  })
}

test('real growth storage deduplicates repeated saves and retains earned growth after content deletion', t => {
  const env = environment(t, { realGrowth: true })
  const { createGrowthProgress, STORAGE_KEY } = require('../utils/growth-progress')
  const growth = createGrowthProgress(env.platform)
  const works = env.load('utils/craft-works.js')
  const history = env.load('utils/ai-identify-history.js').createIdentifyHistory(env.platform)
  works.saveWork(work('own-digital')); works.saveWork(work('own-ai', { creationType: 'ai', source: 'generated' }))
  for (let index = 2; index <= 10; index++) works.saveWork(work(`own-digital-${index}`))
  for (let index = 2; index <= 5; index++) works.saveWork(work(`own-ai-${index}`, { creationType: 'ai', source: 'generated' }))
  works.saveWork(work('mode-example', { mode: 'showcase' }))
  for (let index = 0; index < 20; index++) history.save(identify(`ceramic-${index}`))
  const before = growth.getProfileState()
  assert.equal(before.stats.ownWorks, 15); assert.equal(before.stats.identifications, 20)
  assert.deepEqual(before.badges.filter(item => item.unlocked).map(item => item.id), ['craft', 'creator', 'identify'])
  const ledger = structuredClone(env.stored.get(STORAGE_KEY))
  works.saveWork(work('own-digital', { name: '只更新名字' })); works.saveWork(work('own-ai', { creationType: 'ai', source: 'generated' }))
  history.save(identify('ceramic-0'))
  assert.deepEqual(env.stored.get(STORAGE_KEY), ledger)
  works.getWorks().filter(item => item.source !== 'showcase' && item.mode !== 'showcase').forEach(item => works.removeWork(item.id))
  history.list().forEach(record => history.remove(record.id))
  const after = growth.getProfileState()
  assert.equal(after.footprints.ownWorks, 0); assert.equal(after.identity.totalXp, before.identity.totalXp)
  assert.equal(after.stats.ownWorks, 15); assert.equal(after.stats.identifications, 20)
  assert.deepEqual(after.badges.filter(item => item.unlocked).map(item => item.id), ['craft', 'creator', 'identify'])
  const app = env.load('app.js'); app.onShow(); const firstVisit = growth.getProfileState(); app.onShow()
  assert.equal(growth.getProfileState().identity.exploredDays, 1)
  assert.equal(growth.getProfileState().identity.totalXp, firstVisit.identity.totalXp)
})

test('real growth ledger write failures leave all successful business operations successful', async t => {
  const env = environment(t, { realGrowth: true })
  const { STORAGE_KEY } = require('../utils/growth-progress'); env.failWrites.add(STORAGE_KEY)
  assert.equal(env.load('utils/craft-works.js').saveWork(work('kept-work')).id, 'kept-work')
  assert.equal(env.load('utils/ai-identify-history.js').createIdentifyHistory(env.platform).save(identify('kept-identify')).requestId, 'kept-identify')
  assert.equal(env.load('utils/challenge-progress.js').recordChallengeCompletion('level-001').completedCount, 1)
  assert.doesNotThrow(() => env.load('pages/ceramic-detail/index.js').onLoad({ id: 'ceramic-001' }))
  const chat = env.load('pages/ai-chat/index.js', () => ({ status: 'succeeded', answer: '回答已经完成。', sources: [] }))
  chat.onLoad(); chat.input({ detail: { value: '青花' } }); await chat.send()
  assert.equal(chat.data.status, 'succeeded'); assert.equal(chat.data.messages.length, 2)
  assert.doesNotThrow(() => env.load('app.js').onShow())
  assert.equal(env.stored.has(STORAGE_KEY), false)
})
