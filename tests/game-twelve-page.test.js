const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const file = path.resolve(__dirname, '../games/play/index.js')
const modes = ['match', 'link', 'puzzle', 'shape', 'quiz', 'match', 'puzzle', 'shape', 'link', 'quiz', 'match', 'puzzle']
function setup(t, id) {
  const beforeWx = global.wx, beforePage = global.Page, beforeRandom = Math.random
  const store = new Map(), toasts = [], routes = [], writes = []
  let definition, page, seed = 73
  t.after(() => { if (page) page.onUnload(); global.wx = beforeWx; global.Page = beforePage; Math.random = beforeRandom })
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  global.wx = {
    getStorageSync: key => store.has(key) ? structuredClone(store.get(key)) : '',
    setStorageSync(key, value) { writes.push(key); store.set(key, structuredClone(value)) },
    showToast: value => toasts.push(value.title), setNavigationBarTitle() {},
    switchTab: value => routes.push(value.url), redirectTo: value => routes.push(value.url)
  }
  global.Page = value => { definition = value }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = beforePage
  page = { ...definition, data: structuredClone(definition.data), setData(update, callback) {
    Object.assign(this.data, structuredClone(update)); if (callback) callback()
  } }
  page.onLoad({ id })
  return { page, store, toasts, routes, writes }
}
const tile = index => ({ currentTarget: { dataset: { index } } })
function answerRound(page, correct) {
  for (let index = 0; index < 5; index += 1) {
    const question = page._game.questions[page._game.index]
    page.tapAnswer(tile(index < correct ? question.answer : (question.answer + 1) % 4))
    page.nextQuestion()
  }
}

test('all twelve levels enter the assigned actual game without inventing progress', async t => {
  for (let index = 0; index < modes.length; index += 1) await t.test('level ' + (index + 1), child => {
    const { page, store } = setup(child, 'level-' + String(index + 1).padStart(3, '0'))
    assert.equal(page.data.mode, modes[index])
    assert.equal(page._game.status, 'playing')
    page.retrySave()
    assert.equal(store.has('challengeProgress'), false)
  })
})

