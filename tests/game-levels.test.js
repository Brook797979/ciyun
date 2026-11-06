const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const ids = Array.from({ length: 12 }, (_, index) => `level-${String(index + 1).padStart(3, '0')}`)

function load(relative) {
  const file = path.join(root, relative)
  assert.ok(fs.existsSync(file), `${relative} must exist`)
  return require(file)
}

test('the twelve levels use the approved five-game distribution with clear simple rules', () => {
  const levels = load('games/data/levels.js')
  assert.deepEqual(Object.keys(levels), ids)
  assert.deepEqual(ids.map(id => levels[id].mode), [
    'match', 'link', 'puzzle', 'shape', 'quiz', 'match',
    'puzzle', 'shape', 'link', 'quiz', 'match', 'puzzle'
  ])
  for (const config of Object.values(levels)) {
    for (const field of ['title', 'instruction', 'goal', 'unit', 'story', 'rules']) {
      assert.ok(typeof config[field] === 'string' && config[field].length > 0, `${config.mode} needs ${field}`)
    }
    assert.ok(Number.isInteger(config.total) && config.total > 0)
    assert.doesNotMatch(config.instruction + config.rules, /放大|计时|查看原图|倒计时/)
    for (const field of ['zoom', 'timer', 'timeLimit']) assert.equal(Object.hasOwn(config, field), false)
  }
})

test('match objectives retain their exact symbol counts, move budgets and total targets', () => {
  const levels = load('games/data/levels.js')
  assert.deepEqual(levels['level-001'].symbols, ['lotus', 'cloud', 'leaf', 'wave', 'flower'])
  assert.deepEqual(levels['level-001'].targets, { lotus: 12, cloud: 12 })
  assert.deepEqual(levels['level-006'].symbols, ['lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird'])
  assert.deepEqual(levels['level-006'].targets, { lotus: 10, flower: 10, bird: 10 })
  assert.deepEqual(levels['level-011'].symbols, levels['level-006'].symbols)
  for (const [id, moves, target] of [['level-001', 22, 24], ['level-006', 24, 30], ['level-011', 18, 60]]) {
    assert.equal(levels[id].rows, 6)
    assert.equal(levels[id].cols, 6)
    assert.equal(levels[id].moves, moves)
    assert.equal(levels[id].target, target)
    assert.equal(levels[id].total, target)
  }
  assert.equal(Object.hasOwn(levels['level-011'], 'targets'), false)
})

test('both link levels supply eighteen pairs and nine motifs on the same 6 by 6 board', () => {
  const levels = load('games/data/levels.js')
  const first = levels['level-002'], later = levels['level-009']
  assert.deepEqual([first.rows, first.cols, first.total], [6, 6, 18])
  assert.deepEqual([later.rows, later.cols, later.total], [6, 6, 18])
  assert.deepEqual(first.symbols, ['lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird', 'fish', 'bamboo', 'butterfly'])
  assert.deepEqual(later.symbols, first.symbols)
  assert.equal(first.total * 2, first.rows * first.cols)
  assert.equal(later.total * 2, later.rows * later.cols)
})

test('both link levels share four visible connection rules that explain the engine limits', () => {
  const levels = load('games/data/levels.js')
  const connectionRules = load('games/data/link-rules.js')
  assert.equal(connectionRules.length, 4)
  assert.ok(connectionRules.every(rule => typeof rule === 'string' && rule.length > 0))
  const copy = connectionRules.join('')
  for (const pattern of [/两枚相同纹样/, /横向.*纵向/, /不能.*斜线/, /最多转两次弯/, /最多三段直线/, /不能穿过其他纹样/, /空格/, /棋盘外侧一圈/, /18对/, /没有可连.*自动重排/]) {
    assert.match(copy, pattern)
  }
  for (const id of ['level-002', 'level-009']) {
    assert.equal(levels[id].connectionRules, connectionRules)
    assert.equal(levels[id].rules, copy)
  }
})

test('all three puzzle grids use sixteen tiles and keep their existing raster artwork', () => {
  const levels = load('games/data/levels.js')
  for (const [id, rows, cols, total, image] of [
    ['level-003', 4, 4, 16, 'puzzle-still-life.jpg'],
    ['level-007', 4, 4, 16, 'puzzle-workshop.jpg'],
    ['level-012', 4, 4, 16, 'puzzle-landscape.jpg']
  ]) {
    const config = levels[id]
    assert.deepEqual([config.rows, config.cols, config.total], [rows, cols, total])
    assert.match(config.instruction, /十六块/)
    assert.match(config.rules, /十六块/)
    assert.equal(config.image, `/games/assets/art/${image}`)
    assert.ok(fs.existsSync(path.join(root, config.image.slice(1))), config.image)
  }
})

