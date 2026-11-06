const { go } = require('../../utils/navigation')

Page({
  onLoad(options = {}) {
    const levels = require('../../data/challenges')
    const id = options.id || options.levelId || 'level-001'
    const level = levels.find(level => level.id === id)
    if (level) wx.redirectTo({ url: `/games/play/index?id=${encodeURIComponent(level.id)}` })
    else go('/pages/challenge/index')
  },
  back() {
    go('/pages/challenge/index')
  }
})
