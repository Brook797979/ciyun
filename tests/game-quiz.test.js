const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const quizPath = path.join(__dirname, '../games/lib/quiz.js')
const { createQuizGame, answerQuiz, nextQuizQuestion } = fs.existsSync(quizPath) ? require(quizPath) : {}
const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `question-${index + 1}`, prompt: `第${index + 1}道题`,
  options: ['甲', '乙', '丙', '丁'], answer: index % 4, explanation: '本题知识点。'
}))

function ready() {
  assert.equal(typeof createQuizGame, 'function')
  assert.equal(typeof answerQuiz, 'function')
  assert.equal(typeof nextQuizQuestion, 'function')
}

test('creates a quiz with isolated questions and an explicit four-answer pass threshold', () => {
  ready()
  const input = structuredClone(questions)
  const state = createQuizGame(input)
  assert.deepEqual(state, {
    questions, index: 0, answers: [], selected: null, correctCount: 0,
    minCorrect: 4, status: 'playing', revealed: false, valid: false
  })
  assert.notEqual(state.questions, input)
  assert.notEqual(state.questions[0], input[0])
  assert.notEqual(state.questions[0].options, input[0].options)
  input[0].options[0] = '更改输入'
  assert.equal(state.questions[0].options[0], '甲')
})

test('a correct answer records the selected option once and reveals feedback without advancing', () => {
  ready()
  const state = createQuizGame(questions)
  Object.freeze(state.answers)
  Object.freeze(state)
  const next = answerQuiz(state, 0)
  assert.equal(next.valid, true)
  assert.equal(next.index, 0)
  assert.equal(next.status, 'playing')
  assert.equal(next.selected, 0)
  assert.equal(next.revealed, true)
  assert.equal(next.correctCount, 1)
  assert.deepEqual(next.answers, [0])
  assert.deepEqual(state.answers, [])
  assert.equal(state.correctCount, 0)
})

test('a wrong answer is recorded and revealed without granting a correct answer', () => {
  ready()
  const next = answerQuiz(createQuizGame(questions), 2)
  assert.equal(next.valid, true)
  assert.equal(next.selected, 2)
  assert.equal(next.revealed, true)
  assert.equal(next.correctCount, 0)
  assert.deepEqual(next.answers, [2])
})

test('a revealed answer cannot be replaced or counted twice', () => {
  ready()
  const state = answerQuiz(createQuizGame(questions), 0)
  const before = JSON.stringify(state)
  for (const answer of [0, 1, 2, 3]) {
    const next = answerQuiz(state, answer)
    assert.equal(next.valid, false)
    assert.equal(next.selected, 0)
    assert.equal(next.correctCount, 1)
    assert.deepEqual(next.answers, [0])
    assert.equal(JSON.stringify(state), before)
  }
})

test('invalid answer indexes do not reveal or change a question', () => {
  ready()
  const state = createQuizGame(questions)
  const before = JSON.stringify(state)
  for (const index of [-1, 4, 1.5, NaN, Infinity, '0', null, undefined, {}]) {
    const next = answerQuiz(state, index)
    assert.equal(next.valid, false)
    assert.equal(next.revealed, false)
    assert.equal(next.selected, null)
    assert.deepEqual(next.answers, [])
    assert.equal(next.correctCount, 0)
    assert.equal(JSON.stringify(state), before)
  }
})

test('next requires a revealed answer and then resets only question feedback', () => {
  ready()
  const initial = createQuizGame(questions)
  assert.deepEqual(nextQuizQuestion(initial), initial)
  const answered = answerQuiz(initial, 0)
  const before = JSON.stringify(answered)
  const next = nextQuizQuestion(answered)
  assert.equal(next.valid, true)
  assert.equal(next.index, 1)
  assert.equal(next.selected, null)
  assert.equal(next.revealed, false)
  assert.equal(next.status, 'playing')
  assert.equal(next.correctCount, 1)
  assert.deepEqual(next.answers, [0])
  assert.equal(JSON.stringify(answered), before)
})

for (const correct of [3, 4, 5]) {
  test(`${correct} correct answers finish as ${correct >= 4 ? 'won' : 'lost'} only after the final next action`, () => {
    ready()
    let state = createQuizGame(questions)
    for (let index = 0; index < questions.length; index += 1) {
      state = answerQuiz(state, index < correct ? questions[index].answer : (questions[index].answer + 1) % 4)
      assert.equal(state.status, 'playing')
      assert.equal(state.revealed, true)
      state = nextQuizQuestion(state)
      assert.equal(state.valid, true)
      if (index < questions.length - 1) assert.equal(state.status, 'playing')
    }
    assert.equal(state.status, correct >= 4 ? 'won' : 'lost')
    assert.equal(state.correctCount, correct)
    assert.equal(state.answers.length, 5)
    assert.equal(state.index, 4)
    assert.equal(answerQuiz(state, 0).valid, false)
    assert.equal(nextQuizQuestion(state).valid, false)
    assert.equal(nextQuizQuestion(state).correctCount, correct)
  })
}

test('a custom pass threshold is preserved across immutable question transitions', () => {
  ready()
  let state = createQuizGame(questions.slice(0, 2), 1)
  state = nextQuizQuestion(answerQuiz(state, 0))
  state = nextQuizQuestion(answerQuiz(state, 0))
  assert.equal(state.minCorrect, 1)
  assert.equal(state.correctCount, 1)
  assert.equal(state.status, 'won')
})

test('empty or malformed input and malformed action states are safe and cannot award a win', () => {
  ready()
  for (const input of [undefined, null, {}, [], [null], [{ ...questions[0], options: [] }], [{ ...questions[0], answer: 4 }]]) {
    const state = createQuizGame(input)
    assert.equal(state.status, 'lost')
    assert.equal(state.valid, false)
    assert.deepEqual(state.answers, [])
    assert.equal(answerQuiz(state, 0).valid, false)
    assert.equal(nextQuizQuestion(state).valid, false)
  }
  for (const state of [undefined, null, {}, { status: 'playing' }, { status: 'playing', questions, index: 9 }]) {
    assert.equal(answerQuiz(state, 0).valid, false)
    assert.equal(nextQuizQuestion(state).valid, false)
  }
  assert.equal(createQuizGame(questions, NaN).minCorrect, 4)
})