test('the workshop puzzle keeps its portrait artwork height after moving to four columns', () => {
  const levels = load('games/data/levels.js')
  assert.equal(levels['level-007'].puzzleHeight, 840)
  assert.equal(Object.hasOwn(levels['level-003'], 'puzzleHeight'), false)
  assert.equal(Object.hasOwn(levels['level-012'], 'puzzleHeight'), false)
})

test('shape levels use five real vessel questions and require four correct answers without difference assets', () => {
  const levels = load('games/data/levels.js')
  const questions = load('games/data/shape-questions.js')
  for (const [id, bank] of [['level-004', 'intro'], ['level-008', 'advanced']]) {
    const config = levels[id]
    assert.equal(config.mode, 'shape')
    assert.equal(config.title, '瓷器辨形')
    assert.equal(config.questions, questions[bank])
    assert.equal(config.total, 5)
    assert.equal(config.unit, '题')
    assert.equal(config.minCorrect, 4)
    for (const key of ['spots', 'referenceImage', 'alteredImage']) assert.equal(Object.hasOwn(config, key), false)
  }
})

test('quiz banks contain five distinct four-option questions each with one answer and a useful explanation', () => {
  const banks = load('games/data/questions.js')
  assert.deepEqual(Object.keys(banks), ['intro', 'advanced'])
  const questions = [...banks.intro, ...banks.advanced]
  assert.equal(new Set(questions.map(question => question.id)).size, 10)
  for (const bank of Object.values(banks)) {
    assert.equal(bank.length, 5)
    for (const question of bank) {
      assert.ok(question.id && question.prompt)
      assert.equal(question.options.length, 4)
      assert.equal(new Set(question.options).size, 4)
      assert.ok(question.options.every(option => typeof option === 'string' && option.length > 0))
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4)
      assert.ok(typeof question.explanation === 'string' && question.explanation.length >= 12)
      assert.ok(typeof question.hint === 'string' && question.hint.length >= 8)
      assert.equal(question.hint.includes(question.options[question.answer]), false, 'a hint must not name the correct option')
      if (question.image) assert.ok(fs.existsSync(path.join(root, question.image.slice(1))))
    }
  }
  assert.equal(banks.intro.find(question => question.id === 'intro-underglaze').options[0], '釉下彩')
  assert.equal(banks.intro.find(question => question.id === 'intro-underglaze').answer, 0)
  assert.equal(banks.intro.find(question => question.id === 'intro-cobalt').options[1], '钴料')
  assert.equal(banks.intro.find(question => question.id === 'intro-cobalt').answer, 1)
  assert.equal(banks.intro.find(question => question.id === 'intro-famille-rose').options[2], '釉上彩')
  assert.equal(banks.intro.find(question => question.id === 'intro-famille-rose').answer, 2)
  const shape = banks.intro.find(question => question.id === 'intro-shape')
  assert.match(shape.prompt, /小口.*短颈.*丰肩/)
  assert.equal(shape.options[shape.answer], '梅瓶')
  const impressed = banks.advanced.find(question => question.id === 'advanced-impressed-decoration')
  assert.ok(impressed)
  assert.equal(impressed.options[impressed.answer], '印花')
  assert.match(impressed.explanation, /刻花/)
})

