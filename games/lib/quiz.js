function validQuestion(question) {
  return question && Array.isArray(question.options) && question.options.length === 4 &&
    question.options.every(option => typeof option === 'string') &&
    Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4
}

function createQuizGame(questions, minCorrect = 4) {
  const usable = Array.isArray(questions) && questions.length > 0 && questions.every(validQuestion)
  return {
    questions: usable ? questions.map(question => ({ ...question, options: question.options.slice() })) : [],
    index: 0,
    answers: [],
    selected: null,
    correctCount: 0,
    minCorrect: Number.isInteger(minCorrect) && minCorrect >= 0 ? minCorrect : 4,
    status: usable ? 'playing' : 'lost',
    revealed: false,
    valid: false
  }
}

function invalid(state) {
  return state && typeof state === 'object' ? { ...state, valid: false } : createQuizGame([])
}

function active(state) {
  return state && state.status === 'playing' && Array.isArray(state.questions) &&
    Number.isInteger(state.index) && state.index >= 0 && state.index < state.questions.length &&
    validQuestion(state.questions[state.index]) && Array.isArray(state.answers) &&
    Number.isInteger(state.correctCount) && state.correctCount >= 0
}

function answerQuiz(state, index) {
  if (!active(state) || state.revealed !== false || state.answers.length !== state.index ||
      !Number.isInteger(index) || index < 0 || index >= 4) return invalid(state)
  return {
    ...state,
    answers: state.answers.concat(index),
    selected: index,
    correctCount: state.correctCount + (index === state.questions[state.index].answer ? 1 : 0),
    revealed: true,
    valid: true
  }
}

function nextQuizQuestion(state) {
  if (!active(state) || state.revealed !== true || state.answers.length !== state.index + 1) return invalid(state)
  if (state.index === state.questions.length - 1) {
    return { ...state, status: state.correctCount >= state.minCorrect ? 'won' : 'lost', valid: true }
  }
  return { ...state, index: state.index + 1, selected: null, revealed: false, valid: true }
}

module.exports = { createQuizGame, answerQuiz, nextQuizQuestion }
