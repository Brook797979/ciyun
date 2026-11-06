const assert = require('node:assert/strict')
const test = require('node:test')
const match = require('../games/lib/match-three')
const link = require('../games/lib/link-pairs')
const pictures = require('../games/lib/picture-puzzles')
const levels = require('../games/data/levels')

const symbols = ['lotus', 'cloud', 'leaf', 'wave', 'flower']
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
function matchFixture(overrides = {}) {
  const state = match.createMatchGame(seeded(5))
  state.board = Array.from({ length: 36 }, (_, index) => symbols[(Math.floor(index / 6) + index % 6) % 5])
  state.board[2] = 'lotus'
  state.board[7] = 'lotus'
  return { ...state, ...overrides }
}
function cascadeRandom() {
  const values = [0.4, 0.4, 0.4, 0.2, 0.4, 0.6]
  return () => values.length ? values.shift() : 0.8
}

test('configured match games keep their dimensions, symbol pool, moves and independent targets', () => {
  const options = { rows: 4, cols: 5, symbols: symbols.slice(0, 3), moves: 22, targets: { lotus: 12, cloud: 12 } }
  const before = structuredClone(options)
  let state
  assert.doesNotThrow(() => { state = match.createMatchGame(options, seeded(42)) })
  assert.equal(state.board.length, 20)
  assert.equal(state.rows, 4)
  assert.equal(state.cols, 5)
  assert.equal(state.movesLeft, 22)
  assert.equal(state.target, 24)
  assert.deepEqual(state.symbols, before.symbols)
  assert.deepEqual(state.targets, before.targets)
  assert.deepEqual(state.counts, { lotus: 0, cloud: 0, leaf: 0 })
  assert.deepEqual(match.findMatches(state.board, 4, 5), [])
  assert.equal(match.getMatchHint(state).length, 2)
  options.targets.lotus = 99
  options.symbols[0] = 'bird'
  assert.deepEqual(state.targets, before.targets)
  assert.deepEqual(state.symbols, before.symbols)
})

test('match scanning and adjacency use the configured rectangular dimensions', () => {
  const board = ['lotus', 'lotus', 'lotus', 'cloud', 'cloud', 'leaf', 'wave', 'cloud', 'wave', 'leaf', 'flower', 'cloud']
  assert.deepEqual(match.findMatches(board, 3, 4), [0, 1, 2, 3, 7, 11])
  let state
  assert.doesNotThrow(() => { state = match.createMatchGame({ rows: 3, cols: 4 }, seeded(2)) })
  state.board = ['lotus', 'cloud', 'lotus', 'wave', 'cloud', 'lotus', 'wave', 'flower', 'leaf', 'wave', 'flower', 'lotus']
  assert.equal(match.swapMatchTiles(state, 3, 4, seeded(1)).valid, false)
  const next = match.swapMatchTiles(state, 1, 5, seeded(1))
  assert.equal(next.valid, true)
  assert.equal(next.board.length, 12)
  assert.deepEqual(match.findMatches(next.board, 3, 4), [])
})

test('target counts include cascades and require each requested symbol rather than total removals', () => {
  const state = matchFixture({ target: 6, targets: { lotus: 3, leaf: 4 }, movesLeft: 2 })
  const before = structuredClone(state)
  const next = match.swapMatchTiles(state, 1, 7, cascadeRandom())
  assert.equal(next.collected, 6)
  assert.deepEqual(next.counts, { lotus: 3, cloud: 0, leaf: 3, wave: 0, flower: 0 })
  assert.equal(next.status, 'playing')
  assert.deepEqual(state, before)
  assert.notEqual(next.counts, state.counts)
  const complete = match.swapMatchTiles({ ...state, counts: { ...next.counts, lotus: 0, leaf: 1 }, movesLeft: 1 }, 1, 7, cascadeRandom())
  assert.equal(complete.status, 'won')
  assert.equal(complete.counts.leaf, 4)
  const incomplete = match.swapMatchTiles({ ...state, movesLeft: 1 }, 1, 7, cascadeRandom())
  assert.equal(incomplete.status, 'lost')
})

test('configured match refills and bounded recovery retain the selected symbol pool', () => {
  for (const value of [0, 1, NaN]) {
    let state
    const rng = () => value
    assert.doesNotThrow(() => { state = match.createMatchGame({ rows: 4, cols: 5, symbols: ['bird', 'wave', 'leaf'], target: 10000 }, rng) })
    const hint = match.getMatchHint(state)
    assert.equal(hint.length, 2)
    state = match.swapMatchTiles(state, hint[0], hint[1], rng)
    assert.equal(state.valid, true)
    assert.ok(state.board.every(symbol => ['bird', 'wave', 'leaf'].includes(symbol)))
    assert.deepEqual(match.findMatches(state.board, 4, 5), [])
    assert.equal(Object.values(state.counts).reduce((sum, count) => sum + count, 0), state.collected)
    assert.equal(match.getMatchHint(state).length, 2)
  }
})