test('showcase page restores hints, uses mode titles and retains the reference toggle', t => {
  const { page } = setup(t, 'level-003')
  assert.equal(typeof page.hint, 'function')
  assert.deepEqual(page.data.hinted, [])
  assert.equal(page.data.hintText, '')
  assert.equal(Object.hasOwn(page.data, 'hintSpot'), false)
  const template = fs.readFileSync(path.resolve(__dirname, '../games/play/index.wxml'), 'utf8')
  assert.match(template, /bindtap="hint"/)
  assert.match(template, /class="level-title"[^>]*>\s*\{\{[^}]*config\.title/)
  assert.doesNotMatch(template, /level\.name|level-reward|difference-canvas|hint-ring/)
  page.toggleReference(); assert.equal(page.data.showReference, true)
  page.toggleReference(); assert.equal(page.data.showReference, false)
})

test('all three sixteen-piece puzzles solve by real swaps and award their original rewards', async t => {
  const { getPuzzleHint } = require('../games/lib/picture-puzzles')
  for (const [id, key, reward] of [
    ['level-003', 'unlockedGlazeIds', 'glaze-bean'],
    ['level-007', 'unlockedShapeIds', 'garlic'],
    ['level-012', 'unlockedGlazeIds', 'glaze-rouge']
  ]) await t.test(id, child => {
    const { page, store } = setup(child, id)
    assert.equal(page._game.rows, 4)
    assert.equal(page._game.cols, 4)
    assert.equal(page._game.tiles.length, 16)
    assert.equal(page.data.total, 16)
    let count = 0
    while (page._game.status === 'playing' && count++ < page.data.config.total) {
      const pair = getPuzzleHint(page._game)
      page.tapTile(tile(pair[0])); page.tapTile(tile(pair[1]))
    }
    assert.equal(page._game.status, 'won')
    assert.equal(page.data.resultOpen, true)
    assert.deepEqual(store.get('challengeProgress').completedLevelIds, [id])
    assert.deepEqual(store.get(key), [reward])
  })
})

test('quiz locks submitted answers, reveals explanation and saves only after the fifth result', t => {
  const { page, store } = setup(t, 'level-005')
  for (let index = 0; index < 5; index += 1) {
    const question = page._game.questions[page._game.index]
    page.tapAnswer(tile(question.answer))
    assert.equal(page._game.revealed, true)
    const before = structuredClone(page._game)
    page.tapAnswer(tile((question.answer + 1) % 4))
    assert.deepEqual(page._game, before)
    assert.equal(store.has('challengeProgress'), false)
    page.nextQuestion()
  }
  assert.equal(page._game.status, 'won')
  assert.deepEqual(store.get('unlockedPatternIds'), ['pattern-flower-bird'])
})

test('a quiz round below four correct cannot grant its reward and restarts cleanly', t => {
  const { page, store } = setup(t, 'level-010')
  answerRound(page, 3)
  assert.equal(page._game.status, 'lost')
  assert.equal(page.data.resultOpen, true)
  assert.equal(page.data.resultWon, false)
  page.retrySave()
  assert.equal(store.has('challengeProgress'), false)
  assert.equal(store.has('unlockedShapeIds'), false)
  page.restart()
  assert.equal(page._game.index, 0)
  assert.equal(page._game.correctCount, 0)
})

test('targeted match progress caps requested motifs instead of counting every removed tile', t => {
  const { page } = setup(t, 'level-001')
  page._game = { ...page._game, collected: 80, counts: { lotus: 20, cloud: 4, leaf: 56 } }
  page.syncGame()
  assert.equal(page.data.current, 16)
  assert.equal(page.data.total, 24)
  assert.deepEqual(page.data.targetRows.map(item => [item.id, item.current, item.target]), [['lotus', 12, 12], ['cloud', 4, 12]])
})

test('both shape rounds pass with four correct answers and retain original reward IDs', async t => {
  for (const [id, key, reward] of [['level-004', 'unlockedShapeIds', 'vase'], ['level-008', 'unlockedPatternIds', 'pattern-beast']]) {
    await t.test(id, child => {
      const { page, store } = setup(child, id)
      assert.equal(page.data.mode, 'shape')
      assert.equal(page._game.questions.length, 5)
      for (let index = 0; index < 5; index += 1) {
        const question = page._game.questions[page._game.index]
        assert.ok(Array.isArray(question.images) && question.images.length > 0)
        for (const image of question.images) {
          assert.equal(typeof image.src, 'string')
          assert.ok(image.src)
          assert.equal(typeof image.alt, 'string')
          assert.ok(image.alt.trim())
          assert.equal(image.alt.includes(question.options[question.answer]), false)
        }
        page.tapAnswer(tile(index < 4 ? question.answer : (question.answer + 1) % 4))
        assert.equal(page.data.quizRevealed, true)
        assert.equal(page.data.quizExplanation, question.explanation)
        const before = structuredClone(page._game)
        page.tapAnswer(tile((question.answer + 1) % 4))
        assert.deepEqual(page._game, before)
        assert.equal(store.has('challengeProgress'), false)
        page.nextQuestion()
      }
      assert.equal(page._game.correctCount, 4)
      assert.equal(page._game.status, 'won')
      assert.equal(page.data.resultOpen, true)
      assert.equal(page.data.resultWon, true)
      assert.deepEqual(store.get('challengeProgress').completedLevelIds, [id])
      assert.deepEqual(store.get(key), [reward])
      const before = structuredClone([...store])
      page.retrySave()
      assert.deepEqual([...store], before)
    })
  }
})

test('both shape rounds below four correct cannot grant completion or rewards', async t => {
  for (const id of ['level-004', 'level-008']) await t.test(id, child => {
    const { page, store } = setup(child, id)
    answerRound(page, 3)
    assert.equal(page._game.status, 'lost')
    assert.equal(page.data.resultOpen, true)
    assert.equal(page.data.resultWon, false)
    page.retrySave()
    assert.equal(store.has('challengeProgress'), false)
    assert.equal(store.has('unlockedShapeIds'), false)
    assert.equal(store.has('unlockedPatternIds'), false)
    page.restart()
    assert.equal(page._game.status, 'playing')
    assert.equal(page._game.index, 0)
    assert.equal(page._game.correctCount, 0)
  })
})

test('board hints highlight a legal pair without playing or awarding progress', async t => {
  const helpers = {
    match: require('../games/lib/match-three').getMatchHint,
    link: require('../games/lib/link-pairs').getLinkHint,
    puzzle: require('../games/lib/picture-puzzles').getPuzzleHint
  }
  for (const id of ['level-001', 'level-002', 'level-003', 'level-009', 'level-012']) await t.test(id, child => {
    const { page, store } = setup(child, id)
    const before = structuredClone(page._game)
    const counters = { current: page.data.current, progressPercent: page.data.progressPercent, movesLeft: page.data.movesLeft }
    const pair = helpers[page.data.mode](page._game)
    page.hint()
    assert.deepEqual(page.data.hinted, pair)
    assert.deepEqual(page.data.tiles.filter(item => item.hinted).map(item => item.index).sort((a, b) => a - b), pair.slice().sort((a, b) => a - b))
    assert.deepEqual(page._game, before)
    assert.deepEqual({ current: page.data.current, progressPercent: page.data.progressPercent, movesLeft: page.data.movesLeft }, counters)
    assert.equal(store.size, 0)
    page.hint()
    assert.deepEqual(page._game, before)
    page.tapTile(tile(pair[0]))
    assert.deepEqual(page.data.hinted, [])
    assert.ok(page.data.tiles.every(item => !item.hinted))
    page.hint()
    page.restart()
    assert.deepEqual(page.data.hinted, [])
    assert.equal(page.data.hintText, '')
  })
})

test('puzzle hints number exactly the two swap partners inside the image without moving or saving', async t => {
  const { getPuzzleHint } = require('../games/lib/picture-puzzles')
  for (const id of ['level-003', 'level-007', 'level-012']) await t.test(id, child => {
    const { page, writes } = setup(child, id)
    const before = structuredClone(page._game)
    const counters = { current: page.data.current, progressPercent: page.data.progressPercent }
    const pair = getPuzzleHint(page._game)
    assert.ok(page.data.tiles.every(item => item.hintOrder === 0))
    page.hint()
    assert.deepEqual(page.data.hinted, pair)
    assert.equal(page.data.hintText, '')
    assert.equal(page.data.tiles.filter(item => item.hintOrder > 0).length, 2)
    assert.deepEqual(pair.map(index => page.data.tiles[index].hintOrder), [1, 2])
    assert.ok(page.data.tiles.every(item => pair.includes(item.index) || item.hintOrder === 0))
    assert.deepEqual(page._game, before)
    assert.deepEqual({ current: page.data.current, progressPercent: page.data.progressPercent }, counters)
    assert.deepEqual(writes, [])
    page.syncGame()
    page.hint()
    assert.deepEqual(pair.map(index => page.data.tiles[index].hintOrder), [1, 2])
    assert.deepEqual(page._game, before)
    assert.deepEqual(writes, [])
    page.tapTile(tile(pair[0]))
    assert.ok(page.data.tiles.every(item => item.hintOrder === 0 && !item.hinted))
    assert.deepEqual(page._game, before)
    assert.deepEqual(writes, [])
  })
})

test('puzzle hint markers clear when opening the reference, hiding or restarting', async t => {
  for (const action of ['toggleReference', 'onHide', 'restart']) await t.test(action, child => {
    const { page } = setup(child, 'level-003')
    page.hint()
    assert.equal(page.data.tiles.filter(item => item.hintOrder > 0).length, 2)
    page[action]()
    assert.deepEqual(page.data.hinted, [])
    assert.equal(page.data.hintText, '')
    assert.ok(page.data.tiles.every(item => item.hintOrder === 0 && !item.hinted))
    assert.deepEqual(page.data.linkSegments, [])
  })
})

test('puzzle hint marker and swap label are rendered within each image tile', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '../games/play/index.wxml'), 'utf8')
  const puzzleTile = template.match(/<button\b[^>]*class="puzzle-tile\b[^>]*>[\s\S]*?<\/button>/)
  assert.ok(puzzleTile, 'puzzle tile button exists')
  assert.match(puzzleTile[0], /class="puzzle-fragment"/)
  assert.match(puzzleTile[0], /class="puzzle-hint-marker"/)
  assert.match(puzzleTile[0], /\{\{\s*tile\.hintOrder\s*\}\}/)
  assert.match(puzzleTile[0], /互换/)
})

