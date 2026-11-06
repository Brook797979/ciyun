const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages/challenge/index.js')
const expectedRewards = [
  ['shape', 'bowl'], ['pattern', 'pattern-scroll-lotus'], ['glaze', 'glaze-bean'],
  ['shape', 'vase'], ['pattern', 'pattern-flower-bird'], ['glaze', 'glaze-rice'],
  ['shape', 'garlic'], ['pattern', 'pattern-beast'], ['glaze', 'glaze-cobalt'],
  ['shape', 'double-ear'], ['pattern', 'pattern-landscape'], ['glaze', 'glaze-rouge']
]

function loadMap() {
  const mapPath = path.join(root, 'data/challenge-map.js')
  assert.ok(fs.existsSync(mapPath), 'chapter map data must exist')
  return require(mapPath)
}

function createEnvironment(t, overrides = {}) {
  const originalWx = global.wx
  const effects = []
  const scrolls = []
  const toasts = []
  global.wx = {
    getWindowInfo() { return { statusBarHeight: 44 } },
    getMenuButtonBoundingClientRect() { return { top: 52, bottom: 84, height: 32 } },
    pageScrollTo(options) { scrolls.push(options) },
    showToast(options) { toasts.push(options) },
    ...Object.fromEntries(['getStorageSync', 'setStorageSync', 'getStorage', 'setStorage', 'navigateTo', 'switchTab', 'redirectTo', 'reLaunch'].map((method) => [method, (...args) => { effects.push([method, args]) }])),
    ...overrides
  }
  t.after(() => { global.wx = originalWx })
  return { effects, scrolls, toasts }
}

function loadPage(sourcePath = pagePath, freeAccess) {
  const originalPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  try {
    if (freeAccess === undefined) {
      delete require.cache[require.resolve(sourcePath)]
      require(sourcePath)
    } else {
      const progressPath = path.join(root, 'utils/challenge-progress.js')
      const progressModule = { exports: {} }
      vm.runInNewContext(fs.readFileSync(progressPath, 'utf8'), {
        module: progressModule,
        wx: global.wx,
        require(name) {
          return name === '../data/challenge-settings' ? { freeAccess }
            : require(path.resolve(path.dirname(progressPath), name))
        }
      }, { filename: progressPath })
      vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
        Page: global.Page,
        wx: global.wx,
        require(name) {
          return name === '../../utils/challenge-progress' ? progressModule.exports
            : require(path.resolve(path.dirname(sourcePath), name))
        }
      }, { filename: sourcePath })
    }
  } finally {
    global.Page = originalPage
  }
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(update) { Object.assign(this.data, update) }
  }
}

const idEvent = (id) => ({ currentTarget: { dataset: { id } } })

test('twelve unique catalog levels have fixed chapter difficulty without demo progress', () => {
  const levels = require(path.join(root, 'data/challenges'))
  assert.equal(levels.length, 12)
  assert.equal(new Set(levels.map((level) => level.id)).size, 12)
  levels.forEach((level, index) => {
    const difficulty = Math.floor(index / 4) + 1
    assert.equal(level.id, `level-${String(index + 1).padStart(3, '0')}`)
    assert.equal(level.order, index + 1)
    assert.equal(level.chapterId, `chapter-${difficulty}`)
    assert.equal(level.difficulty, difficulty)
    assert.deepEqual(level.difficultyStars, [1, 2, 3].map((star) => star <= difficulty))
    assert.equal(level.status, undefined)
    assert.equal(level.statusLabel, undefined)
    assert.ok(level.name && level.rewardLabel)
    for (const field of ['gameType', 'bestStars', 'earnedStars', 'rewardPatternId']) {
      assert.equal(Object.hasOwn(level, field), false, `${level.id} must not define ${field}`)
    }
  })
})

test('each reward refers to the exact real catalog item and an existing local image', () => {
  const levels = require(path.join(root, 'data/challenges'))
  const catalogs = {
    shape: require(path.join(root, 'data/shapes')),
    pattern: require(path.join(root, 'data/patterns')),
    glaze: require(path.join(root, 'data/glazes'))
  }
  assert.deepEqual(levels.map(({ reward }) => reward && [reward.type, reward.id]), expectedRewards)
  levels.forEach(({ reward, rewardLabel }) => {
    const item = catalogs[reward.type].find(({ id }) => id === reward.id)
    assert.ok(item)
    assert.equal(reward.name, item.name)
    assert.equal(reward.image, item.image)
    assert.ok(fs.existsSync(path.join(root, reward.image.slice(1))), reward.image)
    assert.equal(reward.kindLabel, { shape: '器型', pattern: '纹样', glaze: '釉色' }[reward.type])
    assert.ok(rewardLabel.includes(item.name))
    if (reward.type === 'glaze') assert.equal(reward.color, item.color)
  })
})

