const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const progressPath = path.join(root, 'utils/challenge-progress.js')
const levelIds = Array.from({ length: 12 }, (_, index) => `level-${String(index + 1).padStart(3, '0')}`)

function loadProgress() {
  assert.ok(fs.existsSync(progressPath), 'the shared challenge progress module must exist')
  return require(progressPath)
}

function createStorage(t, initialProgress) {
  const originalWx = global.wx
  const storage = new Map()
  const reads = []
  const writes = []
  if (initialProgress !== undefined) storage.set('challengeProgress', structuredClone(initialProgress))
  global.wx = {
    getStorageSync(key) {
      reads.push(key)
      return storage.has(key) ? structuredClone(storage.get(key)) : ''
    },
    setStorageSync(key, value) {
      writes.push([key, structuredClone(value)])
      storage.set(key, structuredClone(value))
    }
  }
  t.after(() => { global.wx = originalWx })
  return { storage, reads, writes }
}

test('static challenge data keeps chapter order, rewards, and difficulty without demo progress', () => {
  const levels = require(path.join(root, 'data/challenges'))
  const map = require(path.join(root, 'data/challenge-map'))
  assert.equal(levels.length, 12)
  assert.deepEqual(levels.map(({ id }) => id), levelIds)
  assert.deepEqual(levels.map(({ reward }) => [reward.type, reward.id]), [
    ['shape', 'bowl'], ['pattern', 'pattern-scroll-lotus'], ['glaze', 'glaze-bean'],
    ['shape', 'vase'], ['pattern', 'pattern-flower-bird'], ['glaze', 'glaze-rice'],
    ['shape', 'garlic'], ['pattern', 'pattern-beast'], ['glaze', 'glaze-cobalt'],
    ['shape', 'double-ear'], ['pattern', 'pattern-landscape'], ['glaze', 'glaze-rouge']
  ])
  levels.forEach((level, index) => {
    assert.equal(level.chapterId, `chapter-${Math.floor(index / 4) + 1}`)
    assert.equal(level.difficulty, Math.floor(index / 4) + 1)
    assert.deepEqual(level.difficultyStars, [1, 2, 3].map((star) => star <= level.difficulty))
    assert.equal(Object.hasOwn(level, 'status'), false)
    assert.equal(Object.hasOwn(level, 'statusLabel'), false)
  })
  assert.deepEqual(map.chapters.map(({ id, name }) => [id, name]), [
    ['chapter-1', '溪畔识瓷'], ['chapter-2', '青花作坊'], ['chapter-3', '窑火成器']
  ])
  assert.deepEqual(map.chapters.flatMap(({ levels }) => levels), levels)
  assert.equal(map.totalCount, 12)
  for (const key of ['completedCount', 'currentLevelId', 'progressPercent', 'achievement']) {
    assert.equal(Object.hasOwn(map, key), false, `static map must not supply ${key}`)
  }
  assert.equal(map.badges.length, 3)
  assert.equal(new Set(map.badges.map(({ id }) => id)).size, 3)
  assert.deepEqual(map.badges.map(({ chapterId }) => chapterId), map.chapters.map(({ id }) => id))
  map.badges.forEach((badge) => {
    assert.ok(badge.name)
    assert.equal(badge.image, `/assets/challenge/badges/${badge.chapterId}.png`)
    assert.equal(Object.hasOwn(badge, 'unlocked'), false)
  })
})

test('free access makes every unfinished level playable while completions and badges remain truthful', () => {
  assert.equal(require(path.join(root, 'data/challenge-settings')).freeAccess, true)
  const { buildChallengeState } = loadProgress()
  const empty = buildChallengeState()
  assert.ok(empty.chapters.flatMap(({ levels }) => levels).every(({ status }) => status === 'available'))
  assert.equal(empty.completedCount, 0)
  assert.equal(empty.progressPercent, 0)
  assert.ok(empty.badges.every(({ completedCount, unlocked }) => completedCount === 0 && !unlocked))

  const progress = { completedLevelIds: ['level-012', 'level-005', 'level-012', 'unknown'] }
  const before = structuredClone(progress)
  const state = buildChallengeState(progress)
  assert.equal(state.completedCount, 2)
  assert.equal(state.currentLevelId, 'level-001')
  assert.equal(state.progressPercent, 2 / 12 * 100)
  assert.deepEqual(state.chapters.flatMap(({ levels }) => levels).map(({ id, status }) => [id, status]), (
    levelIds.map(id => [id, ['level-005', 'level-012'].includes(id) ? 'completed' : 'available'])
  ))
  assert.deepEqual(state.badges.map(({ completedCount, unlocked }) => [completedCount, unlocked]), [
    [0, false], [1, false], [1, false]
  ])
  assert.deepEqual(progress, before)
})

