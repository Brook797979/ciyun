const SYMBOLS = ['lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird']

function shuffle(values, rng) {
  const shuffled = values.slice()
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = Number(rng())
    const unit = Number.isFinite(random) ? Math.max(0, Math.min(random, 1)) : 0
    const other = Math.min(index, Math.floor(unit * (index + 1)))
    const value = shuffled[index]
    shuffled[index] = shuffled[other]
    shuffled[other] = value
  }
  return shuffled
}

function createLinkGame(options = {}, rng = Math.random) {
  if (typeof options === 'function') { rng = options; options = {} }
  options = options || {}
  const validDimensions = Number.isInteger(options.rows) && options.rows > 0 &&
    Number.isInteger(options.cols) && options.cols > 0 && options.rows * options.cols % 2 === 0
  const rows = validDimensions ? options.rows : 3
  const cols = validDimensions ? options.cols : 4
  const configuredSymbols = Array.isArray(options.symbols) ? options.symbols.filter(symbol => typeof symbol === 'string' && symbol) : []
  const symbols = configuredSymbols.length ? Array.from(new Set(configuredSymbols)) : SYMBOLS
  const values = []
  for (let pair = 0; pair < rows * cols / 2; pair += 1) {
    const symbol = symbols[pair % symbols.length]
    values.push(symbol, symbol)
  }
  const state = {
    board: shuffle(values, rng),
    rows,
    cols,
    pairsLeft: rows * cols / 2,
    status: 'playing',
    valid: false,
    path: [],
    reshuffled: false
  }
  state.board = ensurePlayable(state.board, state.rows, state.cols, rng).board
  return state
}

function validBoard(board, rows, cols) {
  return Array.isArray(board) && Number.isInteger(rows) && rows > 0 &&
    Number.isInteger(cols) && cols > 0 && board.length === rows * cols
}

function validIndex(board, index) {
  return Number.isInteger(index) && index >= 0 && index < board.length
}

function compressPath(nodes, end) {
  const cells = []
  for (let index = end; index !== -1; index = nodes[index].parent) {
    cells.unshift({ row: nodes[index].row, col: nodes[index].col })
  }
  return cells.filter((point, index) => {
    if (index === 0 || index === cells.length - 1) return true
    const before = cells[index - 1]
    const after = cells[index + 1]
    return point.row - before.row !== after.row - point.row ||
      point.col - before.col !== after.col - point.col
  })
}

function routeBetween(board, rows, cols, a, b) {
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]]
  const nodes = [{ row: Math.floor(a / cols), col: a % cols, direction: -1, turns: 0, parent: -1 }]
  const seen = new Set()

  for (let head = 0; head < nodes.length; head += 1) {
    const current = nodes[head]
    for (let direction = 0; direction < directions.length; direction += 1) {
      const row = current.row + directions[direction][0]
      const col = current.col + directions[direction][1]
      const turns = current.turns + (current.direction !== -1 && current.direction !== direction ? 1 : 0)
      if (turns > 2 || row < -1 || row > rows || col < -1 || col > cols) continue
      const inside = row >= 0 && row < rows && col >= 0 && col < cols
      const index = row * cols + col
      if (inside && index !== b && board[index] !== null) continue
      const key = `${row},${col},${direction},${turns}`
      if (seen.has(key)) continue
      seen.add(key)
      nodes.push({ row, col, direction, turns, parent: head })
      if (inside && index === b) return compressPath(nodes, nodes.length - 1)
    }
  }
  return []
}

function findLinkPath(board, rows, cols, a, b) {
  if (!validBoard(board, rows, cols) || !validIndex(board, a) || !validIndex(board, b) ||
      a === b || typeof board[a] !== 'string' || board[a] !== board[b]) return []
  return routeBetween(board, rows, cols, a, b)
}

function getLinkHint(state) {
  if (!state || state.status !== 'playing' || !validBoard(state.board, state.rows, state.cols)) return []
  for (let a = 0; a < state.board.length; a += 1) {
    if (typeof state.board[a] !== 'string') continue
    for (let b = a + 1; b < state.board.length; b += 1) {
      if (state.board[a] === state.board[b] &&
          findLinkPath(state.board, state.rows, state.cols, a, b).length) return [a, b]
    }
  }
  return []
}

function ensurePlayable(board, rows, cols, rng) {
  const hintFor = candidate => getLinkHint({ board: candidate, rows, cols, status: 'playing' })
  if (hintFor(board).length) return { board, reshuffled: false }
  const occupied = []
  board.forEach((value, index) => { if (value !== null) occupied.push(index) })
  const values = occupied.map(index => board[index])
  if (values.length < 2) return { board, reshuffled: false }

  // A constant random source may repeat the same dead end, so retries are bounded.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = board.slice()
    const shuffled = shuffle(values, rng)
    occupied.forEach((index, offset) => { candidate[index] = shuffled[offset] })
    if (hintFor(candidate).length) return { board: candidate, reshuffled: true }
  }

  const symbol = values.find((value, index) => values.indexOf(value) !== index)
  if (symbol === undefined) return { board, reshuffled: false }
  for (let first = 0; first < occupied.length; first += 1) {
    for (let second = first + 1; second < occupied.length; second += 1) {
      const a = occupied[first]
      const b = occupied[second]
      if (!routeBetween(board, rows, cols, a, b).length) continue
      let removed = 0
      const remaining = values.filter(value => {
        if (value === symbol && removed < 2) { removed += 1; return false }
        return true
      })
      const candidate = board.slice()
      candidate[a] = symbol
      candidate[b] = symbol
      let offset = 0
      occupied.forEach(index => {
        if (index !== a && index !== b) candidate[index] = remaining[offset++]
      })
      return { board: candidate, reshuffled: true }
    }
  }
  return { board, reshuffled: false }
}

function connectLinkTiles(state, a, b, rng = Math.random) {
  const result = { ...state, valid: false, path: [], reshuffled: false }
  if (!state || state.status !== 'playing') return result
  const path = findLinkPath(state.board, state.rows, state.cols, a, b)
  if (!path.length) return result

  result.board = state.board.slice()
  result.board[a] = null
  result.board[b] = null
  result.pairsLeft = state.pairsLeft - 1
  result.status = result.pairsLeft === 0 ? 'won' : 'playing'
  result.valid = true
  result.path = path
  if (result.status === 'playing') {
    const recovery = ensurePlayable(result.board, result.rows, result.cols, rng)
    result.board = recovery.board
    result.reshuffled = recovery.reshuffled
  }
  return result
}

module.exports = { createLinkGame, connectLinkTiles, findLinkPath, getLinkHint }
