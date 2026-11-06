const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const enginePath = path.join(__dirname, '../games/lib/link-pairs.js')
const engine = fs.existsSync(enginePath) ? require(enginePath) : {}
const { createLinkGame, connectLinkTiles, findLinkPath, getLinkHint } = engine

function gameWith(board, overrides = {}) {
  return {
    board,
    rows: 3,
    cols: 4,
    pairsLeft: board.filter(value => value !== null).length / 2,
    status: 'playing',
    valid: false,
    path: [],
    reshuffled: false,
    ...overrides
  }
}

test('creates a 3 by 4 game with exactly one pair of each symbol', () => {
  assert.equal(typeof createLinkGame, 'function')
  const state = createLinkGame(() => 0)

  assert.deepEqual(Object.keys(state).sort(), [
    'board', 'cols', 'pairsLeft', 'path', 'reshuffled', 'rows', 'status', 'valid'
  ])
  assert.equal(state.rows, 3)
  assert.equal(state.cols, 4)
  assert.equal(state.board.length, 12)
  assert.deepEqual(state.board.slice().sort(), [
    'bird', 'bird', 'cloud', 'cloud', 'flower', 'flower',
    'leaf', 'leaf', 'lotus', 'lotus', 'wave', 'wave'
  ])
  assert.equal(state.pairsLeft, 6)
  assert.equal(state.status, 'playing')
  assert.equal(state.valid, false)
  assert.deepEqual(state.path, [])
  assert.equal(state.reshuffled, false)
})

test('finds a straight path through empty cells', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = Object.freeze([
    'lotus', null, null, 'lotus',
    'cloud', 'leaf', 'wave', 'flower',
    'bird', 'cloud', 'leaf', 'wave'
  ])
  assert.deepEqual(findLinkPath(board, 3, 4, 0, 3), [
    { row: 0, col: 0 }, { row: 0, col: 3 }
  ])
})

test('finds a path with one turn', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = [
    'lotus', null, 'cloud', 'leaf',
    'wave', 'lotus', 'flower', 'bird',
    'cloud', 'leaf', 'wave', 'flower'
  ]
  assert.deepEqual(findLinkPath(board, 3, 4, 0, 5), [
    { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }
  ])
})

test('finds an interior path with two turns', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = [
    null, null, null, null,
    'lotus', 'cloud', 'leaf', 'lotus',
    'wave', 'flower', 'bird', 'cloud'
  ]
  assert.deepEqual(findLinkPath(board, 3, 4, 4, 7), [
    { row: 1, col: 0 }, { row: 0, col: 0 },
    { row: 0, col: 3 }, { row: 1, col: 3 }
  ])
})

test('allows a two-turn route on the one-cell outside perimeter', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = [
    'lotus', 'cloud', 'leaf', 'lotus',
    'wave', 'flower', 'bird', 'cloud',
    'leaf', 'wave', 'flower', 'bird'
  ]
  assert.deepEqual(findLinkPath(board, 3, 4, 0, 3), [
    { row: 0, col: 0 }, { row: -1, col: 0 },
    { row: -1, col: 3 }, { row: 0, col: 3 }
  ])
})

test('rejects a route that needs three turns', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = [
    'cloud', null, null, null,
    'leaf', 'lotus', 'wave', null,
    'flower', 'bird', 'lotus', null
  ]
  assert.deepEqual(findLinkPath(board, 3, 4, 5, 10), [])
})

test('rejects blocked paths and unequal or empty tiles', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = [
    'cloud', 'leaf', 'wave', 'flower',
    'bird', 'lotus', 'cloud', 'leaf',
    'wave', 'flower', null, 'lotus'
  ]
  assert.deepEqual(findLinkPath(board, 3, 4, 5, 11), [])
  assert.deepEqual(findLinkPath(board, 3, 4, 0, 1), [])
  assert.deepEqual(findLinkPath(board, 3, 4, 10, 11), [])
})

test('rejects invalid indexes and board dimensions', () => {
  assert.equal(typeof findLinkPath, 'function')
  const board = Array(12).fill('lotus')
  for (const index of [-1, 12, 0.5, NaN, undefined, '1']) {
    assert.deepEqual(findLinkPath(board, 3, 4, 0, index), [])
  }
  assert.deepEqual(findLinkPath(board, 3, 4, 0, 0), [])
  assert.deepEqual(findLinkPath(board, 0, 4, 0, 1), [])
  assert.deepEqual(findLinkPath(board, 3, 3, 0, 1), [])
  assert.deepEqual(findLinkPath(null, 3, 4, 0, 1), [])
})

test('returns the indexes of a legal hint without changing the game', () => {
  assert.equal(typeof getLinkHint, 'function')
  const state = Object.freeze(gameWith(Object.freeze([
    'lotus', 'lotus', 'cloud', 'cloud',
    'leaf', 'leaf', 'wave', 'wave',
    'flower', 'flower', 'bird', 'bird'
  ])))
  assert.deepEqual(getLinkHint(state), [0, 1])
  assert.deepEqual(getLinkHint(gameWith(Array(12).fill(null), { pairsLeft: 0, status: 'won' })), [])
})