test('locked pattern sources agree with their assigned reward levels', () => {
  const patterns = require(path.join(root, 'data/patterns'))
  const levels = require(path.join(root, 'data/challenges'))
  assert.deepEqual(patterns.filter(({ unlocked }) => !unlocked).map(({ id, sourceLevelId }) => [id, sourceLevelId]), [
    ['pattern-flower-bird', 'level-005'], ['pattern-landscape', 'level-011'],
    ['pattern-scroll-lotus', 'level-002'], ['pattern-beast', 'level-008']
  ])
  patterns.filter(({ sourceLevelId }) => sourceLevelId).forEach((pattern) => {
    assert.equal(levels.find(({ id }) => id === pattern.sourceLevelId).reward.id, pattern.id)
    assert.equal(pattern.unlocked, false)
  })
})

test('three ordered chapters expose all levels and one configured badge per chapter', () => {
  const map = loadMap()
  const levels = require(path.join(root, 'data/challenges'))
  assert.deepEqual(map.chapters.map(({ id, number, name }) => [id, number, name]), [
    ['chapter-1', 1, '溪畔识瓷'], ['chapter-2', 2, '青花作坊'], ['chapter-3', 3, '窑火成器']
  ])
  map.chapters.forEach((chapter) => {
    assert.equal(chapter.levels.length, 4)
    assert.ok(chapter.subtitle && chapter.description)
    assert.equal(chapter.background, `/assets/challenge/${chapter.id}.jpg`)
    assert.ok(chapter.levels.every(({ chapterId }) => chapterId === chapter.id))
  })
  assert.deepEqual(map.chapters.flatMap(({ levels }) => levels), levels)
  assert.deepEqual(map.chapters.map(({ nextChapterId, nextChapterName }) => [nextChapterId, nextChapterName]), [
    ['chapter-2', '青花作坊'], ['chapter-3', '窑火成器'], ['', '']
  ])
  assert.equal(map.totalCount, 12)
  assert.equal(map.completedCount, undefined)
  assert.equal(map.achievement, undefined)
  assert.equal(map.badges.length, 3)
  assert.deepEqual(map.badges.map(({ chapterId }) => chapterId), map.chapters.map(({ id }) => id))
  assert.ok(map.badges.every(({ image, chapterId }) => image === `/assets/challenge/badges/${chapterId}.png`))
})

test('all twelve free-access level taps open games without recording completion or granting rewards', (t) => {
  const { effects, toasts } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad()
  const levels = require(path.join(root, 'data/challenges'))
  const beforeCatalogs = JSON.stringify(['shapes', 'patterns', 'glazes', 'challenges'].map((name) => require(path.join(root, `data/${name}`))))
  const beforeBadges = structuredClone(page.data.badges)
  assert.ok(page.data.chapters.flatMap(({ levels }) => levels).every(({ status }) => status === 'available'))
  for (const { id } of levels) {
    page.setData({ showAchievement: true })
    page.openLevel(idEvent(id))
    assert.equal(page.data.selectedLevel, undefined)
    assert.equal(page.data.showAchievement, false)
  }
  assert.deepEqual(toasts, [])
  assert.equal(JSON.stringify(['shapes', 'patterns', 'glazes', 'challenges'].map((name) => require(path.join(root, `data/${name}`)))), beforeCatalogs)
  assert.deepEqual(effects, levels.map(({ id }) => ['navigateTo', [{ url: `/games/play/index?id=${id}` }]]))
  assert.equal(page.data.completedCount, 0)
  assert.equal(page.data.currentLevelId, 'level-001')
  assert.equal(page.data.progressPercent, 0)
  assert.deepEqual(page.data.badges, beforeBadges)
})

