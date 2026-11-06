const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const utilityPath = path.join(root, 'utils/growth-progress.js')
const configPath = path.join(root, 'data/growth.js')
const now = Date.parse('2026-10-17T02:00:00Z')

function load() {
  assert.ok(fs.existsSync(utilityPath), 'the independent growth ledger module must exist')
  return require(utilityPath)
}
function setup(initial = {}, options = {}) {
  const { createGrowthProgress, STORAGE_KEY } = load()
  const storage = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]))
  const writes = []; let clock = now
  const platform = {
    getStorageSync(key) {
      if (options.failRead && options.failRead(key)) throw new Error('read failed')
      return storage.has(key) ? structuredClone(storage.get(key)) : ''
    },
    setStorageSync(key, value) {
      if (options.failWrite) throw new Error('write failed')
      writes.push([key, structuredClone(value)]); storage.set(key, structuredClone(value))
    }
  }
  return { service: createGrowthProgress(platform, { clock: () => clock }), storage, writes, STORAGE_KEY, setClock(value) { clock = value } }
}
function digital(id, createdAt = now) { return { id, title: '我的青瓷碗', creationType: 'digital', createdAt } }
function ai(id, createdAt = now) { return { id, title: '我的AI梅瓶', creationType: 'ai', source: 'generated', createdAt } }
function pair(id, createdAt = now) {
  return [{ id: `${id}-user`, role: 'user', text: '什么是青花？', createdAt }, { id: `${id}-assistant`, role: 'assistant', text: '青花是釉下彩。', createdAt }]
}

const ceramicIds = require('../data/ceramics').map(item => item.id)
function badgeEvent(id, index) {
  if (id === 'craft') return ['work_created', digital(`boundary-digital-${index}`, null)]
  if (id === 'creator') return ['work_created', ai(`boundary-ai-${index}`, null)]
  if (id === 'identify') return ['identify_completed', { id: `boundary-identify-${index}`, resultStatus: index % 2 ? 'recognized' : 'uncertain' }]
  if (id === 'scholar') return ['ceramic_viewed', { id: ceramicIds[index - 1] }]
  return ['chat_answered', { id: `boundary-answer-${index}`, conversationId: 'boundary-chat' }]
}
function masterStore(overrides = {}) {
  const counts = { digitalWorks: 10, aiWorks: 5, identifications: 20, answers: 30, viewedCeramics: 10, exploredDays: 14, completedLevels: 0, ...overrides }
  const events = []
  for (let index = 1; index <= counts.digitalWorks; index++) events.push({ type: 'work_created', id: `stored-digital-${index}`, creationType: 'digital' })
  for (let index = 1; index <= counts.aiWorks; index++) events.push({ type: 'work_created', id: `stored-ai-${index}`, creationType: 'ai', source: 'generated' })
  for (let index = 1; index <= counts.identifications; index++) events.push({ type: 'identify_completed', id: `stored-identify-${index}`, resultStatus: 'recognized' })
  for (let index = 1; index <= counts.answers; index++) events.push({ type: 'chat_answered', id: `stored-answer-${index}`, conversationId: 'stored-master' })
  for (let index = 0; index < counts.viewedCeramics; index++) events.push({ type: 'ceramic_viewed', id: ceramicIds[index] })
  for (let index = 1; index <= counts.completedLevels; index++) events.push({ type: 'challenge_completed', id: `level-${String(index).padStart(3, '0')}` })
  const visits = Array.from({ length: counts.exploredDays }, (_, index) => new Date(Date.parse('2026-08-01T00:00:00Z') + index * 86400000).toISOString().slice(0, 10))
  return { version: 1, events, visits, unlockedBadgeIds: [], journal: [] }
}