for (const completedCount of [0, 2, 4, 8, 12]) {
  test(`${completedCount} real completions derive the next level, metrics, and chapter badges`, () => {
    const { buildChallengeState } = loadProgress()
    const state = buildChallengeState({ completedLevelIds: levelIds.slice(0, completedCount) }, { freeAccess: false })
    assert.equal(state.completedCount, completedCount)
    assert.equal(state.totalCount, 12)
    assert.equal(state.currentLevelId, levelIds[completedCount] || '')
    assert.equal(state.progressPercent, completedCount / 12 * 100)
    const levels = state.chapters.flatMap(({ levels }) => levels)
    assert.deepEqual(levels.map(({ status }) => status), levelIds.map((id, index) => (
      index < completedCount ? 'completed' : index === completedCount ? 'available' : 'locked'
    )))
    assert.ok(levels.every(({ status, statusLabel }) => statusLabel === {
      completed: '已完成', available: '待挑战', locked: '未解锁'
    }[status]))
    state.badges.forEach((badge, chapterIndex) => {
      const chapterCount = Math.max(0, Math.min(4, completedCount - chapterIndex * 4))
      assert.equal(badge.completedCount, chapterCount)
      assert.equal(badge.finishedLevels, chapterCount)
      assert.equal(badge.totalCount, 4)
      assert.equal(badge.totalLevels, 4)
      assert.equal(badge.progressPercent, chapterCount / 4 * 100)
      assert.equal(badge.unlocked, chapterCount === 4)
      assert.equal(badge.image, `/assets/challenge/badges/${badge.chapterId}.png`)
    })
  })
}

test('missing and malformed progress starts at zero instead of reading legacy summary counts', () => {
  const { buildChallengeState } = loadProgress()
  for (const progress of [undefined, null, '', 'invalid', 42, false, [], levelIds, {},
    { completedCount: 4, currentLevelId: 'level-005' },
    { completedLevelIds: null }, { completedLevelIds: 'level-001' }, { completedLevelIds: {} }]) {
    const state = buildChallengeState(progress)
    assert.equal(state.completedCount, 0)
    assert.equal(state.currentLevelId, 'level-001')
    assert.equal(state.progressPercent, 0)
    assert.ok(state.badges.every(({ unlocked }) => !unlocked))
  }
})

test('normalization counts valid unique ids and leaves input and static data unchanged', () => {
  const { buildChallengeState } = loadProgress()
  const levels = require(path.join(root, 'data/challenges'))
  const map = require(path.join(root, 'data/challenge-map'))
  const initialMap = structuredClone(map)
  const initialLevels = structuredClone(levels)
  const progress = { completedLevelIds: ['level-002', 'unknown', 'level-001', 'level-002', null, 3, {}, ' level-003'] }
  const initialProgress = structuredClone(progress)
  const state = buildChallengeState(progress, { freeAccess: false })
  assert.equal(state.completedCount, 2)
  assert.deepEqual(state.badges.map(({ finishedLevels, totalLevels, progressPercent }) => (
    [finishedLevels, totalLevels, progressPercent]
  )), [[2, 4, 50], [0, 4, 0], [0, 4, 0]])
  assert.equal(state.currentLevelId, 'level-003')
  assert.deepEqual(state.chapters[0].levels.map(({ status }) => status), ['completed', 'completed', 'available', 'locked'])
  assert.deepEqual(progress, initialProgress)
  assert.deepEqual(map, initialMap)
  assert.deepEqual(levels, initialLevels)
  assert.equal(buildChallengeState().completedCount, 0)
})

test('a chapter badge requires every level in that chapter even when aggregate count passes four', () => {
  const { buildChallengeState } = loadProgress()
  const state = buildChallengeState({ completedLevelIds: ['level-001', 'level-002', 'level-004', ...levelIds.slice(4, 8)] }, { freeAccess: false })
  assert.equal(state.completedCount, 7)
  assert.equal(state.currentLevelId, 'level-003')
  assert.deepEqual(state.badges.map(({ completedCount, unlocked }) => [completedCount, unlocked]), [[3, false], [4, true], [0, false]])
  assert.deepEqual(state.badges.map(({ finishedLevels, totalLevels, progressPercent }) => (
    [finishedLevels, totalLevels, progressPercent]
  )), [[3, 4, 75], [4, 4, 100], [0, 4, 0]])
  assert.deepEqual(state.chapters[0].levels.map(({ status }) => status), ['completed', 'completed', 'available', 'completed'])
  assert.equal(state.chapters[2].levels[0].status, 'locked')
})

