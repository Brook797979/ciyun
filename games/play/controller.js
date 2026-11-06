const catalog = require('../../data/challenges')
const configs = require('../data/levels')
const { symbols } = require('../data/chapter-one')
const match = require('../lib/match-three')
const link = require('../lib/link-pairs')
const pictures = require('../lib/picture-puzzles')
const quiz = require('../lib/quiz')
const { completeChallenge } = require('../../utils/challenge-rewards')
const { getChallengeState } = require('../../utils/challenge-progress')
const settings = require('../../data/challenge-settings')
const symbolById = Object.fromEntries(symbols.map(symbol => [symbol.id, symbol]))
const chapterNames = ['溪畔识瓷', '青花作坊', '窑火成器']
const dataset = event => event && event.currentTarget && event.currentTarget.dataset || {}
const questionMode = mode => mode === 'quiz' || mode === 'shape'

function gridPoint(index, count, gap, gutter) {
  if (index < 0) return { percent: 0, offset: -gutter / 2 }
  if (index >= count) return { percent: 100, offset: gutter / 2 }
  const fraction = (index + 0.5) / count
  return { percent: fraction * 100, offset: (fraction - 0.5) * gap }
}
const coordinate = point => `calc(${point.percent}% ${point.offset < 0 ? '-' : '+'} ${Math.abs(point.offset)}rpx)`
function lineSegments(path, rows, cols) {
  return path.slice(1).map((point, index) => {
    const previous = path[index]
    const x = gridPoint(Math.min(point.col, previous.col), cols, 12, 24)
    const right = gridPoint(Math.max(point.col, previous.col), cols, 12, 24)
    const y = gridPoint(Math.min(point.row, previous.row), rows, 12, 36)
    const bottom = gridPoint(Math.max(point.row, previous.row), rows, 12, 36)
    const width = { percent: right.percent - x.percent, offset: right.offset - x.offset }
    const height = { percent: bottom.percent - y.percent, offset: bottom.offset - y.offset }
    return { id: index, horizontal: point.row === previous.row,
      style: `left:${coordinate(x)};top:${coordinate(y)};width:${coordinate(width)};height:${coordinate(height)};` }
  })
}

