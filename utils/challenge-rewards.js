const levels = require('../data/challenges')
const { recordChallengeCompletion } = require('./challenge-progress')
const keys = { shape: 'unlockedShapeIds', pattern: 'unlockedPatternIds', glaze: 'unlockedGlazeIds' }

function completeChallenge(levelId) {
  const level = levels.find(level => level.id === levelId)
  if (!level) throw new Error('无效关卡')
  const key = keys[level.reward.type]
  const stored = wx.getStorageSync(key)
  const ids = stored === '' || stored === undefined || stored === null ? [] : stored
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new Error('素材记录暂时无法读取')
  // Persist real completion first. If the material write fails, retry repairs the
  // reward without recording another completion or granting duplicate growth XP.
  const state = recordChallengeCompletion(levelId)
  if (!ids.includes(level.reward.id)) wx.setStorageSync(key, [...ids, level.reward.id])
  return state
}

module.exports = { completeChallenge }