test('a chapter without actual levels stays locked with zero progress despite its configured total', () => {
  const source = fs.readFileSync(progressPath, 'utf8')
  const module = { exports: {} }
  const badge = { id: 'badge-empty', chapterId: 'chapter-empty', totalLevels: 4 }
  const map = { chapters: [], badges: [badge], totalCount: 0 }
  vm.runInNewContext(source, {
    module,
    require(name) {
      if (name === '../data/challenges') return []
      if (name === '../data/challenge-map') return map
      if (name === '../data/challenge-settings') return { freeAccess: false }
      throw new Error(`Unexpected dependency: ${name}`)
    }
  }, { filename: progressPath })
  const state = module.exports.buildChallengeState({ completedLevelIds: ['unknown'] })
  const result = state.badges[0]
  assert.equal(result.finishedLevels, 0)
  assert.equal(result.totalLevels, 0)
  assert.equal(result.completedCount, 0)
  assert.equal(result.totalCount, 0)
  assert.equal(result.progressPercent, 0)
  assert.equal(result.unlocked, false)
  assert.equal(badge.totalLevels, 4)
})

test('getChallengeState reads only challengeProgress and never invents or writes progress', (t) => {
  const { reads, writes, storage } = createStorage(t)
  storage.set('user', { completedChallenges: 4, completedCount: 4 })
  const { STORAGE_KEY, getChallengeState } = loadProgress()
  assert.equal(STORAGE_KEY, 'challengeProgress')
  assert.equal(getChallengeState().completedCount, 0)
  storage.set(STORAGE_KEY, { completedLevelIds: levelIds.slice(0, 4) })
  assert.equal(getChallengeState().completedCount, 4)
  assert.deepEqual(reads, [STORAGE_KEY, STORAGE_KEY])
  assert.deepEqual(writes, [])
})

test('recordChallengeCompletion persists real completion and preserves existing storage fields', (t) => {
  const original = { version: 7, note: '保留', metadata: { source: 'real-game' }, completedLevelIds: ['unknown', 'level-001', 'level-001'] }
  const { storage, writes } = createStorage(t, original)
  const { STORAGE_KEY, getChallengeState, recordChallengeCompletion } = loadProgress()
  const beforeCatalogs = structuredClone(['shapes', 'patterns', 'glazes'].map((name) => require(path.join(root, `data/${name}`))))
  const state = recordChallengeCompletion('level-002')
  assert.equal(state.completedCount, 2)
  assert.equal(state.currentLevelId, 'level-003')
  assert.deepEqual(storage.get(STORAGE_KEY), {
    ...original, version: 1, completedLevelIds: ['level-001', 'level-002']
  })
  assert.equal(writes.filter(([key]) => key === STORAGE_KEY).length, 1)
  assert.equal(writes[0][0], STORAGE_KEY)
  assert.deepEqual(getChallengeState(), state)
  assert.deepEqual(original.completedLevelIds, ['unknown', 'level-001', 'level-001'])
  assert.deepEqual(['shapes', 'patterns', 'glazes'].map((name) => require(path.join(root, `data/${name}`))), beforeCatalogs)
})

test('free access can record a later real completion without completing prerequisites or unlocking a badge', (t) => {
  const { storage, writes } = createStorage(t, { completedLevelIds: [], note: '保留' })
  const { STORAGE_KEY, recordChallengeCompletion } = loadProgress()
  const state = recordChallengeCompletion('level-012')
  assert.deepEqual(storage.get(STORAGE_KEY), { version: 1, completedLevelIds: ['level-012'], note: '保留' })
  assert.equal(writes.filter(([key]) => key === STORAGE_KEY).length, 1)
  assert.equal(state.completedCount, 1)
  assert.equal(state.currentLevelId, 'level-001')
  assert.deepEqual(state.badges.map(({ completedCount, unlocked }) => [completedCount, unlocked]), [
    [0, false], [0, false], [1, false]
  ])
  assert.equal(state.chapters[0].levels[0].status, 'available')
  assert.equal(state.chapters[2].levels[3].status, 'completed')
})