test('sequential access keeps later levels locked and allows the current real game', (t) => {
  const { effects, toasts } = createEnvironment(t)
  const page = loadPage(pagePath, false)
  assert.equal(page.data.chapters[0].levels[0].status, 'available')
  assert.ok(page.data.chapters.flatMap(({ levels }) => levels).slice(1).every(({ status }) => status === 'locked'))
  page.openLevel(idEvent('level-005'))
  page.openLevel(idEvent('level-012'))
  assert.deepEqual(effects, [])
  assert.deepEqual(toasts.map(({ title, icon }) => [title, icon]), [
    ['请先完成前一关', 'none'], ['请先完成前一关', 'none']
  ])
  page.openLevel(idEvent('level-001'))
  assert.deepEqual(structuredClone(effects), [['navigateTo', [{ url: '/games/play/index?id=level-001' }]]])
  assert.equal(page.data.completedCount, 0)
  assert.ok(page.data.badges.every(({ unlocked }) => !unlocked))
})

test('invalid level taps are ignored and achievement clears when leaving the page', (t) => {
  const { effects, toasts } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.openAchievement, 'function')
  page.openAchievement()
  assert.equal(page.data.showAchievement, true)
  assert.equal(page.data.selectedLevel, undefined)
  const before = structuredClone(page.data)
  for (const event of [undefined, {}, idEvent('unknown'), { currentTarget: {} }]) page.openLevel(event)
  assert.deepEqual(page.data, before)
  assert.deepEqual(toasts, [])
  page.closeAchievement()
  assert.equal(page.data.showAchievement, false)
  page.openLevel(idEvent('level-005'))
  page.onHide()
  assert.equal(page.data.selectedLevel, undefined)
  assert.equal(page.data.showAchievement, false)
  page.openAchievement()
  page.onHide()
  assert.equal(page.data.showAchievement, false)
  page.noop()
  assert.deepEqual(effects, [
    ['getStorageSync', ['challengeProgress']],
    ['navigateTo', [{ url: '/games/play/index?id=level-005' }]],
    ['getStorageSync', ['challengeProgress']]
  ])
})

test('custom navigation respects the status bar and capsule metrics', (t) => {
  createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad()
  assert.equal(page.data.statusBarHeight, 44)
  assert.equal(page.data.navHeight, 92)
  assert.ok(page.data.brandTop >= 84)
  assert.ok(page.data.heroHeight > page.data.brandTop)
})

test('custom navigation tolerates unavailable APIs and invalid capsule metrics', (t) => {
  createEnvironment(t, {
    getWindowInfo() { throw new Error('unavailable') },
    getSystemInfoSync() { return { statusBarHeight: 24 } },
    getMenuButtonBoundingClientRect() { return { top: 0, bottom: 0, height: 0 } }
  })
  const page = loadPage()
  assert.equal(typeof page.onLoad, 'function')
  assert.doesNotThrow(() => page.onLoad())
  assert.equal(page.data.statusBarHeight, 24)
  assert.equal(page.data.navHeight, 68)
  global.wx.getSystemInfoSync = () => { throw new Error('unavailable') }
  global.wx.getMenuButtonBoundingClientRect = () => { throw new Error('unavailable') }
  assert.doesNotThrow(() => page.onLoad())
  assert.equal(page.data.statusBarHeight, 20)
  assert.equal(page.data.navHeight, 64)
})

