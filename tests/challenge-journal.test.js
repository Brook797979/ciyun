const assert = require('node:assert/strict')
const test = require('node:test')
const { createGrowthProgress, STORAGE_KEY } = require('../utils/growth-progress')
const { recordChallengeCompletion } = require('../utils/challenge-progress')
const { completeChallenge } = require('../utils/challenge-rewards')
const now = Date.parse('2026-10-19T02:00:00Z')
const key = (type, id) => `${type}:${JSON.stringify([id])}`

function oldStore() {
  const events = [
    { type: 'challenge_completed', id: 'level-003' },
    { type: 'challenge_completed', id: 'level-004' },
    { type: 'challenge_completed', id: 'level-005' },
    { type: 'ceramic_viewed', id: 'ceramic-001' },
    { type: 'work_created', id: 'own-work', creationType: 'digital' }
  ]
  const titles = ['完成关卡《豆青映水》', '完成关卡《瓶中春色》', '完成关卡《花鸟相和》', '赏瓷：青花梅瓶', '保存作品《自己的青瓷碗》']
  const journal = events.map((event, index) => ({ id: key(event.type, event.id), title: titles[index], iconType: event.type, createdAt: now - 1000 * index }))
  journal.push({ id: 'badge:craft', title: '获得徽章「匠心巧手」', iconType: 'badge_unlocked', createdAt: now - 10000 })
  return { version: 1, visits: ['2026-10-18'], events, unlockedBadgeIds: [], journal }
}

function setup(initial = {}) {
  const storage = new Map(Object.entries(initial).map(([name, value]) => [name, structuredClone(value)]))
  const writes = [], failWrites = new Set()
  const platform = {
    getStorageSync: name => storage.has(name) ? structuredClone(storage.get(name)) : '',
    setStorageSync(name, value) {
      if (failWrites.has(name)) throw new Error('disk full')
      writes.push(name); storage.set(name, structuredClone(value))
    }
  }
  return { storage, writes, platform, failWrites, service: createGrowthProgress(platform) }
}
function usePlatform(t, platform) {
  const previous = global.wx; global.wx = platform
  t.after(() => { global.wx = previous })
}

test('v1 upgrade removes only obsolete challenge journal entries and preserves earned progress', () => {
  const old = oldStore(), env = setup({ [STORAGE_KEY]: old })
  const state = env.service.getProfileState()
  const expected = old.journal.filter(item => item.iconType !== 'challenge_completed')
  assert.deepEqual(state.journal.map(({ dateLabel, ...item }) => item), expected.slice().sort((a, b) => b.createdAt - a.createdAt))
  assert.deepEqual(env.storage.get(STORAGE_KEY), { ...old, version: 2, journal: expected })
  assert.equal(state.identity.totalXp, 79)
  assert.equal(state.footprints.completedLevels, 3)
  assert.deepEqual(env.writes, [STORAGE_KEY])
  assert.equal(old.version, 1)
  assert.equal(old.journal.length, 6)
})

test('cleanup is durable and runs once even after restart and legacy progress migration', () => {
  const env = setup({ [STORAGE_KEY]: oldStore(), challengeProgress: { completedLevelIds: ['level-003', 'level-004', 'level-005'] } })
  env.service.getProfileState()
  const state = env.service.recordGrowthEvent('challenge_completed', { id: 'level-004', title: '瓶中春色', createdAt: now + 1000 })
  assert.equal(state.journal[0].title, '完成第4关 · 瓷器辨形')
  const saved = structuredClone(env.storage.get(STORAGE_KEY)), writeCount = env.writes.length
  const restarted = createGrowthProgress(env.platform)
  restarted.getProfileState(); restarted.migrateExistingRecords(); restarted.getProfileState()
  assert.deepEqual(env.storage.get(STORAGE_KEY), saved)
  assert.equal(env.writes.length, writeCount)
  assert.equal(saved.journal.filter(item => item.iconType === 'challenge_completed').length, 1)
})