function assertLinkHintPath(page, expectedPath) {
  assert.ok(expectedPath.length >= 2 && expectedPath.length <= 4, 'hint obeys the two-bend rule')
  assert.equal(page.data.linkSegments.length, expectedPath.length - 1)
  const percent = (style, property) => {
    const match = style.match(new RegExp(property + ':calc\\(([-.\\d]+)%'))
    assert.ok(match, `rendered segment has ${property}`)
    return Number(match[1])
  }
  const center = (value, count) => value < 0 ? 0 : value >= count ? 100 : (value + 0.5) / count * 100
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} matches ${expected}`)
  page.data.linkSegments.forEach((segment, index) => {
    const start = expectedPath[index], end = expectedPath[index + 1]
    assert.ok(start.row === end.row || start.col === end.col, 'hint segments are orthogonal')
    assert.equal(segment.horizontal, start.row === end.row)
    const left = center(Math.min(start.col, end.col), page._game.cols)
    const right = center(Math.max(start.col, end.col), page._game.cols)
    const top = center(Math.min(start.row, end.row), page._game.rows)
    const bottom = center(Math.max(start.row, end.row), page._game.rows)
    close(percent(segment.style, 'left'), left)
    close(percent(segment.style, 'top'), top)
    close(percent(segment.style, 'width'), right - left)
    close(percent(segment.style, 'height'), bottom - top)
  })
}

test('both link hints display the actual legal route without removing tiles or saving', async t => {
  const { getLinkHint, findLinkPath } = require('../games/lib/link-pairs')
  for (const id of ['level-002', 'level-009']) await t.test(id, child => {
    const { page, writes } = setup(child, id)
    const before = structuredClone(page._game)
    const counters = { current: page.data.current, progressPercent: page.data.progressPercent }
    const pair = getLinkHint(page._game)
    const route = findLinkPath(page._game.board, page._game.rows, page._game.cols, pair[0], pair[1])
    page.hint()
    assert.deepEqual(page.data.hinted, pair)
    assertLinkHintPath(page, route)
    assert.deepEqual(page._game, before)
    assert.deepEqual({ current: page.data.current, progressPercent: page.data.progressPercent }, counters)
    assert.deepEqual(writes, [])
    page.hint()
    assertLinkHintPath(page, route)
    assert.deepEqual(page._game, before)
    assert.deepEqual(writes, [])
    page.tapTile(tile(pair[0]))
    assert.deepEqual(page.data.linkSegments, [])
    assert.deepEqual(page.data.hinted, [])
    assert.deepEqual(page._game, before)
  })
})

test('link helper routes clear when hiding or restarting', async t => {
  for (const action of ['onHide', 'restart']) await t.test(action, child => {
    const { page, writes } = setup(child, 'level-002')
    page.hint()
    assert.ok(page.data.linkSegments.length > 0)
    page[action]()
    assert.deepEqual(page.data.linkSegments, [])
    assert.deepEqual(page.data.hinted, [])
    assert.deepEqual(writes, [])
  })
})

test('a real link match keeps its route visible for 500 ms after helper routes clear', t => {
  const { page } = setup(t, 'level-002')
  const { getLinkHint } = require('../games/lib/link-pairs')
  const scheduled = []
  t.mock.method(global, 'setTimeout', (callback, delay) => {
    const timer = { callback, delay }
    scheduled.push(timer)
    return timer
  })
  t.mock.method(global, 'clearTimeout', () => {})
  const pair = getLinkHint(page._game)
  const initialPairs = page._game.pairsLeft
  page.hint()
  page.tapTile(tile(pair[0]))
  assert.deepEqual(page.data.linkSegments, [])
  page.tapTile(tile(pair[1]))
  assert.equal(page._game.pairsLeft, initialPairs - 1)
  assert.ok(page.data.linkSegments.length > 0)
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 500)
  scheduled[0].callback()
  assert.deepEqual(page.data.linkSegments, [])
})

test('visible link rules explain matching motifs, obstacles, bends and the outside border', async t => {
  for (const id of ['level-002', 'level-009']) await t.test(id, child => {
    const { page } = setup(child, id)
    assert.ok(Array.isArray(page.data.config.connectionRules))
    const rules = page.data.config.connectionRules.join(' ')
    assert.match(rules, /相同/)
    assert.match(rules, /穿过|穿越|阻挡|遮挡|绕开|挡住/)
    assert.match(rules, /最多|不超过|至多/)
    assert.match(rules, /两|2/)
    assert.match(rules, /折|弯/)
    assert.match(rules, /外|边界|边缘/)
    const template = fs.readFileSync(path.resolve(__dirname, '../games/play/index.wxml'), 'utf8')
    assert.match(template, /class="link-rules"/)
    assert.match(template, /wx:for="\{\{\s*config\.connectionRules\s*\}\}"/)
  })
})

test('invalid link choices distinguish different motifs from a blocked two-bend route', t => {
  const { page, toasts, writes } = setup(t, 'level-002')
  const board = Array(36).fill('cloud')
  board[7] = 'lotus'
  board[28] = 'lotus'
  page._game = { ...page._game, board, rows: 6, cols: 6, pairsLeft: 18 }
  page.syncGame()
  const before = structuredClone(page._game)
  page.tapTile(tile(7)); page.tapTile(tile(8))
  const mismatch = toasts.at(-1)
  assert.match(mismatch, /相同/)
  assert.match(mismatch, /纹样|图案/)
  page.tapTile(tile(8))
  page.tapTile(tile(7)); page.tapTile(tile(28))
  const blocked = toasts.at(-1)
  assert.notEqual(blocked, mismatch)
  assert.match(blocked, /穿过|穿越|阻挡|遮挡|绕开|挡住/)
  assert.match(blocked, /最多|不超过|至多/)
  assert.match(blocked, /两|2/)
  assert.match(blocked, /折|弯/)
  assert.deepEqual(page._game, before)
  assert.deepEqual(writes, [])
})

test('quiz and shape hints show knowledge without revealing or submitting an answer', async t => {
  for (const id of ['level-004', 'level-005', 'level-008', 'level-010']) await t.test(id, child => {
    const { page, store } = setup(child, id)
    const question = page._game.questions[page._game.index]
    assert.equal(typeof question.hint, 'string')
    assert.ok(question.hint.trim())
    assert.notEqual(question.hint, question.options[question.answer])
    const before = structuredClone(page._game)
    page.hint()
    assert.equal(page.data.hintText, question.hint)
    assert.deepEqual(page.data.hinted, [])
    assert.deepEqual(page._game, before)
    assert.ok(page.data.quizOptions.every(option => !option.correct && !option.incorrect && !option.muted))
    assert.equal(store.size, 0)
    page.tapAnswer(tile(question.answer))
    assert.equal(page.data.hintText, '')
    const revealed = structuredClone(page._game)
    page.hint()
    assert.equal(page.data.hintText, '')
    assert.deepEqual(page._game, revealed)
    page.nextQuestion()
    assert.equal(page.data.hintText, '')
    page.hint()
    assert.equal(page.data.hintText, page._game.questions[1].hint)
    page.onHide()
    assert.equal(page.data.hintText, '')
    page.hint()
    assert.equal(page.data.hintText, '')
    page.onShow()
    page.hint()
    assert.ok(page.data.hintText)
    page.restart()
    assert.equal(page.data.hintText, '')
  })
})

test('hints are blocked by reference, hidden pages, result dialogs and terminal rounds', t => {
  const { page, store } = setup(t, 'level-003')
  page.toggleReference()
  const before = structuredClone(page._game)
  page.hint()
  assert.deepEqual(page.data.hinted, [])
  page.toggleReference()
  page.onHide()
  page.hint()
  assert.deepEqual(page.data.hinted, [])
  page.onShow()
  page.setData({ resultOpen: true })
  page.hint()
  assert.deepEqual(page.data.hinted, [])
  page.setData({ resultOpen: false })
  for (const status of ['won', 'lost']) {
    page._game = { ...before, status }
    page.hint()
    assert.deepEqual(page.data.hinted, [])
  }
  assert.equal(store.size, 0)
})

test('later-level real wins retry failed persistence without replaying the game', t => {
  const { page, store } = setup(t, 'level-007')
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
  assert.deepEqual(store.get('unlockedShapeIds'), ['garlic'])
})
