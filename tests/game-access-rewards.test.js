const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
function environment(t) {
  const previous = global.wx, store = new Map(), writes = []
  global.wx = { getStorageSync: key => store.has(key) ? structuredClone(store.get(key)) : '', setStorageSync(key, value) { writes.push(key); store.set(key, structuredClone(value)) } }
  t.after(() => { global.wx = previous })
  return { store, writes }
}
function rewards() {
  assert.ok(fs.existsSync(path.join(root, 'utils/challenge-rewards.js')), 'real gameplay reward service must exist')
  return require('../utils/challenge-rewards')
}
test('temporary free access opens every entry without inventing completions or badges', () => {
  assert.ok(fs.existsSync(path.join(root, 'data/challenge-settings.js')))
  assert.equal(require('../data/challenge-settings').freeAccess, true)
  const state = require('../utils/challenge-progress').buildChallengeState()
  assert.ok(state.chapters.flatMap(c => c.levels).every(l => l.status === 'available'))
  assert.equal(state.completedCount, 0)
  assert.ok(state.badges.every(b => !b.unlocked))
  const normal = require('../utils/challenge-progress').buildChallengeState(undefined, { freeAccess: false })
  assert.deepEqual(normal.chapters[0].levels.map(l => l.status), ['available', 'locked', 'locked', 'locked'])
})
test('an out-of-order actual win grants only that level and catalog reward, once', t => {
  const { store, writes } = environment(t)
  const service = rewards()
  store.set('unlockedShapeIds', ['kept-custom-shape'])
  const state = service.completeChallenge('level-004')
  assert.equal(state.completedCount, 1)
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-004'])
  assert.deepEqual(store.get('unlockedShapeIds'), ['kept-custom-shape', 'vase'])
  assert.ok(state.badges.every(b => !b.unlocked))
  const before = writes.length
  service.completeChallenge('level-004')
  assert.equal(writes.length, before)
})
test('all four real wins unlock first chapter and exact shape/pattern/glaze rewards', t => {
  const { store } = environment(t), service = rewards()
  let state
  for (const id of ['level-004', 'level-002', 'level-001', 'level-003']) state = service.completeChallenge(id)
  assert.deepEqual(state.badges.map(b => b.unlocked), [true, false, false])
  assert.deepEqual(store.get('unlockedShapeIds'), ['vase', 'bowl'])
  assert.deepEqual(store.get('unlockedPatternIds'), ['pattern-scroll-lotus'])
  assert.deepEqual(store.get('unlockedGlazeIds'), ['glaze-bean'])
})
test('all twelve actual wins grant exact rewards and each chapter badge requires its own four wins', t => {
  const { store, writes } = environment(t), service = rewards()
  const expectedRewards = [
    ['unlockedShapeIds', 'bowl'], ['unlockedPatternIds', 'pattern-scroll-lotus'], ['unlockedGlazeIds', 'glaze-bean'],
    ['unlockedShapeIds', 'vase'], ['unlockedPatternIds', 'pattern-flower-bird'], ['unlockedGlazeIds', 'glaze-rice'],
    ['unlockedShapeIds', 'garlic'], ['unlockedPatternIds', 'pattern-beast'], ['unlockedGlazeIds', 'glaze-cobalt'],
    ['unlockedShapeIds', 'double-ear'], ['unlockedPatternIds', 'pattern-landscape'], ['unlockedGlazeIds', 'glaze-rouge']
  ]
  const completed = []
  const unlocked = { unlockedShapeIds: [], unlockedPatternIds: [], unlockedGlazeIds: [] }
  const order = [12, 3, 7, 1, 10, 6, 4, 11, 2, 9, 8, 5]
  for (const number of order) {
    const id = `level-${String(number).padStart(3, '0')}`
    let state
    assert.doesNotThrow(() => { state = service.completeChallenge(id) })
    completed.push(number)
    const [key, reward] = expectedRewards[number - 1]
    unlocked[key].push(reward)
    assert.equal(state.completedCount, completed.length)
    assert.deepEqual(store.get('challengeProgress').completedLevelIds,
      completed.slice().sort((a, b) => a - b).map(value => `level-${String(value).padStart(3, '0')}`))
    for (const storageKey of Object.keys(unlocked)) assert.deepEqual(store.get(storageKey) || [], unlocked[storageKey])
    state.badges.forEach((badge, chapter) => {
      const finished = completed.filter(value => Math.floor((value - 1) / 4) === chapter).length
      assert.equal(badge.finishedLevels, finished)
      assert.equal(badge.unlocked, finished === 4)
    })
  }
  const beforeReplay = writes.length
  for (const number of order.slice().reverse()) service.completeChallenge(`level-${String(number).padStart(3, '0')}`)
  assert.equal(writes.length, beforeReplay)
})

test('invalid level IDs are rejected without changing progress or rewards', t => {
  const { writes } = environment(t), service = rewards()
  for (const id of ['level-000', 'level-013', 'missing', '', undefined, null, 3, {}]) {
    assert.throws(() => service.completeChallenge(id), /无效关卡/)
  }
  assert.deepEqual(writes, [])
})
test('read failure or malformed reward data never overwrites storage', t => {
  const { store, writes } = environment(t), service = rewards()
  store.set('unlockedShapeIds', { note: '保留' })
  assert.throws(() => service.completeChallenge('level-001'), /素材记录/)
  assert.deepEqual(writes, [])
  global.wx.getStorageSync = () => { throw new Error('read failed') }
  assert.throws(() => service.completeChallenge('level-001'), /read failed/)
  assert.deepEqual(writes, [])
})
test('failed reward write can be retried after an actual win without another completion', t => {
  const { store } = environment(t), service = rewards(), write = global.wx.setStorageSync
  global.wx.setStorageSync = (key, value) => { if (key === 'unlockedShapeIds') throw new Error('full'); write(key, value) }
  assert.throws(() => service.completeChallenge('level-001'), /full/)
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-001'])
  global.wx.setStorageSync = write
  assert.equal(service.completeChallenge('level-001').completedCount, 1)
  assert.deepEqual(store.get('unlockedShapeIds'), ['bowl'])
})
test('games are registered in a separate subpackage', () => {
  const app = require('../app.json')
  const pack = (app.subPackages || []).find(pack => pack.root === 'games')
  assert.ok(pack)
  assert.ok(pack.pages.includes('play/index'))
})