test('growth configuration defines the approved seven levels and six distinct badges', () => {
  assert.ok(fs.existsSync(configPath), 'growth rules must have their own configuration module')
  const config = require(configPath)
  assert.deepEqual(config.eventPoints, { visit: 2, ceramic_viewed: 2, identify_completed: 8, chat_answered: 3, work_created: 15, challenge_completed: 20 })
  assert.deepEqual(config.levels.map(({ level, title, minXp }) => [level, title, minXp]), [
    [1, '初识瓷韵', 0], [2, '青瓷研习者', 50], [3, '青花知音', 150], [4, '窑火行者', 300],
    [5, '瓷艺雅士', 500], [6, '瓷韵传习者', 800], [7, '瓷境宗师', 1200]
  ])
  assert.deepEqual(config.badges.map(({ id, name }) => [id, name]), [
    ['master', '瓷境宗师'], ['craft', '匠心巧手'], ['creator', '灵感造物师'],
    ['identify', '慧眼识珍'], ['scholar', '博古知瓷'], ['inquiry', '问瓷求真']
  ])
  assert.equal(config.identityImage, '/assets/profile/identity-landscape.png')
  config.badges.forEach(badge => assert.equal(badge.image, `/assets/profile/${badge.id}.png`))
  assert.match(config.badges.find(({ id }) => id === 'scholar').condition, /浏览/)
  assert.doesNotMatch(config.badges.find(({ id }) => id === 'scholar').condition, /视频|课程/)
  assert.deepEqual(config.badges.map(({ id, target }) => [id, target]), [['master', 7], ['craft', 10], ['creator', 5], ['identify', 20], ['scholar', 10], ['inquiry', 30]])
  assert.deepEqual(config.badges[0].requirements, [
    { stat: 'totalXp', target: 1200 }, { stat: 'exploredDays', target: 14 }, { stat: 'digitalWorks', target: 10 },
    { stat: 'aiWorks', target: 5 }, { stat: 'identifications', target: 20 }, { stat: 'answers', target: 30 }, { stat: 'viewedCeramics', target: 10 }
  ])
  for (const badge of config.badges.slice(1)) assert.ok(badge.condition.includes(String(badge.target)))
  for (const { target } of config.badges[0].requirements) assert.ok(config.badges[0].condition.includes(String(target)))
})

test('a fresh profile reads zero real progress without writing or inventing a visit', () => {
  const s = setup(); const state = s.service.getProfileState()
  assert.equal(state.identity.level, 1); assert.equal(state.identity.title, '初识瓷韵')
  assert.equal(state.identity.totalXp, 0); assert.equal(state.identity.currentLevelXp, 0); assert.equal(state.identity.nextLevelXp, 50)
  assert.equal(state.identity.progressPercent, 0); assert.equal(state.identity.exploredDays, 0)
  assert.deepEqual(state.footprints, { completedLevels: 0, ownWorks: 0, unlockedBadges: 0 })
  assert.equal(state.badges.length, 6); assert.ok(state.badges.every(badge => !badge.unlocked))
  assert.deepEqual(state.journal, []); assert.deepEqual(s.writes, [])
})

test('constructing the factory performs no storage I/O', () => {
  const { createGrowthProgress } = load(); let calls = 0
  const service = createGrowthProgress({ getStorageSync() { calls++; throw new Error('must not read yet') }, setStorageSync() { calls++; throw new Error('must not write yet') } })
  assert.equal(typeof service.getProfileState, 'function'); assert.equal(calls, 0)
})

test('visits count actual Asia/Shanghai dates once and never enter the journal', () => {
  const s = setup(); s.setClock(Date.parse('2026-10-16T15:59:59Z'))
  assert.equal(s.service.recordVisit().identity.exploredDays, 1)
  s.service.recordVisit(); assert.equal(s.writes.length, 1)
  s.setClock(Date.parse('2026-10-16T16:00:00Z'))
  const state = s.service.recordVisit()
  assert.equal(state.identity.exploredDays, 2); assert.equal(state.identity.totalXp, 4)
  assert.deepEqual(state.journal, [])
  assert.deepEqual(s.storage.get(s.STORAGE_KEY).visits, ['2026-10-16', '2026-10-17'])
  assert.throws(() => s.service.recordGrowthEvent('visit', { id: '2026-10-15' }), { code: 'GROWTH_INVALID_EVENT' })
})

test('work rewards distinguish digital creation, generated AI and showcase collections and survive deletion', () => {
  const s = setup()
  s.service.recordGrowthEvent('work_created', digital('digital-1'))
  s.service.recordGrowthEvent('work_created', digital('digital-1'))
  let state = s.service.recordGrowthEvent('work_created', ai('ai-1'))
  const writeCount = s.writes.length
  for (const event of [
    { ...ai('showcase-1'), source: 'showcase' }, { ...digital('showcase-2'), source: 'showcase' },
    { id: 'demo-1', title: '旧示例作品' }, { ...ai('unverified-ai'), source: undefined }
  ]) s.service.recordGrowthEvent('work_created', event)
  assert.equal(s.writes.length, writeCount)
  state = s.service.getProfileState()
  assert.equal(state.identity.totalXp, 30); assert.equal(state.stats.ownWorks, 2)
  assert.deepEqual(state.badges.filter(badge => badge.unlocked).map(({ id }) => id), [])
  for (let index = 2; index <= 10; index++) s.service.recordGrowthEvent('work_created', digital(`digital-${index}`))
  for (let index = 2; index <= 5; index++) s.service.recordGrowthEvent('work_created', ai(`ai-${index}`))
  assert.deepEqual(s.service.getProfileState().badges.filter(badge => badge.unlocked).map(({ id }) => id), ['craft', 'creator'])
  s.storage.set('craftWorks', [])
  state = s.service.migrateExistingRecords()
  assert.equal(state.footprints.ownWorks, 0); assert.equal(state.stats.ownWorks, 15); assert.equal(state.footprints.unlockedBadges, 2)
})

