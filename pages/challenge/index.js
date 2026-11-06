const { resolveMedia } = require('../../utils/static-media')
const map = resolveMedia(require('../../data/challenge-map'))
const { buildChallengeState, getChallengeState } = require('../../utils/challenge-progress')
const initialProgress = resolveMedia(buildChallengeState())

function readWindowInfo() {
  for (const method of ['getWindowInfo', 'getSystemInfoSync']) {
    if (typeof wx[method] !== 'function') continue
    try {
      const info = wx[method]()
      if (info && typeof info === 'object') return info
    } catch (error) {
      // Some clients expose the newer API before it is available.
    }
  }
  return {}
}

function eventId(event) {
  return event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id
}

Page({
  data: {
    ...initialProgress,
    displayChapters: initialProgress.chapters.slice().reverse(),
    unlockedBadgeCount: 0,
    chapterIndex: 0,
    showAchievement: false,
    statusBarHeight: 20,
    navHeight: 64,
    brandTop: 70,
    heroHeight: 176
  },

  onLoad() {
    this.updateLayout()
  },

  onResize() {
    this.updateLayout()
  },

  updateLayout() {
    const info = readWindowInfo()
    const scale = (Number.isFinite(info.windowWidth) && info.windowWidth > 0 ? info.windowWidth : 375) / 750
    const statusBarHeight = Number.isFinite(info.statusBarHeight) && info.statusBarHeight > 0
      ? info.statusBarHeight : 20
    let navHeight = 44
    let capsuleBottom = statusBarHeight + 44
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        const height = menu && (menu.height || menu.bottom - menu.top)
        if (menu && Number.isFinite(menu.top) && menu.top >= statusBarHeight && Number.isFinite(height) && height > 0) {
          navHeight = Math.max(44, height + (menu.top - statusBarHeight) * 2)
          capsuleBottom = menu.top + height
        }
      } catch (error) {
        // Keep the status-bar-safe fallback when capsule metrics are unavailable.
      }
    }
    const brandTop = capsuleBottom + 12 * scale
    this.setData({ statusBarHeight, navHeight: statusBarHeight + navHeight, brandTop,
      heroHeight: Math.max(352 * scale, brandTop + 136 * scale) })
  },

  onShow() {
    this.refreshProgress()
  },

  refreshProgress() {
    try {
      const progress = resolveMedia(getChallengeState())
      this.setData({ ...progress, displayChapters: progress.chapters.slice().reverse(),
        unlockedBadgeCount: progress.badges.filter(({ unlocked }) => unlocked).length })
    } catch (error) {
      // Preserve the last readable progress; never replace unreadable storage.
    }
  },

  openLevel(event) {
    const level = this.data.chapters.reduce((all, chapter) => all.concat(chapter.levels), []).find(({ id }) => id === eventId(event))
    if (!level) return
    this.setData({ showAchievement: false })
    if (level.status === 'locked') {
      wx.showToast({ title: '请先完成前一关', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/games/play/index?id=${encodeURIComponent(level.id)}` })
  },

  openAchievement() {
    this.refreshProgress()
    this.setData({ showAchievement: true })
  },

  closeAchievement() {
    this.setData({ showAchievement: false })
  },

  onHide() {
    this.setData({ showAchievement: false })
  },

  switchChapter(event) {
    const chapterIndex = map.chapters.findIndex(({ id }) => id === eventId(event))
    if (chapterIndex >= 0) this.setData({ chapterIndex })
  },

  onChapterChange(event) {
    const displayIndex = event && event.detail && event.detail.current
    if (!Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex >= map.chapters.length) return
    const chapterIndex = map.chapters.length - 1 - displayIndex
    if (chapterIndex !== this.data.chapterIndex) this.setData({ chapterIndex })
  },

  noop() {}
})