test('configured link rounds contain 10 or 18 complete pairs and can clear every pair', () => {
  for (const [rows, cols] of [[4, 5], [6, 6]]) {
    const options = { rows, cols, symbols: rows === 6 ? ['lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird', 'fish', 'bamboo', 'butterfly'] : ['lotus', 'cloud', 'bird'] }
    const before = structuredClone(options)
    let state
    assert.doesNotThrow(() => { state = link.createLinkGame(options, seeded(13)) })
    assert.equal(state.rows, rows)
    assert.equal(state.cols, cols)
    assert.equal(state.pairsLeft, rows * cols / 2)
    assert.equal(state.board.length, rows * cols)
    for (const symbol of options.symbols) assert.equal(state.board.filter(value => value === symbol).length % 2, 0)
    assert.ok(state.board.every(symbol => options.symbols.includes(symbol)))
    for (let pair = rows * cols / 2; pair > 0; pair -= 1) {
      const hint = link.getLinkHint(state)
      assert.equal(hint.length, 2)
      const old = structuredClone(state)
      const next = link.connectLinkTiles(state, hint[0], hint[1], () => 0)
      assert.equal(next.pairsLeft, pair - 1)
      assert.deepEqual(state, old)
      state = next
    }
    assert.equal(state.status, 'won')
    assert.ok(state.board.every(value => value === null))
    assert.deepEqual(options, before)
  }
})

test('all real puzzle configurations start with sixteen pieces and clear through valid hinted swaps', () => {
  for (const id of ['level-003', 'level-007', 'level-012']) {
    const config = levels[id]
    const originalConfig = structuredClone(config)
    assert.deepEqual([config.rows, config.cols, config.total], [4, 4, 16])
    for (const rng of [seeded(13), () => 0, () => 1, () => NaN]) {
      let state = pictures.createPuzzleGame(config, rng)
      const ordered = Array.from({ length: 16 }, (_, index) => index)
      assert.equal(state.tiles.length, 16)
      assert.notDeepEqual(state.tiles, ordered)
      for (let move = 0; move < 16 && state.status === 'playing'; move += 1) {
        const previous = state
        const before = structuredClone(state)
        const hint = pictures.getPuzzleHint(state)
        assert.equal(hint.length, 2)
        state = pictures.swapPuzzleTiles(state, hint[0], hint[1])
        assert.equal(state.valid, true)
        assert.deepEqual(previous, before)
      }
      assert.equal(state.status, 'won')
      assert.deepEqual(state.tiles, ordered)
    }
    assert.deepEqual(config, originalConfig)
  }
})

test('configured picture puzzles start unsolved and solve on 9, 12 and 16 pieces', () => {
  for (const [rows, cols] of [[3, 3], [4, 3], [4, 4]]) {
    for (const value of [0, 1, NaN]) {
      let state
      assert.doesNotThrow(() => { state = pictures.createPuzzleGame({ rows, cols }, () => value) })
      const ordered = Array.from({ length: rows * cols }, (_, index) => index)
      assert.equal(state.rows, rows)
      assert.equal(state.cols, cols)
      assert.deepEqual(state.tiles.slice().sort((a, b) => a - b), ordered)
      assert.notDeepEqual(state.tiles, ordered)
      for (let move = 0; move < rows * cols && state.status === 'playing'; move += 1) {
        const hint = pictures.getPuzzleHint(state)
        assert.equal(hint.length, 2)
        state = pictures.swapPuzzleTiles(state, hint[0], hint[1])
      }
      assert.equal(state.status, 'won')
      assert.deepEqual(state.tiles, ordered)
    }
  }
})

test('custom difference rounds own immutable spot definitions and require all four or five spots', () => {
  for (const total of [4, 5]) {
    const spots = Array.from({ length: total }, (_, index) => ({ id: `spot-${index}`, x: 0.1 + index * 0.18, y: 0.8, radius: 0.035, label: `细节${index + 1}` }))
    const before = structuredClone(spots)
    let state = pictures.createDifferenceGame(spots)
    assert.deepEqual(state.spots, before)
    assert.notEqual(state.spots, spots)
    assert.ok(Object.isFrozen(state.spots))
    assert.ok(state.spots.every(Object.isFrozen))
    spots[0].x = 0.99
    spots.push({ id: 'extra' })
    assert.deepEqual(state.spots, before)
    assert.equal(pictures.markDifference(state, pictures.DIFFERENCES[0]).valid, false)
    for (let index = 0; index < total; index += 1) {
      const old = structuredClone(state)
      const next = pictures.markDifference(state, before[index])
      assert.equal(next.valid, true)
      assert.equal(next.status, index === total - 1 ? 'won' : 'playing')
      assert.deepEqual(state, old)
      state = next
    }
    assert.equal(state.foundIds.length, total)
    assert.equal(pictures.markDifference(state, before[0]).valid, false)
  }
})