test('identification counts only real recognized or uncertain ceramics and chat ids include their conversation', () => {
  const s = setup()
  s.service.recordGrowthEvent('identify_completed', { id: 'identify-1', resultStatus: 'recognized', createdAt: now })
  s.service.recordGrowthEvent('identify_completed', { id: 'identify-2', resultStatus: 'uncertain', createdAt: now })
  s.service.recordGrowthEvent('identify_completed', { id: 'non-ceramic', resultStatus: 'not_ceramic', createdAt: now })
  s.service.recordGrowthEvent('identify_completed', { id: 'example', resultStatus: 'recognized', source: 'showcase', createdAt: now })
  for (const conversationId of ['conversation-a', 'conversation-b', 'conversation-a']) {
    s.service.recordGrowthEvent('chat_answered', { id: 'same-assistant', conversationId, title: '问瓷', createdAt: now })
  }
  const state = s.service.getProfileState()
  assert.equal(state.identity.totalXp, 22)
  assert.equal(state.badges.find(({ id }) => id === 'identify').current, 2)
  assert.equal(state.badges.find(({ id }) => id === 'inquiry').current, 2)
})

test('catalogue views and challenge completions validate real unique catalogue ids', () => {
  const s = setup()
  for (const id of ['ceramic-001', 'ceramic-001', 'ceramic-002', 'ceramic-003', 'ceramic-004', 'ceramic-005']) {
    s.service.recordGrowthEvent('ceramic_viewed', { id, title: '浏览器物', createdAt: now })
  }
  s.service.recordGrowthEvent('challenge_completed', { id: 'level-001' })
  s.service.recordGrowthEvent('challenge_completed', { id: 'level-001' })
  for (const [type, id] of [['ceramic_viewed', 'unknown'], ['challenge_completed', 'level-013']]) {
    assert.throws(() => s.service.recordGrowthEvent(type, { id }), { code: 'GROWTH_INVALID_EVENT' })
  }
  const state = s.service.getProfileState()
  assert.equal(state.identity.totalXp, 30); assert.equal(state.footprints.completedLevels, 1)
  assert.equal(state.badges.find(({ id }) => id === 'scholar').unlocked, false)
  assert.equal(state.journal.length, 5)
  for (const id of ceramicIds.slice(5)) s.service.recordGrowthEvent('ceramic_viewed', { id })
  assert.equal(s.service.getProfileState().badges.find(({ id }) => id === 'scholar').unlocked, true)
})

test('missing or invalid dates add only cumulative progress and never fabricate journal dates', () => {
  const s = setup()
  for (const [index, createdAt] of [undefined, 0, null, 'not-a-date', -1].entries()) {
    s.service.recordGrowthEvent('work_created', { ...digital(`unknown-time-${index}`), createdAt })
  }
  let state = s.service.getProfileState()
  assert.equal(state.stats.ownWorks, 5); assert.deepEqual(state.journal, []); assert.equal(state.identity.exploredDays, 0)
  state = s.service.recordGrowthEvent('work_created', digital('dated', '2026-10-16T16:10:00Z'))
  assert.equal(state.journal[0].dateLabel, '2026.10.17'); assert.equal(state.journal[0].createdAt, Date.parse('2026-10-16T16:10:00Z'))
})

test('journal keeps twenty most recent events and returns only the newest five without dropping deduplication', () => {
  const s = setup()
  for (let index = 24; index >= 0; index--) s.service.recordGrowthEvent('work_created', digital(`journal-${index}`, now + index))
  const state = s.service.getProfileState()
  assert.equal(state.journal.length, 5)
  assert.deepEqual(state.journal.map(({ createdAt }) => createdAt), [24, 23, 22, 21, 20].map(value => now + value))
  assert.ok(state.journal.every(item => item.id && item.title && ['work_created', 'badge_unlocked'].includes(item.iconType)))
  assert.equal(s.storage.get(s.STORAGE_KEY).journal.length, 20)
  const before = structuredClone(s.storage.get(s.STORAGE_KEY)); const writeCount = s.writes.length
  s.service.recordGrowthEvent('work_created', digital('journal-0', now + 100))
  assert.equal(s.writes.length, writeCount); assert.deepEqual(s.storage.get(s.STORAGE_KEY), before)
  assert.equal(state.stats.ownWorks, 25)
})