test('downward chapter swipes advance chapter one to three and upward swipes return without side effects', (t) => {
  const { effects, scrolls } = createEnvironment(t)
  const page = loadPage()
  assert.equal(typeof page.switchChapter, 'function')
  assert.equal(typeof page.onChapterChange, 'function')
  page.onLoad()
  assert.deepEqual(page.data.chapters.map(({ id }) => id), ['chapter-1', 'chapter-2', 'chapter-3'])
  assert.ok(Array.isArray(page.data.displayChapters), 'the native swiper needs a separate reversed chapter display order')
  assert.deepEqual(page.data.displayChapters.map(({ id }) => id), ['chapter-3', 'chapter-2', 'chapter-1'])
  assert.equal(page.data.chapterIndex, 0)
  let physicalIndex = page.data.chapters.length - 1 - page.data.chapterIndex
  assert.equal(physicalIndex, 2)
  assert.equal(page.data.displayChapters[physicalIndex].id, 'chapter-1')
  // A downward finger swipe selects the preceding item in a native vertical swiper.
  for (const chapterNumber of [2, 3]) {
    page.onChapterChange({ detail: { current: --physicalIndex, source: 'touch' } })
    assert.equal(page.data.chapterIndex, chapterNumber - 1)
    assert.equal(page.data.displayChapters[physicalIndex].id, `chapter-${chapterNumber}`)
  }
  // An upward finger swipe returns through the logical chapters in reverse.
  for (const chapterNumber of [2, 1]) {
    page.onChapterChange({ detail: { current: ++physicalIndex, source: 'touch' } })
    assert.equal(page.data.chapterIndex, chapterNumber - 1)
    assert.equal(page.data.displayChapters[physicalIndex].id, `chapter-${chapterNumber}`)
  }
  page.switchChapter(idEvent('chapter-2'))
  assert.equal(page.data.chapterIndex, 1)
  for (const event of [undefined, {}, idEvent('unrelated')]) page.switchChapter(event)
  assert.equal(page.data.chapterIndex, 1)
  page.onChapterChange({ detail: { current: 0, source: 'touch' } })
  assert.equal(page.data.chapterIndex, 2)
  page.onChapterChange({ detail: { current: 1, source: 'touch' } })
  assert.equal(page.data.chapterIndex, 1)
  for (const current of [-1, 3, 0.5, '1', NaN]) page.onChapterChange({ detail: { current } })
  for (const event of [undefined, {}, { detail: {} }]) page.onChapterChange(event)
  assert.equal(page.data.chapterIndex, 1)
  page.switchChapter(idEvent('chapter-1'))
  assert.equal(page.data.chapterIndex, 0)
  assert.deepEqual(scrolls, [])
  assert.deepEqual(effects, [])
})