test('replaying a completed level preserves progress and can restore its growth journal', (t) => {
  const original = { completedLevelIds: ['level-001', 'level-001', 'unknown'], note: '保留' }
  const { storage, writes } = createStorage(t, original)
  const { STORAGE_KEY, recordChallengeCompletion } = loadProgress()
  const state = recordChallengeCompletion('level-001')
  assert.equal(state.completedCount, 1)
  assert.deepEqual(writes.filter(([key]) => key === STORAGE_KEY), [])
  assert.deepEqual(storage.get(STORAGE_KEY), original)
  assert.equal(storage.get('profileGrowthV1').journal[0].title, '完成第1关 · 纹样消消乐')
})

test('unknown completion ids are rejected without changing storage', (t) => {
  const original = { completedLevelIds: [] }
  const { storage, writes } = createStorage(t, original)
  const { STORAGE_KEY, recordChallengeCompletion } = loadProgress()
  for (const id of [undefined, null, '', 'unknown', 'level-000', 'level-013', 1, {}]) {
    assert.throws(() => recordChallengeCompletion(id), /无效关卡/)
  }
  assert.deepEqual(writes, [])
  assert.deepEqual(storage.get(STORAGE_KEY), original)
})

test('sequential access requires all earlier levels including any missing prerequisite', (t) => {
  const { storage, writes } = createStorage(t, { completedLevelIds: [] })
  const { STORAGE_KEY, recordChallengeCompletion } = loadProgress()
  assert.throws(() => recordChallengeCompletion('level-002', { freeAccess: false }), /请先完成前置关卡/)
  const missingFirst = { completedLevelIds: ['level-002'] }
  storage.set(STORAGE_KEY, missingFirst)
  assert.throws(() => recordChallengeCompletion('level-003', { freeAccess: false }), /请先完成前置关卡/)
  assert.deepEqual(writes, [])
  assert.deepEqual(storage.get(STORAGE_KEY), missingFirst)
})

test('sequential real completions unlock exactly one badge at each chapter boundary', (t) => {
  const { writes } = createStorage(t)
  const { getChallengeState, recordChallengeCompletion } = loadProgress()
  levelIds.forEach((id, index) => {
    const state = recordChallengeCompletion(id, { freeAccess: false })
    assert.equal(state.completedCount, index + 1)
    assert.equal(state.badges.filter(({ unlocked }) => unlocked).length, Math.floor((index + 1) / 4))
    const refreshed = getChallengeState()
    assert.equal(refreshed.completedCount, state.completedCount)
    assert.equal(refreshed.currentLevelId, state.currentLevelId)
    assert.deepEqual(refreshed.badges, state.badges)
  })
  assert.equal(writes.filter(([key]) => key === 'challengeProgress').length, 12)
  assert.equal(getChallengeState().currentLevelId, '')
})

test('malformed stored progress can record a first real completion from zero', (t) => {
  const { storage } = createStorage(t)
  const { STORAGE_KEY, recordChallengeCompletion } = loadProgress()
  for (const progress of [null, '', 42, [], { completedLevelIds: 'invalid', note: '保留' }]) {
    storage.set(STORAGE_KEY, progress)
    const state = recordChallengeCompletion('level-001')
    assert.equal(state.completedCount, 1)
    assert.deepEqual(storage.get(STORAGE_KEY).completedLevelIds, ['level-001'])
    if (progress && progress.note) assert.equal(storage.get(STORAGE_KEY).note, '保留')
  }
})

test('storage read failures propagate without replacing progress', (t) => {
  const original = { completedLevelIds: ['level-001'], note: '保留' }
  const { storage, writes } = createStorage(t, original)
  const { STORAGE_KEY, getChallengeState, recordChallengeCompletion } = loadProgress()
  const error = new Error('storage unavailable')
  global.wx.getStorageSync = () => { throw error }
  assert.throws(() => getChallengeState(), (caught) => caught === error)
  assert.throws(() => recordChallengeCompletion('level-002'), (caught) => caught === error)
  assert.deepEqual(writes, [])
  assert.deepEqual(storage.get(STORAGE_KEY), original)
})

test('storage write failures propagate instead of returning a successful completion', (t) => {
  const original = { completedLevelIds: ['level-001'], note: '保留' }
  const { storage } = createStorage(t, original)
  const { STORAGE_KEY, getChallengeState, recordChallengeCompletion } = loadProgress()
  const error = new Error('storage full')
  global.wx.setStorageSync = () => { throw error }
  assert.throws(() => recordChallengeCompletion('level-002'), (caught) => caught === error)
  assert.deepEqual(storage.get(STORAGE_KEY), original)
  assert.equal(getChallengeState().completedCount, 1)
})