test('replaying an already completed old level creates its current journal without new XP or rewards', t => {
  const originalProgress = { version: 1, note: '保留挑战进度', completedLevelIds: ['level-003', 'level-004', 'level-005'] }
  const env = setup({ [STORAGE_KEY]: oldStore(), challengeProgress: originalProgress, unlockedShapeIds: ['custom', 'vase'] })
  usePlatform(t, env.platform)
  env.service.getProfileState()
  const before = env.service.getProfileState().identity.totalXp
  assert.equal(completeChallenge('level-004').completedCount, 3)
  const journal = env.service.getProfileState().journal.find(item => item.iconType === 'challenge_completed')
  assert.ok(journal, 'a real replay must repair the cleared challenge journal')
  assert.equal(journal.title, '完成第4关 · 瓷器辨形')
  assert.ok(journal.createdAt >= now)
  assert.equal(env.service.getProfileState().identity.totalXp, before)
  assert.deepEqual(env.storage.get('challengeProgress'), originalProgress)
  assert.deepEqual(env.storage.get('unlockedShapeIds'), ['custom', 'vase'])
  const saved = structuredClone(env.storage.get(STORAGE_KEY)), writes = env.writes.length
  completeChallenge('level-004')
  assert.equal(env.writes.length, writes)
  assert.deepEqual(env.storage.get(STORAGE_KEY), saved)
})

test('legacy completion import retains cumulative XP without recreating a journal with fake dates', () => {
  const env = setup({ [STORAGE_KEY]: oldStore(), challengeProgress: { completedLevelIds: ['level-001', 'level-004', 'level-004', 'unknown'] } })
  const state = env.service.migrateExistingRecords()
  assert.equal(state.stats.completedLevels, 4)
  assert.equal(state.identity.totalXp, 99)
  assert.ok(state.journal.every(item => item.iconType !== 'challenge_completed'))
  const before = env.writes.length
  env.service.migrateExistingRecords()
  assert.equal(env.writes.length, before)
})

test('all twelve live completions derive current game labels from stable IDs instead of caller map titles', () => {
  const titles = ['纹样消消乐', '瓷纹连连看', '古瓷拼图', '瓷器辨形', '瓷识小问答', '纹样消消乐', '古瓷拼图', '瓷器辨形', '瓷纹连连看', '瓷识小问答', '纹样消消乐', '古瓷拼图']
  const env = setup()
  titles.forEach((title, index) => {
    const id = `level-${String(index + 1).padStart(3, '0')}`
    const state = env.service.recordGrowthEvent('challenge_completed', { id, title: '旧地图名称不应写入手札', createdAt: now + index })
    assert.equal(state.journal[0].title, `完成第${index + 1}关 · ${title}`)
    assert.equal(state.identity.totalXp, (index + 1) * 20)
  })
  assert.equal(env.storage.get(STORAGE_KEY).events.length, 12)
})

test('failed cleanup writes preserve the original v1 store and retry safely', () => {
  const old = oldStore(), env = setup({ [STORAGE_KEY]: old })
  env.failWrites.add(STORAGE_KEY)
  assert.throws(() => env.service.getProfileState(), { code: 'GROWTH_WRITE_FAILED' })
  assert.deepEqual(env.storage.get(STORAGE_KEY), old)
  assert.deepEqual(env.writes, [])
  env.failWrites.clear()
  assert.ok(env.service.getProfileState().journal.every(item => item.iconType !== 'challenge_completed'))
  assert.equal(env.storage.get(STORAGE_KEY).version, 2)
  assert.deepEqual(env.writes, [STORAGE_KEY])
})

test('an incomplete challenge save cannot append journal or growth', t => {
  const env = setup()
  usePlatform(t, env.platform)
  env.failWrites.add('challengeProgress')
  assert.throws(() => recordChallengeCompletion('level-004'), /disk full/)
  assert.deepEqual(env.writes, [])
  assert.equal(env.storage.has(STORAGE_KEY), false)
})

test('growth failure during a real replay preserves completion and a later replay repairs its journal', t => {
  const old = oldStore(), progress = { completedLevelIds: ['level-004'] }
  const env = setup({ [STORAGE_KEY]: old, challengeProgress: progress })
  usePlatform(t, env.platform)
  env.failWrites.add(STORAGE_KEY)
  assert.equal(recordChallengeCompletion('level-004').completedCount, 1)
  assert.deepEqual(env.storage.get(STORAGE_KEY), old)
  assert.deepEqual(env.storage.get('challengeProgress'), progress)
  env.failWrites.clear()
  recordChallengeCompletion('level-004')
  assert.equal(env.service.getProfileState().journal[0].title, '完成第4关 · 瓷器辨形')
  assert.equal(env.service.getProfileState().identity.totalXp, 79)
})

test('corrupt legacy and unsupported future growth versions are preserved without cleanup', () => {
  for (const store of [{ ...oldStore(), version: 3 }, { ...oldStore(), journal: [{ id: 'broken' }] }]) {
    const env = setup({ [STORAGE_KEY]: store })
    assert.throws(() => env.service.getProfileState(), { code: 'GROWTH_INVALID_STORE' })
    assert.deepEqual(env.storage.get(STORAGE_KEY), store)
    assert.deepEqual(env.writes, [])
  }
})