test('the unchanged full-screen chapter swiper binds reversed display order and downward instructions', () => {
  const template = fs.readFileSync(path.join(root, 'pages/challenge/index.wxml'), 'utf8')
  assert.match(template, /<swiper\b[^>]*class="chapter-swiper"[^>]*\bvertical\b[^>]*current="\{\{chapters.length - 1 - chapterIndex\}\}"[^>]*bindchange="onChapterChange"[^>]*disable-touch="\{\{showAchievement\}\}"/)
  assert.match(template, /<swiper-item\b[^>]*wx:for="\{\{displayChapters\}\}"[^>]*wx:for-item="chapter"/)
  assert.doesNotMatch(template, /circular="(?:true|\{\{true\}\})"|上滑进入|继续向下浏览|<page-meta\b/)
  assert.match(template, /<text class="swipe-arrow">↓<\/text><text>下滑进入\{\{chapter.nextChapterName\}\}<\/text>/)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/challenge/index.json'), 'utf8'))
  assert.equal(config.disableScroll, true)
  const stylesheet = fs.readFileSync(path.join(root, 'pages/challenge/index.wxss'), 'utf8')
  assert.match(stylesheet, /page\s*\{\s*height:\s*100%;\s*overflow:\s*hidden;/)
  assert.match(stylesheet, /\.challenge-page\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/)
})

test('refreshing stored progress updates reversed chapter views without moving the current chapter', (t) => {
  let stored = { completedLevelIds: ['level-001', 'level-002'] }
  const { effects } = createEnvironment(t, { getStorageSync() { return structuredClone(stored) } })
  const page = loadPage()
  page.onShow()
  page.switchChapter(idEvent('chapter-3'))
  const physicalIndex = page.data.chapters.length - 1 - page.data.chapterIndex
  stored.completedLevelIds.push('level-003', 'level-004')
  page.onHide()
  page.onShow()
  assert.equal(page.data.chapterIndex, 2)
  assert.ok(Array.isArray(page.data.displayChapters), 'stored progress must also refresh the reversed chapter views')
  assert.equal(page.data.displayChapters[physicalIndex].id, 'chapter-3')
  assert.deepEqual(page.data.displayChapters.map(({ id }) => id), ['chapter-3', 'chapter-2', 'chapter-1'])
  assert.deepEqual(page.data.chapters.map(({ id }) => id), ['chapter-1', 'chapter-2', 'chapter-3'])
  assert.ok(page.data.displayChapters[2].levels.every(({ status }) => status === 'completed'))
  assert.equal(page.data.displayChapters[1].levels[0].id, 'level-005')
  assert.equal(page.data.displayChapters[1].levels[0].status, 'available')
  assert.equal(page.data.unlockedBadgeCount, 1)
  page.openAchievement()
  assert.equal(page.data.chapterIndex, 2)
  assert.equal(page.data.showAchievement, true)
  page.closeAchievement()
  assert.equal(page.data.showAchievement, false)
  assert.equal(page.data.chapterIndex, 2)
  assert.deepEqual(effects, [])
})

test('page refreshes stored completions and chapter badges when returning to challenge', (t) => {
  let stored = { completedLevelIds: ['level-001', 'level-002'] }
  const { effects } = createEnvironment(t, { getStorageSync() { return structuredClone(stored) } })
  const page = loadPage()
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  assert.equal(page.data.completedCount, 2)
  assert.equal(page.data.currentLevelId, 'level-003')
  assert.equal(page.data.unlockedBadgeCount, 0)
  assert.equal(page.data.badges[0].completedCount, 2)
  stored.completedLevelIds.push('level-003', 'level-004')
  page.onHide()
  page.onShow()
  assert.equal(page.data.completedCount, 4)
  assert.equal(page.data.currentLevelId, 'level-005')
  assert.equal(page.data.unlockedBadgeCount, 1)
  assert.deepEqual(page.data.badges.map(({ unlocked }) => unlocked), [true, false, false])
  assert.ok(Math.abs(page.data.progressPercent - 100 / 3) < 0.001)
  stored = ''
  page.onShow()
  assert.equal(page.data.completedCount, 0)
  assert.equal(page.data.unlockedBadgeCount, 0)
  assert.deepEqual(effects, [])
})

test('failed progress reads preserve the last readable state without overwriting storage', (t) => {
  let unreadable = false
  const { effects } = createEnvironment(t, { getStorageSync() {
    if (unreadable) throw new Error('storage unavailable')
    return { completedLevelIds: ['level-001'] }
  } })
  const page = loadPage()
  assert.equal(typeof page.onShow, 'function')
  page.onShow()
  const before = structuredClone(page.data)
  unreadable = true
  assert.doesNotThrow(() => page.onShow())
  assert.deepEqual(page.data, before)
  assert.deepEqual(effects, [])
})

function assertSafeLegacyTemplate(route) {
  const template = fs.readFileSync(path.join(root, `pages/${route}/index.wxml`), 'utf8')
  assert.match(template, /瓷韵之旅/)
  assert.match(template, /bindtap="back"[^>]*>返回地图/)
  assert.doesNotMatch(template, /gameType|level\.|★★★|获得纹样奖励|模拟完成|挑战完成|bindtap="(?:complete|workshop)"/)
}

test('legacy game entries redirect valid or default ids to real games and reject invalid ids safely', (t) => {
  const { effects } = createEnvironment(t)
  const page = loadPage(path.join(root, 'pages/game/index.js'))
  assert.equal(typeof page.onLoad, 'function')
  for (const options of [undefined, {}, { id: 'level-001' }, { id: 'level-012' }, { levelId: 'level-005' }]) page.onLoad(options)
  for (const id of ['unknown', 'level-000', 'level-013']) page.onLoad({ id })
  page.back()
  assert.deepEqual(effects, [
    ...['level-001', 'level-001', 'level-001', 'level-012', 'level-005'].map(id => (
      ['redirectTo', [{ url: `/games/play/index?id=${id}` }]]
    )),
    ...Array.from({ length: 4 }, () => ['switchTab', [{ url: '/pages/challenge/index' }]])
  ])
  assert.equal(page.complete, undefined)
  assert.equal(page.workshop, undefined)
  assertSafeLegacyTemplate('game')
})

test('legacy result entries return to the map without recording a simulated completion', (t) => {
  const { effects } = createEnvironment(t)
  const page = loadPage(path.join(root, 'pages/challenge-result/index.js'))
  assert.equal(typeof page.onLoad, 'function')
  page.onLoad({ id: 'level-012', completed: true, stars: 3 })
  assert.equal(typeof page.back, 'function')
  page.back()
  assert.deepEqual(effects, [
    ['switchTab', [{ url: '/pages/challenge/index' }]],
    ['switchTab', [{ url: '/pages/challenge/index' }]]
  ])
  assert.equal(page.complete, undefined)
  assert.equal(page.workshop, undefined)
  assertSafeLegacyTemplate('challenge-result')
})