test('shape questions have one correct visible vessel, neutral image descriptions, and non-answer hints', () => {
  const banks = load('games/data/shape-questions.js')
  const typeForImage = {
    'meiping.jpg': '梅瓶', 'yuhuchun.jpg': '玉壶春瓶', 'garlic.jpg': '蒜头瓶',
    'double-ear.jpg': '双耳尊', 'bowl.jpg': '瓷碗'
  }
  assert.deepEqual(Object.keys(banks), ['intro', 'advanced'])
  const all = [...banks.intro, ...banks.advanced]
  assert.equal(new Set(all.map(question => question.id)).size, 10)
  for (const bank of Object.values(banks)) {
    assert.equal(bank.length, 5)
    const recognizedTypes = []
    for (const question of bank) {
      assert.ok(question.id && question.prompt)
      assert.equal(question.options.length, 4)
      assert.equal(new Set(question.options).size, 4)
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4)
      assert.ok(question.images.length === 1 || question.images.length === 2)
      if (question.images.length === 2) assert.match(question.prompt, /左侧|右侧/)
      const target = question.images[question.images.length === 2 && question.prompt.includes('右侧') ? 1 : 0]
      const type = typeForImage[path.basename(target.src)]
      assert.ok(type)
      assert.equal(question.options[question.answer], type)
      recognizedTypes.push(type)
      const visibleCopy = [question.prompt, question.caption || '', ...question.images.map(image => image.alt)].join(' ')
      assert.equal(visibleCopy.includes(type), false, 'prompt and image descriptions must not disclose the correct type')
      assert.ok(typeof question.explanation === 'string' && question.explanation.includes(type))
      assert.ok(typeof question.hint === 'string' && question.hint.length >= 8)
      assert.equal(question.hint.includes(type), false, 'silhouette hints must not name the answer')
      for (const image of question.images) {
        assert.match(image.src, /^\/games\/assets\/shapes\/[a-z-]+\.jpg$/)
        assert.match(image.alt, /^(待辨识瓷器|左侧瓷器|右侧瓷器)$/)
        assert.ok(fs.existsSync(path.join(root, image.src.slice(1))), image.src)
      }
    }
    assert.equal(new Set(recognizedTypes).size, 5)
  }
  assert.ok(banks.intro.every(question => question.images.length === 1))
  assert.ok(banks.advanced.some(question => question.images.length === 2))
})

test('the five local shape JPEGs remain under the 200 KiB asset budget and keep the JPEG originals', () => {
  const banks = load('games/data/shape-questions.js')
  const images = new Set([...banks.intro, ...banks.advanced].flatMap(question => question.images.map(image => image.src)))
  assert.equal(images.size, 5)
  let totalBytes = 0
  for (const image of images) {
    const file = path.join(root, image.slice(1))
    const data = fs.readFileSync(file)
    totalBytes += data.length
    assert.deepEqual(data.subarray(0, 3), Buffer.from([255, 216, 255]))
    const original = path.join(root, 'assets/shapes', path.basename(image))
    assert.ok(fs.existsSync(original), 'source JPEG must be retained')
  }
  assert.ok(totalBytes <= 200 * 1024, `shape JPEGs total ${totalBytes} bytes`)
})

test('both vessel-image banks use the shared five-question quiz pass and fail rules without mutation', () => {
  const banks = load('games/data/shape-questions.js')
  const { createQuizGame, answerQuiz, nextQuizQuestion } = load('games/lib/quiz.js')
  for (const bank of Object.values(banks)) {
    const before = JSON.stringify(bank)
    for (const correct of [3, 4]) {
      let state = createQuizGame(bank, 4)
      for (let index = 0; index < 5; index += 1) {
        state = answerQuiz(state, index < correct ? bank[index].answer : (bank[index].answer + 1) % 4)
        state = nextQuizQuestion(state)
      }
      assert.equal(state.status, correct === 4 ? 'won' : 'lost')
      assert.equal(state.correctCount, correct)
      assert.equal(JSON.stringify(bank), before)
    }
  }
})

test('quiz levels use the fixed question banks and require four correct answers', () => {
  const levels = load('games/data/levels.js')
  const banks = load('games/data/questions.js')
  assert.equal(levels['level-005'].questions, banks.intro)
  assert.equal(levels['level-010'].questions, banks.advanced)
  for (const id of ['level-005', 'level-010']) {
    assert.equal(levels[id].total, 5)
    assert.equal(levels[id].minCorrect, 4)
    assert.equal(levels[id].goal, '答对题数')
  }
})

test('the symbol catalog uses ten packaged PNG motifs and keeps first-four mode compatibility', () => {
  const { symbols, modes } = load('games/data/chapter-one.js')
  assert.deepEqual(symbols.map(symbol => symbol.id), [
    'lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird', 'fish', 'bamboo', 'butterfly', 'coin'
  ])
  assert.equal(new Set(symbols.map(symbol => symbol.id)).size, 10)
  for (const symbol of symbols) {
    assert.ok(symbol.name)
    assert.equal(symbol.image, `/games/assets/motifs/${symbol.id}.png`)
    const file = path.join(root, symbol.image.slice(1))
    assert.ok(fs.existsSync(file), symbol.image)
    const image = fs.readFileSync(file)
    assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  const levels = load('games/data/levels.js')
  assert.deepEqual(modes, ids.slice(0, 4).map(id => levels[id]))
})
