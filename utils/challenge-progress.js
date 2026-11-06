const levels = require('../data/challenges')
const map = require('../data/challenge-map')
const settings = require('../data/challenge-settings')

const STORAGE_KEY = 'challengeProgress'
const statusLabels = { completed: '已完成', available: '待挑战', locked: '未解锁' }

function isProgressObject(progress) {
  return progress && typeof progress === 'object' && !Array.isArray(progress)
}

function normalizeCompletedLevelIds(progress) {
  const savedIds = isProgressObject(progress) && Array.isArray(progress.completedLevelIds)
    ? new Set(progress.completedLevelIds)
    : new Set()
  return levels.filter(({ id }) => savedIds.has(id)).map(({ id }) => id)
}

function buildChallengeState(progress, options = {}) {
  const freeAccess = options.freeAccess === undefined ? settings.freeAccess : options.freeAccess === true
  const completedLevelIds = normalizeCompletedLevelIds(progress)
  const completedIds = new Set(completedLevelIds)
  const currentLevel = levels.find(({ id }) => !completedIds.has(id))
  const currentLevelId = currentLevel ? currentLevel.id : ''
  const completedCount = completedLevelIds.length
  const chapters = map.chapters.map((chapter) => ({
    ...chapter,
    levels: chapter.levels.map((level) => {
      const status = completedIds.has(level.id) ? 'completed'
        : freeAccess || level.id === currentLevelId ? 'available' : 'locked'
      return { ...level, status, statusLabel: statusLabels[status] }
    })
  }))
  const badges = map.badges.map((badge) => {
    const chapterLevels = levels.filter(({ chapterId }) => chapterId === badge.chapterId)
    const finishedLevels = chapterLevels.filter(({ id }) => completedIds.has(id)).length
    const totalLevels = chapterLevels.length
    return {
      ...badge,
      finishedLevels,
      totalLevels,
      progressPercent: totalLevels > 0 ? finishedLevels / totalLevels * 100 : 0,
      completedCount: finishedLevels,
      totalCount: totalLevels,
      unlocked: totalLevels > 0 && finishedLevels === totalLevels
    }
  })

  return {
    chapters,
    completedCount,
    totalCount: map.totalCount,
    currentLevelId,
    progressPercent: completedCount / map.totalCount * 100,
    badges
  }
}

function getChallengeState() {
  return buildChallengeState(wx.getStorageSync(STORAGE_KEY))
}

function recordChallengeCompletion(levelId, options = {}) {
  const levelIndex = levels.findIndex(({ id }) => id === levelId)
  if (levelIndex === -1) throw new Error('无效关卡')

  // A failed read must propagate before any write can replace existing progress.
  const progress = wx.getStorageSync(STORAGE_KEY)
  const completedLevelIds = normalizeCompletedLevelIds(progress)
  const completedIds = new Set(completedLevelIds)
  let nextProgress = progress
  if (!completedIds.has(levelId)) {
    const freeAccess = options.freeAccess === undefined ? settings.freeAccess : options.freeAccess === true
    if (!freeAccess && levels.slice(0, levelIndex).some(({ id }) => !completedIds.has(id))) {
      throw new Error('请先完成前置关卡')
    }

    completedIds.add(levelId)
    nextProgress = {
      ...(isProgressObject(progress) ? progress : {}),
      version: 1,
      completedLevelIds: levels.filter(({ id }) => completedIds.has(id)).map(({ id }) => id)
    }
    // Only completion ids are persisted; catalog rewards remain gameplay's responsibility.
    wx.setStorageSync(STORAGE_KEY, nextProgress)
  }
  // Replays can restore cleared activity; the growth ledger still deduplicates XP.
  try {
    require('./growth-progress').createGrowthProgress(wx).recordGrowthEvent('challenge_completed', {
      id: levelId, createdAt: Date.now()
    })
  } catch (_) { /* A growth failure cannot invalidate a real completed level. */ }
  return buildChallengeState(nextProgress, options)
}

module.exports = { STORAGE_KEY, buildChallengeState, getChallengeState, recordChallengeCompletion }