test('level progress uses cumulative thresholds and caps the final level', () => {
  const s = setup()
  for (let index = 0; index < 4; index++) s.service.recordGrowthEvent('work_created', digital(`early-${index}`))
  let state = s.service.getProfileState()
  assert.equal(state.identity.level, 2); assert.equal(state.identity.totalXp, 60)
  assert.equal(state.identity.currentLevelXp, 50); assert.equal(state.identity.nextLevelXp, 150); assert.equal(state.identity.progressPercent, 10)
  for (let index = 4; index < 80; index++) s.service.recordGrowthEvent('work_created', digital(`early-${index}`))
  state = s.service.getProfileState()
  assert.equal(state.identity.level, 7); assert.equal(state.identity.totalXp, 1200)
  assert.equal(state.identity.nextLevelXp, null); assert.equal(state.identity.progressPercent, 100)
})

for (const [id, target] of [['craft', 10], ['creator', 5], ['identify', 20], ['scholar', 10], ['inquiry', 30]]) {
  test(`${id} stays locked at ${target - 1}, unlocks at ${target}, and repeated activity never advances it`, () => {
    const s = setup()
    for (let index = 1; index < target; index++) s.service.recordGrowthEvent(...badgeEvent(id, index))
    let badge = s.service.getProfileState().badges.find(item => item.id === id)
    assert.equal(badge.target, target); assert.equal(badge.current, target - 1); assert.equal(badge.unlocked, false)
    assert.equal(badge.progressPercent, (target - 1) / target * 100)
    const writes = s.writes.length
    s.service.recordGrowthEvent(...badgeEvent(id, target - 1)); assert.equal(s.writes.length, writes)
    badge = s.service.recordGrowthEvent(...badgeEvent(id, target)).badges.find(item => item.id === id)
    assert.equal(badge.current, target); assert.equal(badge.unlocked, true); assert.equal(badge.progressPercent, 100)
    assert.equal(Object.hasOwn(badge, 'retainedAward'), false)
  })
}

for (const [missing, overrides] of [
  ['XP', {}], ['exploredDays', { exploredDays: 13, answers: 330 }],
  ['digitalWorks', { digitalWorks: 9, answers: 330 }], ['aiWorks', { aiWorks: 4, answers: 330 }],
  ['identifications', { identifications: 19, answers: 330 }], ['answers', { answers: 29, digitalWorks: 110 }],
  ['viewedCeramics', { viewedCeramics: 9, answers: 330 }]
]) {
  test(`master remains locked when only ${missing} misses the new requirement`, () => {
    const { STORAGE_KEY } = load(); const s = setup({ [STORAGE_KEY]: masterStore(overrides) })
    const state = s.service.getProfileState(); const badge = state.badges.find(item => item.id === 'master')
    assert.equal(badge.target, 7); assert.equal(badge.current, 6); assert.equal(badge.unlocked, false); assert.ok(badge.progressPercent < 100)
    assert.equal(state.stats.exploredDays, state.identity.exploredDays)
  })
}

test('master XP boundary is 1199 locked and 1200 unlocked with every other requirement satisfied', () => {
  const { STORAGE_KEY } = load()
  const below = setup({ [STORAGE_KEY]: masterStore({ identifications: 22, answers: 250 }) }).service.getProfileState()
  const at = setup({ [STORAGE_KEY]: masterStore({ identifications: 21, answers: 253 }) }).service.getProfileState()
  assert.equal(below.identity.totalXp, 1199); assert.equal(below.badges[0].unlocked, false)
  assert.equal(at.identity.totalXp, 1200); assert.equal(at.badges[0].unlocked, true); assert.equal(at.badges[0].current, 7); assert.equal(at.badges[0].progressPercent, 100)
})

