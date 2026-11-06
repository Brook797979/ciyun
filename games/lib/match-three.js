const ROWS = 6
const COLS = 6
const SYMBOLS = ['lotus', 'cloud', 'leaf', 'wave', 'flower']

function randomIndex(length, rng) {
  const value = rng()
  return Number.isFinite(value) ? Math.max(0, Math.min(length - 1, Math.floor(value * length))) : 0
}

function findMatches(board, rows = ROWS, cols = COLS) {
  const found = new Set()
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols;) {
      const start = col
      const symbol = board[row * cols + col]
      while (col < cols && board[row * cols + col] === symbol) col += 1
      if (symbol && col - start >= 3) {
        for (let match = start; match < col; match += 1) found.add(row * cols + match)
      }
    }
  }
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows;) {
      const start = row
      const symbol = board[row * cols + col]
      while (row < rows && board[row * cols + col] === symbol) row += 1
      if (symbol && row - start >= 3) {
        for (let match = start; match < row; match += 1) found.add(match * cols + col)
      }
    }
  }
  return Array.from(found).sort((left, right) => left - right)
}

function exchange(board, from, to) {
  const symbol = board[from]
  board[from] = board[to]
  board[to] = symbol
}

function findHint(board, rows = ROWS, cols = COLS) {
  const swapped = board.slice()
  for (let from = 0; from < rows * cols; from += 1) {
    const neighbours = []
    if (from % cols < cols - 1) neighbours.push(from + 1)
    if (from < (rows - 1) * cols) neighbours.push(from + cols)
    for (const to of neighbours) {
      exchange(swapped, from, to)
      const matches = findMatches(swapped, rows, cols)
      exchange(swapped, from, to)
      if (matches.length) return [from, to]
    }
  }
  return []
}

function getMatchHint(state) {
  if (state.status !== 'playing' || state.movesLeft <= 0) return []
  return findHint(state.board, state.rows, state.cols)
}

function buildStableBoard({ rows, cols, symbols }, rng) {
  const board = []
  for (let index = 0; index < rows * cols; index += 1) {
    const choices = symbols.filter(symbol => {
      const horizontal = index % cols >= 2 && board[index - 1] === symbol && board[index - 2] === symbol
      const vertical = index >= cols * 2 && board[index - cols] === symbol && board[index - cols * 2] === symbol
      return !horizontal && !vertical
    })
    if (!choices.length) return null
    board.push(choices[randomIndex(choices.length, rng)])
  }
  return board
}

function fallbackBoard({ rows, cols, symbols }) {
  const board = Array.from({ length: rows * cols }, (_, index) => (
    symbols[(Math.floor(index / cols) + index % cols) % symbols.length]
  ))
  board[2] = symbols[0]
  board[cols + 1] = symbols[0]
  return board
}

function playableBoard(config, rng) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const board = buildStableBoard(config, rng)
    if (board && findHint(board, config.rows, config.cols).length) return board
  }
  return fallbackBoard(config)
}

function reshuffleBoard(board, config, rng) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const shuffled = board.slice()
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      exchange(shuffled, index, randomIndex(index + 1, rng))
    }
    if (!findMatches(shuffled, config.rows, config.cols).length && findHint(shuffled, config.rows, config.cols).length) return shuffled
  }
  return playableBoard(config, rng)
}

function createMatchGame(options = {}, rng = Math.random) {
  if (typeof options === 'function') { rng = options; options = {} }
  options = options || {}
  const rows = Number.isInteger(options.rows) && options.rows >= 3 ? options.rows : ROWS
  const cols = Number.isInteger(options.cols) && options.cols >= 3 ? options.cols : COLS
  const configuredSymbols = Array.isArray(options.symbols) ? Array.from(new Set(options.symbols.filter(symbol => typeof symbol === 'string' && symbol))) : []
  const symbols = configuredSymbols.length >= 2 ? configuredSymbols : SYMBOLS.slice()
  const targets = options.targets && typeof options.targets === 'object' && !Array.isArray(options.targets) && Object.keys(options.targets).length
    ? { ...options.targets } : null
  const target = Number.isInteger(options.target) && options.target > 0 ? options.target
    : targets ? Object.keys(targets).reduce((total, symbol) => total + targets[symbol], 0) : 18
  const counts = {}
  symbols.forEach(symbol => { counts[symbol] = 0 })
  return {
    board: playableBoard({ rows, cols, symbols }, rng), rows, cols, symbols, targets, counts,
    movesLeft: Number.isInteger(options.moves) && options.moves > 0 ? options.moves : 24,
    collected: 0, target, status: 'playing',
    valid: false, removed: [], reshuffled: false
  }
}

function refillBoard(board, matches, { rows, cols, symbols }, rng) {
  for (const index of matches) board[index] = null
  for (let col = 0; col < cols; col += 1) {
    let writeRow = rows - 1
    for (let row = rows - 1; row >= 0; row -= 1) {
      const symbol = board[row * cols + col]
      if (symbol) {
        board[writeRow * cols + col] = symbol
        writeRow -= 1
      }
    }
    while (writeRow >= 0) {
      board[writeRow * cols + col] = symbols[randomIndex(symbols.length, rng)]
      writeRow -= 1
    }
  }
}

function adjacent(from, to, rows, cols) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from < 0 || to < 0 || from >= rows * cols || to >= rows * cols) return false
  const rowDistance = Math.abs(Math.floor(from / cols) - Math.floor(to / cols))
  const colDistance = Math.abs(from % cols - to % cols)
  return rowDistance + colDistance === 1
}

function swapMatchTiles(state, from, to, rng = Math.random) {
  const next = { ...state, board: state.board.slice(), valid: false, removed: [], reshuffled: false }
  if (state.counts) next.counts = { ...state.counts }
  const config = { rows: state.rows, cols: state.cols, symbols: state.symbols || SYMBOLS }
  if (state.status !== 'playing' || state.movesLeft <= 0 || !adjacent(from, to, config.rows, config.cols)) return next

  exchange(next.board, from, to)
  let matches = findMatches(next.board, config.rows, config.cols)
  if (!matches.length) {
    exchange(next.board, from, to)
    return next
  }

  next.valid = true
  next.removed = matches.slice()
  next.movesLeft -= 1
  if (!next.counts) next.counts = {}
  config.symbols.forEach(symbol => { if (!Number.isFinite(next.counts[symbol])) next.counts[symbol] = 0 })
  for (let cascade = 0; matches.length && cascade < 32; cascade += 1) {
    matches.forEach(index => { next.counts[next.board[index]] = (next.counts[next.board[index]] || 0) + 1 })
    next.collected += matches.length
    refillBoard(next.board, matches, config, rng)
    matches = findMatches(next.board, config.rows, config.cols)
  }
  // A constant random source can otherwise refill the same match forever.
  if (matches.length) {
    next.board = playableBoard(config, rng)
    next.reshuffled = true
  }

  const achieved = next.targets ? Object.keys(next.targets).every(symbol => (next.counts[symbol] || 0) >= next.targets[symbol])
    : next.collected >= next.target
  next.status = achieved ? 'won' : next.movesLeft === 0 ? 'lost' : 'playing'
  if (next.status === 'playing' && !findHint(next.board, config.rows, config.cols).length) {
    next.board = reshuffleBoard(next.board, config, rng)
    next.reshuffled = true
  }
  return next
}

module.exports = { createMatchGame, swapMatchTiles, getMatchHint, findMatches }
