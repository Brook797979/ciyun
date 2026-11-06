const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const enginePath = path.resolve(__dirname, '../games/lib/match-three.js')
const symbols = ['lotus', 'cloud', 'leaf', 'wave', 'flower']

function engine() {
  assert.ok(fs.existsSync(enginePath), 'the match-three engine must exist')
  return require(enginePath)
}

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function latinBoard() {
  return Array.from({ length: 36 }, (_, index) => symbols[(Math.floor(index / 6) + index % 6) % 5])
}

function fixture(overrides = {}) {
  const board = latinBoard()
  board[2] = 'lotus'
  board[7] = 'lotus'
  return {
    board, rows: 6, cols: 6, movesLeft: 24, collected: 0, target: 18,
    status: 'playing', valid: false, removed: [], reshuffled: false,
    ...overrides
  }
}

function refillSequence() {
  const values = [0.4, 0.4, 0.4, 0.2, 0.4, 0.6]
  return () => values.length ? values.shift() : 0.8
}

test('findMatches returns unique horizontal and vertical match indices without changing the board', () => {
  const { findMatches } = engine()
  const board = latinBoard()
  for (const index of [7, 12, 13, 14, 19]) board[index] = 'flower'
  const before = board.slice()
  assert.deepEqual(findMatches(board), [7, 12, 13, 14, 19])
  assert.deepEqual(board, before)
  assert.deepEqual(findMatches(latinBoard()), [])
  const long = latinBoard()
  for (const index of [0, 1, 2, 3]) long[index] = 'leaf'
  assert.deepEqual(findMatches(long), [0, 1, 2, 3])
})

test('new games have the basic first chapter state and a stable playable board', () => {
  const { createMatchGame, findMatches, getMatchHint } = engine()
  for (let seed = 1; seed <= 30; seed += 1) {
    const state = createMatchGame(seeded(seed))
    assert.deepEqual({ ...state, board: [] }, {
      board: [], rows: 6, cols: 6, movesLeft: 24, collected: 0, target: 18, symbols,
      targets: null, counts: { lotus: 0, cloud: 0, leaf: 0, wave: 0, flower: 0 },
      status: 'playing', valid: false, removed: [], reshuffled: false
    })
    assert.equal(state.board.length, 36)
    assert.deepEqual(new Set(state.board), new Set(symbols))
    assert.deepEqual(findMatches(state.board), [])
    assert.equal(getMatchHint(state).length, 2)
  }
})

test('invalid indices, row wrapping and nonmatching swaps are immutable and cost no moves', () => {
  const { swapMatchTiles } = engine()
  const state = fixture({ valid: true, removed: [4], reshuffled: true })
  const before = structuredClone(state)
  for (const [from, to] of [[-1, 0], [35, 36], [0, 0], [0, 2], [5, 6], [1.5, 2], ['1', 7], [0, 6]]) {
    const next = swapMatchTiles(state, from, to, seeded(5))
    assert.notEqual(next, state)
    assert.notEqual(next.board, state.board)
    assert.deepEqual(next, { ...before, valid: false, removed: [], reshuffled: false })
    assert.deepEqual(state, before)
  }
})

test('valid swaps deduct one move and collect every tile across cascades', () => {
  const { swapMatchTiles, findMatches, getMatchHint } = engine()
  const state = fixture()
  const before = structuredClone(state)
  const next = swapMatchTiles(state, 1, 7, refillSequence())
  assert.equal(next.valid, true)
  assert.equal(next.movesLeft, 23)
  assert.equal(next.collected, 6)
  assert.deepEqual(next.removed, [0, 1, 2])
  assert.deepEqual(next.board.slice(0, 3), ['cloud', 'leaf', 'wave'])
  assert.equal(next.status, 'playing')
  assert.equal(next.reshuffled, false)
  assert.deepEqual(findMatches(next.board), [])
  assert.equal(getMatchHint(next).length, 2)
  assert.deepEqual(state, before)
})

test('completion wins even on the final move and otherwise the final move loses', () => {
  const { swapMatchTiles } = engine()
  const won = swapMatchTiles(fixture({ movesLeft: 1, collected: 15 }), 1, 7, refillSequence())
  assert.equal(won.status, 'won')
  assert.equal(won.movesLeft, 0)
  assert.equal(won.collected, 21)
  const lost = swapMatchTiles(fixture({ movesLeft: 1, target: 100 }), 1, 7, refillSequence())
  assert.equal(lost.status, 'lost')
  assert.equal(lost.movesLeft, 0)
  assert.equal(lost.collected, 6)
})

test('hint search is immutable and terminal games accept neither hints nor moves', () => {
  const { getMatchHint, swapMatchTiles, findMatches } = engine()
  const state = fixture()
  const before = structuredClone(state)
  const hint = getMatchHint(state)
  assert.equal(hint.length, 2)
  const swapped = state.board.slice()
  ;[swapped[hint[0]], swapped[hint[1]]] = [swapped[hint[1]], swapped[hint[0]]]
  assert.ok(findMatches(swapped).length >= 3)
  assert.deepEqual(state, before)
  assert.deepEqual(getMatchHint(fixture({ board: latinBoard() })), [])
  for (const status of ['won', 'lost']) {
    const terminal = fixture({ status })
    assert.deepEqual(getMatchHint(terminal), [])
    assert.deepEqual(swapMatchTiles(terminal, 1, 7), terminal)
  }
})

test('deadlocked results are automatically reshuffled into a stable board with a move', () => {
  const { swapMatchTiles, findMatches, getMatchHint } = engine()
  const state = fixture()
  state.board[1] = 'leaf'
  const values = [0, 0.2, 0.4]
  const next = swapMatchTiles(state, 1, 7, () => values.length ? values.shift() : 0)
  assert.equal(next.valid, true)
  assert.equal(next.collected, 3)
  assert.equal(next.reshuffled, true)
  assert.equal(next.movesLeft, 23)
  assert.deepEqual(findMatches(next.board), [])
  assert.equal(getMatchHint(next).length, 2)
})

test('seeded games and swaps are deterministic', () => {
  const { createMatchGame, getMatchHint, swapMatchTiles } = engine()
  const leftRandom = seeded(42)
  const rightRandom = seeded(42)
  let left = createMatchGame(leftRandom)
  let right = createMatchGame(rightRandom)
  for (let move = 0; move < 5 && left.status === 'playing'; move += 1) {
    assert.deepEqual(left, right)
    const hint = getMatchHint(left)
    left = swapMatchTiles(left, hint[0], hint[1], leftRandom)
    right = swapMatchTiles(right, hint[0], hint[1], rightRandom)
  }
  assert.deepEqual(left, right)
})

test('constant zero, one and NaN randomness cannot hang generation or resolution', { timeout: 2000 }, () => {
  const { createMatchGame, getMatchHint, swapMatchTiles, findMatches } = engine()
  for (const value of [0, 1, NaN]) {
    const random = () => value
    let state = createMatchGame(random)
    assert.deepEqual(findMatches(state.board), [])
    const hint = getMatchHint(state)
    assert.equal(hint.length, 2)
    state = swapMatchTiles({ ...state, target: 10000 }, hint[0], hint[1], random)
    assert.equal(state.valid, true)
    assert.equal(state.movesLeft, 23)
    assert.deepEqual(findMatches(state.board), [])
    assert.ok(state.board.every(symbol => symbols.includes(symbol)))
    assert.equal(getMatchHint(state).length, 2)
  }
})