test('old lower-threshold awards relock without losing XP, events or historical badge journals, then unlock once at the new target', () => {
  const { STORAGE_KEY } = load()
  const old = masterStore({ digitalWorks: 9, aiWorks: 4, identifications: 19, answers: 29, viewedCeramics: 9, exploredDays: 54, completedLevels: 12 })
  const badgeConfig = require(configPath).badges
  old.unlockedBadgeIds = badgeConfig.map(badge => badge.id)
  old.journal = badgeConfig.map(badge => ({ id: `badge:${badge.id}`, iconType: 'badge_unlocked', title: `获得徽章「${badge.name}」`, createdAt: now - 86400000 }))
  const s = setup({ [STORAGE_KEY]: old }); const before = s.service.getProfileState()
  assert.equal(before.identity.totalXp, 800); assert.ok(before.badges.every(badge => !badge.unlocked))
  assert.ok(before.badges.every(badge => !Object.hasOwn(badge, 'retainedAward')))
  const migrated = s.service.migrateExistingRecords()
  const relocked = s.storage.get(STORAGE_KEY)
  assert.deepEqual(relocked.unlockedBadgeIds, []); assert.deepEqual(relocked.events, old.events); assert.deepEqual(relocked.visits, old.visits); assert.deepEqual(relocked.journal, old.journal)
  assert.equal(migrated.identity.totalXp, 800); assert.equal(migrated.footprints.unlockedBadges, 0)
  assert.doesNotThrow(() => s.service.getProfileState(), 'old badge facts remain a valid historical journal after relocking')
  const achieved = s.service.recordGrowthEvent('work_created', digital('new-tenth-work', now))
  assert.equal(achieved.identity.totalXp, 815); assert.equal(achieved.badges.find(badge => badge.id === 'craft').unlocked, true)
  const stored = s.storage.get(STORAGE_KEY)
  assert.equal(stored.events.length, old.events.length + 1)
  assert.equal(stored.journal.filter(item => item.id === 'badge:craft').length, 1)
  assert.equal(stored.journal.find(item => item.id === 'badge:craft').createdAt, now)
  const writes = s.writes.length
  s.service.recordGrowthEvent('work_created', digital('new-tenth-work', now + 1000))
  assert.equal(s.writes.length, writes); assert.deepEqual(s.storage.get(STORAGE_KEY), stored)
})

test('migration accumulates valid owned records without fake visits or missing-date journal entries and matches live chat keys', () => {
  const s = setup({
    craftWorks: [{ ...digital('old-digital'), name: '手作', image: '/own.jpg' }, { ...ai('old-ai', null), name: 'AI', image: '/own-ai.jpg' }, { ...ai('demo'), source: 'showcase', name: '案例', image: '/case.jpg' }, { id: 'bad-work' }],
    aiIdentifyHistoryV1: [
      { id: 'old-identify-record', requestId: 'old-identify', assetId: 'asset-1', result: { status: 'recognized', name: '青瓷碗' }, createdAt: now },
      { id: 'not-ceramic', requestId: 'not-ceramic', assetId: 'asset-2', result: { status: 'not_ceramic' }, createdAt: now }
    ],
    aiChatConversationsV2: { version: 2, conversations: [
      { id: 'old-conversation-a', messages: pair('old-answer'), createdAt: now, updatedAt: now },
      { id: 'old-conversation-b', messages: pair('old-answer', 0), createdAt: 0, updatedAt: 0 }
    ] },
    challengeProgress: { completedLevelIds: ['level-001', 'level-002', 'level-001', 'unknown'] }
  })
  const state = s.service.migrateExistingRecords()
  assert.equal(state.identity.totalXp, 84); assert.equal(state.identity.exploredDays, 0)
  assert.equal(state.footprints.ownWorks, 2); assert.equal(state.footprints.completedLevels, 2)
  assert.equal(state.journal.length, 3); assert.deepEqual(state.migrationWarnings, [])
  assert.ok(s.storage.get(s.STORAGE_KEY).journal.every(item => item.iconType !== 'badge_unlocked'), 'migration cannot invent an old badge acquisition time')
  assert.equal(s.writes.length, 1, 'all migrated sources must commit together instead of one write per event')
  const before = s.writes.length
  s.service.migrateExistingRecords()
  s.service.recordGrowthEvent('chat_answered', { id: 'old-answer-assistant', conversationId: 'old-conversation-a', createdAt: now })
  assert.equal(s.writes.length, before)
})

test('a failed migration source does not block other sources or permanently suppress later records', () => {
  let unreadable = true
  const s = setup({ craftWorks: [{ ...digital('recovered'), name: '旧手作', image: '/own.jpg' }], challengeProgress: { completedLevelIds: ['level-001'] } }, {
    failRead: key => key === 'craftWorks' && unreadable
  })
  assert.throws(() => s.service.migrateExistingRecords(), cause => cause.code === 'GROWTH_SOURCE_READ_FAILED' && cause.migrationWarnings.includes('works'))
  assert.equal(s.storage.get(s.STORAGE_KEY).events.filter(({ type }) => type === 'challenge_completed').length, 1)
  assert.throws(() => s.service.getProfileState(), { code: 'GROWTH_SOURCE_READ_FAILED' })
  unreadable = false; const state = s.service.migrateExistingRecords()
  assert.equal(state.footprints.ownWorks, 1); assert.equal(state.identity.totalXp, 35)
  s.storage.set('craftWorks', [{ ...digital('recovered'), name: '旧手作', image: '/own.jpg' }, { ...ai('later'), name: '后来作品', image: '/later.jpg' }])
  assert.equal(s.service.migrateExistingRecords().footprints.ownWorks, 2)
})

