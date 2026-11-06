const DIFFERENCES = Object.freeze([
  Object.freeze({ id: 'mouth-band', x: 0.5, y: 0.24, radius: 0.1, label: '瓶口纹带' }),
  Object.freeze({ id: 'lotus-petal', x: 0.5, y: 0.525, radius: 0.075, label: '莲花花瓣' }),
  Object.freeze({ id: 'side-leaf', x: 0.68, y: 0.69, radius: 0.075, label: '右侧枝叶' })
])

function createPuzzleGame(options = {}, rng = Math.random) {
  if (typeof options === 'function') { rng = options; options = {} }
  options = options || {}
  const rows = Number.isInteger(options.rows) && options.rows >= 2 ? options.rows : 3
  const cols = Number.isInteger(options.cols) && options.cols >= 2 ? options.cols : 2
  const tiles = Array.from({ length: rows * cols }, (_, index) => index)
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const random = rng()
    const other = Number.isFinite(random) ? Math.max(0, Math.min(index, Math.floor(random * (index + 1)))) : 0
    const tile = tiles[index]
    tiles[index] = tiles[other]
    tiles[other] = tile
  }
  if (tiles.every((tile, index) => tile === index)) {
    tiles[0] = 1
    tiles[1] = 0
  }
  return { tiles, rows, cols, moves: 0, status: 'playing', valid: false }
}

function swapPuzzleTiles(state, a, b) {
  const next = { ...state, tiles: state.tiles.slice(), valid: false }
  if (state.status !== 'playing' || !Number.isInteger(a) || !Number.isInteger(b) ||
    a < 0 || b < 0 || a >= state.tiles.length || b >= state.tiles.length || a === b) return next

  next.tiles[a] = state.tiles[b]
  next.tiles[b] = state.tiles[a]
  next.moves += 1
  next.valid = true
  next.status = next.tiles.every((tile, index) => tile === index) ? 'won' : 'playing'
  return next
}

function getPuzzleHint(state) {
  if (state.status !== 'playing') return null
  const firstWrong = state.tiles.findIndex((tile, index) => tile !== index)
  return firstWrong < 0 ? null : [firstWrong, state.tiles.indexOf(firstWrong)]
}

function createDifferenceGame(spots = DIFFERENCES) {
  const definitions = Object.freeze(spots.map(spot => Object.freeze({ ...spot })))
  return { spots: definitions, foundIds: [], status: 'playing', valid: false, alreadyFound: false }
}

function markDifference(state, point) {
  const next = { ...state, foundIds: state.foundIds.slice(), valid: false, alreadyFound: false }
  if (state.status !== 'playing' || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return next

  const spots = state.spots || DIFFERENCES
  const spot = spots.find(({ x, y, radius }) => (
    (point.x - x) ** 2 + (point.y - y) ** 2 <= radius ** 2
  ))
  if (!spot) return next
  if (next.foundIds.includes(spot.id)) {
    next.alreadyFound = true
    return next
  }
  next.foundIds.push(spot.id)
  next.valid = true
  next.status = spots.every(({ id }) => next.foundIds.includes(id)) ? 'won' : 'playing'
  return next
}

module.exports = {
  createPuzzleGame, swapPuzzleTiles, getPuzzleHint,
  createDifferenceGame, markDifference, DIFFERENCES
}
