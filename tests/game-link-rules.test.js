const assert = require('node:assert/strict')
const test = require('node:test')
const levels = require('../games/data/levels')
const { createLinkGame, getLinkHint, findLinkPath, connectLinkTiles } = require('../games/lib/link-pairs')

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function assertLegalPath(state, hint, route) {
  assert.equal(state.board[hint[0]], state.board[hint[1]])
  assert.equal(typeof state.board[hint[0]], 'string')
  assert.ok(route.length >= 2 && route.length <= 4, 'a connection uses at most three straight segments')
  assert.deepEqual(route[0], { row: Math.floor(hint[0] / state.cols), col: hint[0] % state.cols })
  assert.deepEqual(route.at(-1), { row: Math.floor(hint[1] / state.cols), col: hint[1] % state.cols })
  for (let segment = 1; segment < route.length; segment += 1) {
    const start = route[segment - 1], end = route[segment]
    assert.notDeepEqual(start, end)
    assert.ok(start.row === end.row || start.col === end.col, 'segments run horizontally or vertically')
    const rowStep = Math.sign(end.row - start.row), colStep = Math.sign(end.col - start.col)
    for (let row = start.row, col = start.col; ; row += rowStep, col += colStep) {
      assert.ok(row >= -1 && row <= state.rows && col >= -1 && col <= state.cols, 'path stays within the one-cell perimeter')
      const index = row * state.cols + col
      if (row >= 0 && row < state.rows && col >= 0 && col < state.cols && !hint.includes(index)) {
        assert.equal(state.board[index], null, 'intermediate board cells must be empty')
      }
      if (row === end.row && col === end.col) break
    }
  }
}

for (const id of ['level-002', 'level-009']) {
  test(`${id} clears all eighteen real-config pairs with legal routes for seeded and constant random sources`, () => {
    const config = levels[id]
    const originalConfig = structuredClone(config)
    assert.deepEqual([config.rows, config.cols, config.total, config.symbols.length], [6, 6, 18, 9])
    const randomSources = [
      ...[1, 3, 13, 42, 2026].map(seed => ({ name: `seed ${seed}`, rng: seeded(seed) })),
      ...[0, 0.5, 1, NaN, Infinity, -Infinity].map(value => ({ name: `constant ${value}`, rng: () => value }))
    ]
    for (const { name, rng } of randomSources) {
      let state = createLinkGame(config, rng)
      assert.equal(state.board.length, 36, name)
      for (const symbol of config.symbols) assert.equal(state.board.filter(value => value === symbol).length, 4, name)
      for (let pairsLeft = 18; pairsLeft > 0; pairsLeft -= 1) {
        const before = structuredClone(state)
        const hint = getLinkHint(state)
        assert.equal(hint.length, 2, `${name} has a legal pair with ${pairsLeft} pairs remaining`)
        const route = findLinkPath(state.board, state.rows, state.cols, hint[0], hint[1])
        assertLegalPath(state, hint, route)
        assert.deepEqual(state, before, 'hint and path lookup preserve the state')
        const next = connectLinkTiles(state, hint[0], hint[1], rng)
        assert.equal(next.valid, true, name)
        assert.equal(next.pairsLeft, pairsLeft - 1, name)
        assert.equal(next.status, pairsLeft === 1 ? 'won' : 'playing', name)
        assert.deepEqual(next.path, route)
        assert.equal(next.board[hint[0]], null)
        assert.equal(next.board[hint[1]], null)
        before.board.forEach((value, index) => {
          if (value === null) assert.equal(next.board[index], null, 'reshuffles keep previously cleared cells empty')
        })
        const expected = before.board.slice()
        expected[hint[0]] = null
        expected[hint[1]] = null
        assert.deepEqual(next.board.filter(Boolean).sort(), expected.filter(Boolean).sort(), 'reshuffles preserve remaining motifs')
        assert.equal(next.board.filter(Boolean).length, (pairsLeft - 1) * 2)
        assert.deepEqual(state, before, 'connection preserves the prior state')
        state = next
      }
      assert.deepEqual(state.board, Array(36).fill(null), name)
      assert.deepEqual(getLinkHint(state), [], name)
    }
    assert.deepEqual(config, originalConfig, 'round creation and all moves preserve the level config')
  })
}