test('growth read failures and unsupported or damaged schemas are never overwritten by any mutator', () => {
  const s = setup(); s.service.recordVisit(); s.service.recordGrowthEvent('work_created', digital('valid')); const initial = structuredClone(s.storage.get(s.STORAGE_KEY))
  for (const damaged of [null, [], 'broken', { version: 2 }, { ...initial, events: null }, { ...initial, visits: ['invalid-date'] }, { ...initial, unlockedBadgeIds: ['chapter-1'] },
    { ...initial, events: [...initial.events, initial.events[0]] }, { ...initial, journal: [{ ...initial.journal[0], createdAt: null }] }]) {
    s.storage.set(s.STORAGE_KEY, damaged); const writes = s.writes.length
    for (const run of [() => s.service.getProfileState(), () => s.service.recordVisit(), () => s.service.migrateExistingRecords(), () => s.service.recordGrowthEvent('work_created', digital('new'))]) {
      assert.throws(run, { code: 'GROWTH_INVALID_STORE' })
      assert.deepEqual(s.storage.get(s.STORAGE_KEY), damaged)
    }
    assert.equal(s.writes.length, writes)
  }
  const failing = setup({}, { failRead: () => true })
  assert.throws(() => failing.service.recordVisit(), { code: 'GROWTH_READ_FAILED' }); assert.deepEqual(failing.writes, [])
})

test('write failures propagate and returned view mutations cannot alter persisted progress', () => {
  const failing = setup({}, { failWrite: true })
  assert.throws(() => failing.service.recordGrowthEvent('work_created', digital('unsaved')), { code: 'GROWTH_WRITE_FAILED' })
  assert.deepEqual(failing.writes, []); assert.equal(failing.storage.has(failing.STORAGE_KEY), false)
  const s = setup(); const state = s.service.recordGrowthEvent('work_created', digital('saved'))
  const before = structuredClone(s.storage.get(s.STORAGE_KEY))
  state.badges[0].unlocked = true; state.journal[0].title = 'changed'; state.identity.totalXp = 100000
  assert.deepEqual(s.storage.get(s.STORAGE_KEY), before); assert.equal(s.service.getProfileState().identity.totalXp, 15)
})

test('journal titles explain the action and truncate long questions instead of storing full chat text', () => {
  const cases = [
    ['work_created', digital('title-work'), '保存作品《我的青瓷碗》'],
    ['identify_completed', { id: 'title-identify', title: '莲瓣青瓷碗', resultStatus: 'recognized', createdAt: now }, '完成识瓷解读《莲瓣青瓷碗》'],
    ['chat_answered', { id: 'title-answer', conversationId: 'title-conversation', title: '青花为什么是蓝色？', createdAt: now }, '问瓷：青花为什么是蓝色？'],
    ['ceramic_viewed', { id: 'ceramic-001', title: '青花梅瓶', createdAt: now }, '赏瓷：青花梅瓶'],
    ['challenge_completed', { id: 'level-001', title: '溪畔初逢', createdAt: now }, '完成第1关 · 纹样消消乐']
  ]
  cases.forEach(([type, event, expected]) => {
    const s = setup(); const state = s.service.recordGrowthEvent(type, event)
    assert.equal(state.journal.find(item => item.iconType === type).title, expected)
  })
  const s = setup(); const question = '瓷'.repeat(500)
  s.service.recordGrowthEvent('chat_answered', { id: 'long-answer', conversationId: 'long-conversation', title: question, createdAt: now })
  const stored = s.storage.get(s.STORAGE_KEY)
  assert.match(stored.journal[0].title, /^问瓷：/); assert.match(stored.journal[0].title, /…$/)
  assert.ok(stored.journal[0].title.length <= 80); assert.equal(JSON.stringify(stored).includes(question), false)
})

test('a new live event adds exactly one badge journal entry with that event time and no extra XP', () => {
  const s = setup(); const eventTime = now - 5000
  for (let index = 1; index <= 9; index++) s.service.recordGrowthEvent('work_created', digital(`first-nine-${index}`, null))
  const state = s.service.recordGrowthEvent('work_created', digital('first-craft', eventTime))
  const stored = s.storage.get(s.STORAGE_KEY)
  assert.deepEqual(stored.journal.filter(item => item.iconType === 'badge_unlocked'), [{
    id: 'badge:craft', title: '获得徽章「匠心巧手」', createdAt: eventTime, iconType: 'badge_unlocked'
  }])
  assert.equal(state.identity.totalXp, 150); assert.equal(stored.events.length, 10)
  const writes = s.writes.length
  s.service.recordGrowthEvent('work_created', digital('first-craft', now))
  assert.equal(s.writes.length, writes)
  s.service.recordGrowthEvent('work_created', digital('second-craft', now))
  assert.equal(s.storage.get(s.STORAGE_KEY).journal.filter(item => item.id === 'badge:craft').length, 1)
  assert.doesNotThrow(() => s.service.getProfileState())
  const invalid = structuredClone(s.storage.get(s.STORAGE_KEY))
  invalid.journal.push({ id: 'badge:unknown', title: '未知徽章', createdAt: now, iconType: 'badge_unlocked' })
  s.storage.set(s.STORAGE_KEY, invalid)
  assert.throws(() => s.service.getProfileState(), { code: 'GROWTH_INVALID_STORE' })
})

