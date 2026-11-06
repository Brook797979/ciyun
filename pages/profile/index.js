const { resolveMedia } = require('../../utils/static-media')
const { createGrowthProgress } = require('../../utils/growth-progress')
const config = require('../../data/growth')
const { go } = require('../../utils/navigation')
const eventValue = (event, key) => event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset[key]
const journalIcons = { work_created: 'craft', identify_completed: 'identify', chat_answered: 'inquiry', ceramic_viewed: 'scholar', challenge_completed: 'master' }

Page({
  data: {
    identity: { level: 1, title: '初识瓷韵', totalXp: 0, currentLevelXp: 0, nextLevelXp: 50, progressPercent: 0, exploredDays: 0, image: '/assets/profile/identity-landscape.png' },
    footprints: { completedLevels: 0, ownWorks: 0, unlockedBadges: 0 },
    badges: config.badges.map(badge => ({ ...badge, current: 0, unlocked: false, progressPercent: 0 })),
    journal: [], selectedBadge: null, profileWarning: '', navTop: 30, navHeight: 32, heroHeight: 78, modalTop: 72,
    heroImage: '/assets/banners/home-hero.jpg'
  },
  onLoad() { this._growth = createGrowthProgress(wx); this.updateLayout() },
  onResize() { this.updateLayout() },
  updateLayout() {
    let info = {}; let capsule = {}
    try { info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {} } catch (_) {}
    try { capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() || {} : {} } catch (_) {}
    const scale = (Number(info.windowWidth) || 375) / 750
    const status = Number(info.statusBarHeight) || 24
    const navTop = Number(capsule.top) >= status ? Number(capsule.top) : status + 6
    const navHeight = Number(capsule.height) > 0 ? Number(capsule.height) : 32
    this.setData({ navTop, navHeight, heroHeight: navTop + navHeight + 24 * scale, modalTop: navTop + navHeight + 12 })
  },
  onShow() { this.refreshProfile() },
  refreshProfile() {
    try {
      if (!this._growth) this._growth = createGrowthProgress(wx)
      this._growth.recordVisit(); const migration = this._growth.migrateExistingRecords()
      const state = this._growth.getProfileState()
      const warnings = migration && migration.migrationWarnings || state.migrationWarnings || []
      const selectedBadge = this.data.selectedBadge ? state.badges.find(badge => badge.id === this.data.selectedBadge.id) || null : null
      const journal = state.journal.map(item => {
        const earned = item.iconType === 'badge_unlocked' && item.id.startsWith('badge:') ? item.id.slice(6) : ''
        const icon = config.badges.some(badge => badge.id === earned) ? earned : journalIcons[item.iconType] || 'scholar'
        return { ...item, dateShort: item.dateLabel.slice(5), year: item.dateLabel.slice(0, 4), image: `/assets/profile/${icon}.png` }
      })
      this.setData(resolveMedia({ identity: state.identity, footprints: state.footprints, badges: state.badges, journal, selectedBadge,
        profileWarning: warnings.length ? '部分足迹暂未读取，轻触重试' : '' }))
    } catch (_) { this.setData({ profileWarning: '本机成长记录暂未能更新，轻触重试' }) }
  },
  openBadge(event) {
    const selectedBadge = this.data.badges.find(badge => badge.id === eventValue(event, 'id'))
    if (selectedBadge) this.setData({ selectedBadge })
  },
  closeBadge() { this.setData({ selectedBadge: null }) },
  onHide() { this.closeBadge() },
  openFootprint(event) {
    const kind = eventValue(event, 'kind')
    if (kind === 'levels') go('/pages/challenge/index')
    else if (kind === 'works') go('/pages/works/index')
    else if (kind === 'badges' && typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ selector: '#growth-badges', duration: 300 })
  },
  noop() {}
})
