const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const file = path.resolve(__dirname, '../games/play/index.js')
function setup(t, id) {
  assert.ok(fs.existsSync(file), 'shared playable game page exists')
  const oldWx = global.wx, oldPage = global.Page, oldRandom = Math.random
  const store = new Map(), toasts = [], routes = []
  let definition, page, seed = 73
  t.after(() => { if (page) page.onUnload(); global.wx = oldWx; global.Page = oldPage; Math.random = oldRandom })
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  global.wx = {
    getStorageSync: key => store.has(key) ? structuredClone(store.get(key)) : '',
    setStorageSync: (key, value) => store.set(key, structuredClone(value)),
    showToast: value => toasts.push(value.title),
    switchTab: value => routes.push(value.url), redirectTo: value => routes.push(value.url),
    setNavigationBarTitle() {}, getWindowInfo: () => ({ windowWidth: 375, windowHeight: 724 })
  }
  global.Page = value => { definition = value }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = oldPage
  page = { ...definition, data: structuredClone(definition.data), setData(value, callback) { Object.assign(this.data, value); if (callback) callback() } }
  page.onLoad({ id })
  return { page, store, toasts, routes }
}
const tile = index => ({ currentTarget: { dataset: { index } } })
test('all 12 ids open their assigned actual game without recording completion', async t => {
  const modes = ['match', 'link', 'puzzle', 'shape', 'quiz', 'match', 'puzzle', 'shape', 'link', 'quiz', 'match', 'puzzle']
  for (let n = 1; n <= 12; n++) {
    await t.test(`level ${n}`, child => {
      const { page, store } = setup(child, `level-${String(n).padStart(3, '0')}`)
      assert.equal(page.data.level.order, n)
      assert.equal(page.data.mode, modes[n - 1])
      assert.equal(page._game.status, 'playing')
      page.retrySave()
      assert.equal(store.has('challengeProgress'), false)
    })
  }
})
test('unknown ids show a useful return state', t => {
  const { page, routes } = setup(t, 'unknown')
  assert.equal(page.data.mode, 'invalid')
  page.back()
  assert.deepEqual(routes, ['/pages/challenge/index'])
})
test('puzzle can be solved by real swaps and saved once; retry resets local play only', t => {
  const { page, store } = setup(t, 'level-003')
  const { getPuzzleHint } = require('../games/lib/picture-puzzles')
  let guard = 0
  while (page._game.status === 'playing' && guard++ < page.data.config.total) {
    const hint = getPuzzleHint(page._game)
    page.tapTile(tile(hint[0])); page.tapTile(tile(hint[1]))
  }
  assert.equal(page._game.status, 'won')
  assert.equal(page.data.resultOpen, true)
  assert.equal(page.data.saveError, '')
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-003'])
  assert.deepEqual(store.get('unlockedGlazeIds'), ['glaze-bean'])
  const stored = structuredClone(store.get('growthProgress'))
  page.retrySave()
  assert.deepEqual(store.get('growthProgress'), stored)
  page.restart()
  assert.equal(page._game.status, 'playing')
  assert.equal(page.data.resultOpen, false)
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-003'])
})
test('link game clears all eighteen real pairs and earns only its own reward', t => {
  const { page, store } = setup(t, 'level-002')
  const { getLinkHint } = require('../games/lib/link-pairs')
  assert.equal(page._game.pairsLeft, 18)
  for (let n = 0; n < page.data.config.total; n++) {
    const pair = getLinkHint(page._game)
    page.tapTile(tile(pair[0])); page.tapTile(tile(pair[1]))
  }
  assert.equal(page._game.status, 'won')
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-002'])
  assert.deepEqual(store.get('unlockedPatternIds'), ['pattern-scroll-lotus'])
})
test('real match swaps satisfy each requested motif before earning completion', t => {
  const { page, store } = setup(t, 'level-001')
  const { getMatchHint } = require('../games/lib/match-three')
  let guard = 0
  while (page._game.status === 'playing' && guard++ < page.data.config.moves) {
    const pair = getMatchHint(page._game)
    page.tapTile(tile(pair[0])); page.tapTile(tile(pair[1]))
  }
  assert.equal(page._game.status, 'won')
  for (const [id, target] of Object.entries(page._game.targets)) assert.ok(page._game.counts[id] >= target)
  assert.deepEqual(store.get('challengeProgress').completedLevelIds, ['level-001'])
  assert.deepEqual(store.get('unlockedShapeIds'), ['bowl'])
})
test('storage failure shows retryable save state and retry does not replay the game', t => {
  const { page, store } = setup(t, 'level-003')
  const { getPuzzleHint } = require('../games/lib/picture-puzzles')
  const write = global.wx.setStorageSync
  global.wx.setStorageSync = () => { throw new Error('full') }
  while (page._game.status === 'playing') {
    const pair = getPuzzleHint(page._game)
    page.tapTile(tile(pair[0])); page.tapTile(tile(pair[1]))
  }
  assert.ok(page.data.saveError)
  assert.equal(store.has('challengeProgress'), false)
  global.wx.setStorageSync = write
  page.retrySave()
  assert.equal(page.data.saveError, '')
  assert.deepEqual(store.get('unlockedGlazeIds'), ['glaze-bean'])
})
test('hiding cancels connection feedback and prevents tile input until shown again', t => {
  const { page, store } = setup(t, 'level-002')
  const { getLinkHint } = require('../games/lib/link-pairs')
  const pair = getLinkHint(page._game)
  page.tapTile(tile(pair[0])); page.tapTile(tile(pair[1]))
  assert.ok(page._pathTimer)
  assert.ok(page.data.linkSegments.length > 0)
  const remaining = page.data.tiles.find(item => !item.empty).index
  page.tapTile(tile(remaining))
  page.hint()
  assert.equal(page.data.hinted.length, 2)
  page.onHide()
  assert.equal(page._pathTimer, null)
  assert.deepEqual(page.data.linkSegments, [])
  assert.equal(page.data.selected, -1)
  assert.deepEqual(page.data.hinted, [])
  assert.equal(page.data.hintText, '')
  assert.ok(page.data.tiles.every(item => !item.hinted))
  const original = structuredClone(page._game)
  const nextPair = getLinkHint(page._game)
  page.tapTile(tile(nextPair[0])); page.tapTile(tile(nextPair[1]))
  assert.deepEqual(page._game, original)
  assert.equal(store.has('challengeProgress'), false)
  page.onShow()
  assert.equal(page._active, true)
  page.tapTile(tile(nextPair[0])); page.tapTile(tile(nextPair[1]))
  assert.equal(page._game.pairsLeft, original.pairsLeft - 1)
})