test('unknown historical acquisition times never gain badge journal entries from a later duplicate or visit', () => {
  const s = setup({ craftWorks: Array.from({ length: 10 }, (_, index) => ({ ...digital(`history-work-${index}`, 0), name: '旧作', image: '/own.jpg' })) })
  s.service.migrateExistingRecords()
  assert.equal(s.service.getProfileState().badges.find(badge => badge.id === 'craft').unlocked, true)
  s.service.recordGrowthEvent('work_created', digital('history-work-0', now))
  s.service.recordVisit()
  assert.deepEqual(s.service.getProfileState().journal, [])
})

test('the 13th exploration day keeps master locked and the 14th real day unlocks it once', () => {
  const { STORAGE_KEY } = load(); const prior = masterStore({ exploredDays: 13, answers: 330 })
  prior.unlockedBadgeIds = ['craft', 'creator', 'identify', 'scholar', 'inquiry']
  const s = setup({ [STORAGE_KEY]: prior })
  assert.equal(s.service.getProfileState().stats.exploredDays, 13); assert.equal(s.service.getProfileState().badges[0].unlocked, false)
  const nextDay = now; s.setClock(nextDay)
  const state = s.service.recordVisit()
  assert.equal(state.stats.exploredDays, 14); assert.equal(state.badges[0].unlocked, true); assert.equal(state.badges[0].current, 7)
  assert.deepEqual(state.journal.map(({ id, createdAt, iconType }) => ({ id, createdAt, iconType })), [{ id: 'badge:master', createdAt: nextDay, iconType: 'badge_unlocked' }])
  const writes = s.writes.length; s.service.recordVisit(); assert.equal(s.writes.length, writes)
})

test('showcase mode is excluded consistently from work growth and current own-work footprints', () => {
  const s = setup({ craftWorks: [
    { ...digital('owned'), name: '本人作品', image: '/own.jpg' },
    { ...digital('example'), name: '展示案例', image: '/example.jpg', mode: 'showcase' }
  ] })
  const state = s.service.migrateExistingRecords()
  assert.equal(state.footprints.ownWorks, 1); assert.equal(state.stats.ownWorks, 1); assert.equal(state.identity.totalXp, 15)
})

test('unrepresentable Shanghai dates never poison new or persisted growth journals', () => {
  const s = setup()
  for (const [index, createdAt] of [8640000000000000, Date.parse('9999-12-31T16:00:00Z')].entries()) {
    const state = s.service.recordGrowthEvent('identify_completed', { id: `invalid-zone-date-${index}`, resultStatus: 'recognized', createdAt })
    assert.equal(state.journal.length, 0)
  }
  assert.doesNotThrow(() => s.service.getProfileState())
  const boundary = Date.parse('9999-12-31T15:59:59.999Z')
  s.service.recordGrowthEvent('ceramic_viewed', { id: 'ceramic-001', createdAt: boundary })
  assert.equal(s.service.getProfileState().journal[0].dateLabel, '9999.12.31')
  const invalid = structuredClone(s.storage.get(s.STORAGE_KEY)); invalid.journal[0].createdAt = 8640000000000000
  s.storage.set(s.STORAGE_KEY, invalid); const writes = s.writes.length
  assert.throws(() => s.service.getProfileState(), { code: 'GROWTH_INVALID_STORE' })
  assert.throws(() => s.service.recordVisit(), { code: 'GROWTH_INVALID_STORE' }); assert.equal(s.writes.length, writes)
  assert.deepEqual(s.storage.get(s.STORAGE_KEY), invalid)
  const invalidClock = setup(); invalidClock.setClock(8640000000000000)
  assert.throws(() => invalidClock.service.recordVisit(), { code: 'GROWTH_INVALID_EVENT' }); assert.equal(invalidClock.writes.length, 0)
})