test('a valid connection removes exactly two tiles from a new board', () => {
  assert.equal(typeof connectLinkTiles, 'function')
  const state = Object.freeze(gameWith(Object.freeze([
    'lotus', 'lotus', 'cloud', 'cloud',
    'leaf', 'leaf', 'wave', 'wave',
    'flower', 'flower', 'bird', 'bird'
  ])))
  const result = connectLinkTiles(state, 0, 1)

  assert.notEqual(result, state)
  assert.notEqual(result.board, state.board)
  assert.deepEqual(result.board, [null, null, ...state.board.slice(2)])
  assert.equal(result.pairsLeft, 5)
  assert.equal(result.valid, true)
  assert.equal(result.status, 'playing')
  assert.equal(result.reshuffled, false)
  assert.deepEqual(result.path, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
})

test('invalid connections preserve board and score while clearing move feedback', () => {
  assert.equal(typeof connectLinkTiles, 'function')
  const state = gameWith([
    'cloud', 'leaf', 'wave', 'flower',
    'bird', 'lotus', 'cloud', 'leaf',
    'wave', 'flower', null, 'lotus'
  ], { valid: true, path: [{ row: 0, col: 0 }], reshuffled: true })
  const snapshot = JSON.stringify(state)
  for (const [a, b] of [[5, 11], [0, 1], [10, 11], [0, 0], [-1, 0], [0, 12], [0, 1.5], [0, '1'], [NaN, 0]]) {
    const result = connectLinkTiles(state, a, b)
    assert.equal(result.valid, false)
    assert.equal(result.reshuffled, false)
    assert.deepEqual(result.path, [])
    assert.deepEqual(result.board, state.board)
    assert.equal(result.pairsLeft, state.pairsLeft)
    assert.equal(JSON.stringify(state), snapshot)
  }
})

test('clearing the final pair wins and terminal actions cannot change the game', () => {
  assert.equal(typeof connectLinkTiles, 'function')
  const initial = gameWith(['lotus', 'lotus', ...Array(10).fill(null)])
  const result = connectLinkTiles(initial, 0, 1)

  assert.equal(result.valid, true)
  assert.equal(result.pairsLeft, 0)
  assert.equal(result.status, 'won')
  assert.deepEqual(result.board, Array(12).fill(null))
  const terminal = connectLinkTiles(result, 0, 1)
  assert.equal(terminal.valid, false)
  assert.equal(terminal.status, 'won')
  assert.equal(terminal.pairsLeft, 0)
  assert.deepEqual(terminal.board, result.board)
  assert.deepEqual(terminal.path, [])
})

test('following hints can clear all six pairs without mutating prior states', () => {
  assert.equal(typeof getLinkHint, 'function')
  assert.equal(typeof connectLinkTiles, 'function')
  let state = createLinkGame(() => 0)
  for (let pairsLeft = 6; pairsLeft > 0; pairsLeft -= 1) {
    const previous = JSON.stringify(state)
    const hint = getLinkHint(state)
    assert.equal(hint.length, 2)
    const result = connectLinkTiles(state, hint[0], hint[1], () => 0)
    assert.equal(result.valid, true)
    assert.equal(result.pairsLeft, pairsLeft - 1)
    assert.equal(JSON.stringify(state), previous)
    state = result
  }
  assert.equal(state.status, 'won')
  assert.deepEqual(getLinkHint(state), [])
})

test('returns no hint when all remaining equal pairs are blocked', () => {
  const state = gameWith([
    'cloud', 'leaf', 'flower', 'bird',
    'leaf', 'wave', 'bird', 'lotus',
    'wave', 'lotus', 'cloud', 'flower'
  ])
  assert.deepEqual(getLinkHint(state), [])
})

test('a dead end after a successful move reshuffles only occupied tiles and preserves counts', () => {
  const board = [
    'flower', 'bird', 'cloud', 'lotus',
    'wave', 'flower', 'bird', 'wave',
    'lotus', 'cloud', 'leaf', 'leaf'
  ]
  const state = Object.freeze(gameWith(Object.freeze(board)))
  const remaining = board.slice(0, 10).sort()
  for (const constant of [0, 1, NaN]) {
    let calls = 0
    const result = connectLinkTiles(state, 10, 11, () => { calls += 1; return constant })
    assert.equal(result.valid, true)
    assert.equal(result.reshuffled, true)
    assert.equal(result.status, 'playing')
    assert.equal(result.pairsLeft, 5)
    assert.equal(result.board[10], null)
    assert.equal(result.board[11], null)
    assert.deepEqual(result.board.filter(value => value !== null).sort(), remaining)
    assert.equal(getLinkHint(result).length, 2)
    assert.ok(calls <= 256, `random source was called ${calls} times`)
    assert.deepEqual(state.board, board)
  }
})

test('a shuffled initial dead end is repaired before play begins', () => {
  const target = [
    'cloud', 'leaf', 'flower', 'bird',
    'leaf', 'wave', 'bird', 'lotus',
    'wave', 'lotus', 'cloud', 'flower'
  ]
  const working = ['lotus', 'lotus', 'cloud', 'cloud', 'leaf', 'leaf', 'wave', 'wave', 'flower', 'flower', 'bird', 'bird']
  const choices = []
  for (let index = 11; index > 0; index -= 1) {
    const other = working.indexOf(target[index])
    choices.push((other + 0.25) / (index + 1))
    ;[working[index], working[other]] = [working[other], working[index]]
  }
  assert.deepEqual(working, target)
  const state = createLinkGame(() => choices.length ? choices.shift() : 1)
  assert.equal(getLinkHint(state).length, 2)
  assert.equal(state.reshuffled, false)
  assert.deepEqual(state.board.slice().sort(), target.slice().sort())
})

test('constant zero, one, and non-finite random values cannot prevent a game from finishing', () => {
  for (const constant of [0, 1, NaN, Infinity, -Infinity]) {
    const rng = () => constant
    let state = createLinkGame(rng)
    for (let move = 0; move < 6; move += 1) {
      const hint = getLinkHint(state)
      assert.equal(hint.length, 2)
      state = connectLinkTiles(state, hint[0], hint[1], rng)
      assert.equal(state.valid, true)
    }
    assert.equal(state.status, 'won')
    assert.equal(state.pairsLeft, 0)
  }
})