module.exports = {
  data: {
    mode: 'invalid', level: null, chapterName: '', config: null,
    tiles: [], selected: -1, targetRows: [], linkSegments: [], hinted: [], hintText: '',
    current: 0, total: 0, progressPercent: 0, movesLeft: 0,
    notice: '', resultOpen: false, saveError: '', resultWon: false, resultDescription: '',
    showReference: false, badgeUnlocked: false, question: null, quizOptions: [],
    questionNumber: 1, quizRevealed: false, quizExplanation: '',
    puzzleHeight: 630, freeAccess: settings.freeAccess
  },

  onLoad(options = {}) {
    this._active = true
    this._pathTimer = null
    const id = options.id || options.levelId || 'level-001'
    const level = catalog.find(item => item.id === id)
    const config = configs[id]
    if (!level || !config) { this.setData({ mode: 'invalid' }); return }
    const chapterName = chapterNames[level.difficulty - 1]
    this.setData({ level, chapterName })
    if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: chapterName })
    if (!settings.freeAccess) {
      try {
        const saved = getChallengeState().chapters.flatMap(chapter => chapter.levels).find(item => item.id === id)
        if (saved && saved.status === 'locked') { this.setData({ mode: 'locked' }); return }
      } catch (_) { this.setData({ mode: 'locked', notice: '进度暂时无法读取，请返回后重试' }); return }
    }
    this.setData({ config, mode: config.mode, total: config.total, puzzleHeight: config.puzzleHeight || 630 })
    this.restart()
  },
  onShow() { this._active = true },
  onHide() {
    this._active = false
    this.clearTimers()
    this.clearHint()
    this.setData({ linkSegments: [], showReference: false, selected: -1 })
  },
  onUnload() { this._active = false; this.clearTimers() },
  clearTimers() { if (this._pathTimer) clearTimeout(this._pathTimer); this._pathTimer = null },

  restart() {
    if (!this._active || !this.data.config) return
    this.clearTimers()
    const config = this.data.config
    this._game = config.mode === 'match' ? match.createMatchGame(config)
      : config.mode === 'link' ? link.createLinkGame(config)
        : config.mode === 'puzzle' ? pictures.createPuzzleGame(config)
          : quiz.createQuizGame(config.questions, config.minCorrect)
    this.setData({ selected: -1, resultOpen: false, resultWon: false, saveError: '',
      showReference: false, notice: '', badgeUnlocked: false, linkSegments: [], hinted: [], hintText: '' })
    this.syncGame()
  },

  syncGame() {
    if (!this._game) return
    const game = this._game, mode = this.data.mode, config = this.data.config
    let current = 0, tiles = [], targetRows = []
    if (mode === 'puzzle') {
      tiles = game.tiles.map((value, index) => ({ index, value, hinted: this.data.hinted.includes(index),
        hintOrder: this.data.hinted.indexOf(index) + 1,
        left: -(value % game.cols) * 100, top: -Math.floor(value / game.cols) * 100 }))
      current = game.tiles.filter((value, index) => value === index).length
    } else if (questionMode(mode)) {
      const question = game.questions[game.index]
      this.setData({ question, questionNumber: game.index + 1, quizRevealed: game.revealed,
        quizExplanation: game.revealed ? question.explanation : '',
        quizOptions: question.options.map((text, index) => ({ index, text, letter: ['A','B','C','D'][index],
          correct: game.revealed && index === question.answer,
          incorrect: game.revealed && index === game.selected && index !== question.answer,
          muted: game.revealed && index !== question.answer && index !== game.selected })) })
      current = game.correctCount
    } else {
      tiles = game.board.map((id, index) => ({ ...(symbolById[id] || {}), index,
        id: id || '', empty: !id, hinted: this.data.hinted.includes(index), arrived: mode === 'match' && game.removed.includes(index) }))
      if (mode === 'match' && game.targets) {
        targetRows = Object.entries(game.targets).map(([id, target]) => ({ ...symbolById[id], id,
          current: Math.min((game.counts || {})[id] || 0, target), target }))
        current = targetRows.reduce((sum, item) => sum + item.current, 0)
      } else current = mode === 'match' ? Math.min(game.collected, game.target) : config.total - game.pairsLeft
    }
    this.setData({ tiles, targetRows, current, progressPercent: current / config.total * 100,
      movesLeft: mode === 'match' ? game.movesLeft : 0 })
  },

  tapTile(event) {
    if (!this._active || !this._game || this._game.status !== 'playing' || this.data.resultOpen || this.data.showReference) return
    const raw = dataset(event).index
    if (raw === undefined || raw === null || raw === '') return
    const index = Number(raw)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.tiles.length || this.data.tiles[index].empty) return
    this.clearHint()
    const selected = this.data.selected
    if (selected === index) { this.setData({ selected: -1 }); return }
    if (selected < 0) { this.setData({ selected: index, notice: '' }); return }
    let next
    if (this.data.mode === 'match') next = match.swapMatchTiles(this._game, selected, index)
    else if (this.data.mode === 'link') next = link.connectLinkTiles(this._game, selected, index)
    else if (this.data.mode === 'puzzle') next = pictures.swapPuzzleTiles(this._game, selected, index)
    else return
    this.setData({ selected: -1 })
    if (!next.valid) {
      this.setData({ selected: index })
      this.toast(this.data.mode === 'match' ? '交换相邻纹样，连成三个相同图案'
        : this._game.board[selected] !== this._game.board[index] ? '请选择两枚相同的纹样'
          : '连线不能穿过纹样，最多转两次弯')
      return
    }
    this._game = next
    this.syncGame()
    this.setData({ notice: next.reshuffled ? '已自动重排，可以继续了' : this.data.mode === 'match' ? '纹样相逢，青花渐成' : '' })
    if (this.data.mode === 'link' && next.path.length > 1) {
      if (this._pathTimer) clearTimeout(this._pathTimer)
      this.setData({ linkSegments: lineSegments(next.path, next.rows, next.cols) })
      this._pathTimer = setTimeout(() => { this._pathTimer = null; if (this._active) this.setData({ linkSegments: [] }) }, 500)
    }
    this.finishIfNeeded()
  },

  tapAnswer(event) {
    if (!this._active || !questionMode(this.data.mode) || !this._game || this.data.resultOpen) return
    const raw = dataset(event).index
    if (raw === undefined || raw === null || raw === '') return
    const next = quiz.answerQuiz(this._game, Number(raw))
    if (!next.valid) return
    this.clearHint()
    this._game = next
    this.syncGame()
  },
  nextQuestion() {
    if (!this._active || !questionMode(this.data.mode) || !this._game || this.data.resultOpen) return
    const next = quiz.nextQuizQuestion(this._game)
    if (!next.valid) return
    this.clearHint()
    this._game = next
    this.syncGame()
    this.finishIfNeeded()
  },

  clearHint() {
    if (!this.data.hinted.length && !this.data.hintText) return
    this.setData({ hinted: [], hintText: '', linkSegments: [],
      tiles: this.data.tiles.map(tile => ({ ...tile, hinted: false, hintOrder: 0 })) })
  },
  hint() {
    if (!this._active || !this._game || this._game.status !== 'playing' || this.data.resultOpen || this.data.showReference) return
    const mode = this.data.mode
    if (questionMode(mode)) {
      if (this._game.revealed) return
      const text = this._game.questions[this._game.index].hint
      if (text) this.setData({ hintText: text })
      return
    }
    const pair = mode === 'match' ? match.getMatchHint(this._game)
      : mode === 'link' ? link.getLinkHint(this._game) : pictures.getPuzzleHint(this._game)
    if (!pair || pair.length !== 2) return
    this.clearTimers()
    const path = mode === 'link' ? link.findLinkPath(this._game.board, this._game.rows, this._game.cols, pair[0], pair[1]) : []
    this.setData({ hinted: pair, selected: -1,
      linkSegments: mode === 'link' ? lineSegments(path, this._game.rows, this._game.cols) : [],
      hintText: mode === 'puzzle' ? '' : mode === 'link' ? '沿标出的路线连接这两枚纹样，试着配对吧。'
        : '交换标记的两枚纹样，可以连成一线。' })
    this.syncGame()
  },

  finishIfNeeded() {
    if (!this._active || !this._game) return
    if (this._game.status === 'lost') {
      const description = questionMode(this.data.mode) ? `本次答对 ${this._game.correctCount} / 5 题，再试一次吧` : '步数用完啦，换个思路再来一次'
      this.setData({ resultOpen: true, resultWon: false, saveError: '', resultDescription: description })
    } else if (this._game.status === 'won') this.saveWin()
  },
  saveWin() {
    if (!this._active || !this._game || this._game.status !== 'won' || !this.data.level) return
    try {
      const state = completeChallenge(this.data.level.id)
      const badge = state.badges.find(item => item.chapterId === this.data.level.chapterId)
      this.setData({ resultOpen: true, resultWon: true, saveError: '', badgeUnlocked: !!badge && badge.unlocked,
        resultDescription: questionMode(this.data.mode) ? `答对 ${this._game.correctCount} / 5 题` : '' })
    } catch (_) { this.setData({ resultOpen: true, resultWon: true, saveError: '本次挑战已完成，进度保存失败，请重试保存' }) }
  },
  retrySave() { this.saveWin() },
  nextLevel() {
    if (!this.data.resultWon || this.data.saveError || this.data.level.order >= 12) return
    wx.redirectTo({ url: `/games/play/index?id=${catalog[this.data.level.order].id}` })
  },
  back() { wx.switchTab({ url: '/pages/challenge/index' }) },
  toggleReference() {
    if (!this._active || this.data.mode !== 'puzzle' || this.data.resultOpen || !this._game || this._game.status !== 'playing') return
    this.clearHint()
    this.setData({ showReference: !this.data.showReference })
  },
  toast(title) { if (typeof wx.showToast === 'function') wx.showToast({ title, icon: 'none' }) },
  noop() {}
}