test('exact V1 imports keep a canonical growth identity across random and stable archive ids', () => {
  const messages = [{ role: 'user', text: '旧版问题' }, { role: 'assistant', text: '旧版回答' }]
  const imported = messages.map((item, index) => ({ ...item, id: `message_${index}`, createdAt: 0 }))
  const realRound = pair('real-round', now)
  const s = setup({
    'aiChatSessionV1:ceramic-001': { messages, input: '', active: null },
    aiChatConversationsV2: { version: 2, conversations: [
      { id: 'old-random-import', ceramicId: 'ceramic-001', messages: [...imported, ...realRound], createdAt: now, updatedAt: now }
    ] }
  })
  assert.equal(s.service.migrateExistingRecords().stats.answers, 2)
  const records = s.storage.get(s.STORAGE_KEY).events
  assert.equal(records.find(item => item.id === 'message_1').conversationId, 'legacy-ceramic-001')
  assert.equal(records.find(item => item.id === 'real-round-assistant').conversationId, 'old-random-import')
  const writes = s.writes.length
  s.service.recordGrowthEvent('chat_answered', { id: 'message_1', conversationId: 'old-random-import', createdAt: 0 })
  assert.equal(s.writes.length, writes)
  s.storage.set('aiChatConversationsV2', { version: 2, conversations: [
    { id: 'legacy-ceramic-001', ceramicId: 'ceramic-001', messages: imported },
    { id: 'real-same-text', ceramicId: 'ceramic-001', messages: messages.map((item, index) => ({ ...item, id: `real-${index}`, createdAt: now })) }
  ] })
  const state = s.service.migrateExistingRecords()
  assert.equal(state.stats.answers, 3); assert.equal(state.identity.totalXp, 9)
})

test('remaining V1 rounds keep their canonical identity after the archive truncates older rounds', () => {
  const messages = [
    { role: 'user', text: '旧版第一问' }, { role: 'assistant', text: '旧版第一答' },
    { role: 'user', text: '旧版第二问' }, { role: 'assistant', text: '旧版第二答' }
  ]
  const imported = messages.map((item, index) => ({ ...item, id: `message_${index}`, createdAt: 0 }))
  const conversation = { id: 'old-random-import', ceramicId: 'ceramic-001', messages: imported, createdAt: now, updatedAt: now }
  const s = setup({
    'aiChatSessionV1:ceramic-001': { messages, input: '', active: null },
    aiChatConversationsV2: { version: 2, conversations: [conversation] }
  })
  assert.equal(s.service.migrateExistingRecords().stats.answers, 2)
  const { sanitizeArchive } = require('../utils/ai-chat-conversations')
  const updated = sanitizeArchive({ version: 2, conversations: [{ ...conversation,
    messages: [...imported, ...Array.from({ length: 39 }, (_, index) => pair(`new-${index}`, now + index)).flat()]
  }] })
  assert.equal(updated.conversations[0].messages.length, 80)
  assert.equal(updated.conversations[0].messages[0].id, 'message_2')
  s.storage.set('aiChatConversationsV2', updated)
  assert.equal(s.service.migrateExistingRecords().stats.answers, 41)
  const writes = s.writes.length
  s.service.recordGrowthEvent('chat_answered', { id: 'message_3', conversationId: 'old-random-import', createdAt: 0 })
  assert.equal(s.writes.length, writes)
  const records = s.storage.get(s.STORAGE_KEY).events
  assert.equal(records.find(item => item.id === 'message_3').conversationId, 'legacy-ceramic-001')
  assert.equal(records.find(item => item.id === 'new-0-assistant').conversationId, 'old-random-import')
})

test('a V1 pending request uses one growth identity when its original result is recovered again', () => {
  const payload = { question: '待确认的旧问题', history: [], clientRequestId: 'legacy-request', ceramicId: 'ceramic-002' }
  const s = setup({
    'aiChatSessionV1:ceramic-002': { active: { status: 'unknown', payload } },
    aiChatConversationsV2: { version: 2, conversations: [
      { id: 'random-active-import', ceramicId: 'ceramic-002', messages: [], active: { status: 'unknown', payload } }
    ] }
  })
  s.service.recordGrowthEvent('chat_answered', { id: 'legacy-request-assistant', conversationId: 'random-active-import', title: payload.question, createdAt: now })
  const writes = s.writes.length
  s.storage.set('aiChatConversationsV2', { version: 2, conversations: [{
    id: 'legacy-ceramic-002', ceramicId: 'ceramic-002', messages: [
      { role: 'user', id: 'legacy-request-user', text: payload.question, createdAt: now },
      { role: 'assistant', id: 'legacy-request-assistant', text: '原请求的结果', createdAt: now }
    ]
  }] })
  assert.equal(s.service.migrateExistingRecords().stats.answers, 1); assert.equal(s.writes.length, writes)
})
