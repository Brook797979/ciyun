const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const enginePath = path.join(__dirname, '../games/lib/picture-puzzles.js')

function loadEngine() {
  assert.ok(fs.existsSync(enginePath), 'the picture puzzle engine must exist')
  return require(enginePath)
}

function puzzle(tiles = [1, 0, 2, 3, 4, 5], extra = {}) {
  return { tiles, rows: 3, cols: 2, moves: 0, status: 'playing', valid: false, ...extra }
}

function freezeState(state) {
  Object.values(state).forEach((value) => {
    if (Array.isArray(value)) Object.freeze(value)
  })
  return Object.freeze(state)
}

test('picture puzzle starts as an unsolved six-piece portrait with no moves', () => {
  const { createPuzzleGame } = loadEngine()
  for (const rng of [() => 0, () => 0.5, () => 0.999999]) {
    const state = createPuzzleGame(rng)
    assert.deepEqual([...state.tiles].sort(), [0, 1, 2, 3, 4, 5])
    assert.notDeepEqual(state.tiles, [0, 1, 2, 3, 4, 5])
    assert.deepEqual({ ...state, tiles: [] }, {
      tiles: [], rows: 3, cols: 2, moves: 0, status: 'playing', valid: false
    })
  }
  assert.equal(createPuzzleGame().tiles.length, 6)
})

test('a puzzle swap changes only the two pieces and counts one move immutably', () => {
  const { swapPuzzleTiles } = loadEngine()
  const state = freezeState(puzzle([2, 0, 1, 3, 4, 5], { moves: 2 }))
  const next = swapPuzzleTiles(state, 0, 1)
  assert.deepEqual(next.tiles, [0, 2, 1, 3, 4, 5])
  assert.equal(next.moves, 3)
  assert.equal(next.valid, true)
  assert.equal(next.status, 'playing')
  assert.notEqual(next, state)
  assert.notEqual(next.tiles, state.tiles)
  assert.deepEqual(state.tiles, [2, 0, 1, 3, 4, 5])
  assert.equal(state.moves, 2)
})

test('invalid and repeated puzzle positions leave tiles and moves unchanged', () => {
  const { swapPuzzleTiles } = loadEngine()
  const state = freezeState(puzzle(undefined, { valid: true }))
  for (const [a, b] of [[0, 0], [-1, 1], [0, 6], [0.5, 1], ['0', 1], [NaN, 1], [0, undefined]]) {
    const next = swapPuzzleTiles(state, a, b)
    assert.deepEqual(next.tiles, state.tiles)
    assert.equal(next.moves, 0)
    assert.equal(next.status, 'playing')
    assert.equal(next.valid, false)
    assert.notEqual(next, state)
  }
})

test('a solved swap wins and terminal puzzle actions are invalid', () => {
  const { swapPuzzleTiles, getPuzzleHint } = loadEngine()
  const next = swapPuzzleTiles(freezeState(puzzle()), 0, 1)
  assert.deepEqual(next.tiles, [0, 1, 2, 3, 4, 5])
  assert.equal(next.status, 'won')
  assert.equal(next.moves, 1)
  assert.equal(next.valid, true)
  assert.equal(getPuzzleHint(freezeState(next)), null)
  const terminal = swapPuzzleTiles(next, 0, 1)
  assert.deepEqual(terminal, { ...next, valid: false })
})

test('a puzzle hint restores the first misplaced tile without changing state', () => {
  const { getPuzzleHint } = loadEngine()
  const state = freezeState(puzzle([0, 4, 1, 2, 3, 5]))
  assert.deepEqual(getPuzzleHint(state), [1, 2])
  assert.deepEqual(state.tiles, [0, 4, 1, 2, 3, 5])
  assert.equal(getPuzzleHint(puzzle([0, 1, 2, 3, 4, 5])), null)
})

test('difference rounds start empty and expose exactly three labeled normalized hotspots', () => {
  const { createDifferenceGame, DIFFERENCES } = loadEngine()
  assert.deepEqual(createDifferenceGame(), {
    spots: DIFFERENCES, foundIds: [], status: 'playing', valid: false, alreadyFound: false
  })
  assert.equal(DIFFERENCES.length, 3)
  assert.equal(new Set(DIFFERENCES.map(({ id }) => id)).size, 3)
  for (const spot of DIFFERENCES) {
    assert.deepEqual(Object.keys(spot).sort(), ['id', 'label', 'radius', 'x', 'y'])
    assert.ok(spot.id && spot.label)
    assert.ok(spot.x > 0 && spot.x < 1 && spot.y > 0 && spot.y < 1)
    assert.ok(spot.radius > 0 && spot.radius < 0.2)
  }
})

test('a difference tap adds its hotspot once and leaves the previous state untouched', () => {
  const { createDifferenceGame, markDifference, DIFFERENCES } = loadEngine()
  const state = freezeState(createDifferenceGame())
  const spot = DIFFERENCES[0]
  const next = markDifference(state, { x: spot.x, y: spot.y })
  assert.deepEqual(next.foundIds, [spot.id])
  assert.equal(next.valid, true)
  assert.equal(next.alreadyFound, false)
  assert.equal(next.status, 'playing')
  assert.notEqual(next, state)
  assert.notEqual(next.foundIds, state.foundIds)
  assert.deepEqual(state.foundIds, [])
  const duplicate = markDifference(freezeState(next), spot)
  assert.deepEqual(duplicate.foundIds, [spot.id])
  assert.equal(duplicate.valid, false)
  assert.equal(duplicate.alreadyFound, true)
})

test('difference taps use circular boundaries and reject misses or invalid points', () => {
  const { createDifferenceGame, markDifference, DIFFERENCES } = loadEngine()
  const state = freezeState({ ...createDifferenceGame(), alreadyFound: true, valid: true })
  const spot = DIFFERENCES[0]
  const edge = markDifference(state, { x: spot.x + spot.radius * 0.99, y: spot.y })
  assert.deepEqual(edge.foundIds, [spot.id])
  for (const point of [
    { x: spot.x + spot.radius * 1.01, y: spot.y }, { x: 0, y: 0 },
    { x: -1, y: 0.5 }, { x: 0.5, y: 1.01 }, { x: NaN, y: spot.y },
    { x: '0.5', y: spot.y }, {}, null, undefined
  ]) {
    const next = markDifference(state, point)
    assert.deepEqual(next.foundIds, [])
    assert.equal(next.valid, false)
    assert.equal(next.alreadyFound, false)
    assert.notEqual(next, state)
  }
})

test('finding the three different details wins and finished rounds reject more taps', () => {
  const { createDifferenceGame, markDifference, DIFFERENCES } = loadEngine()
  let state = createDifferenceGame()
  for (const spot of [...DIFFERENCES].reverse()) state = markDifference(freezeState(state), spot)
  assert.equal(state.status, 'won')
  assert.equal(state.valid, true)
  assert.equal(state.foundIds.length, 3)
  const terminal = markDifference(freezeState(state), DIFFERENCES[0])
  assert.equal(terminal.status, 'won')
  assert.equal(terminal.valid, false)
  assert.equal(terminal.alreadyFound, false)
  assert.deepEqual(terminal.foundIds, state.foundIds)
})
