const { resolveMedia } = require('../../utils/static-media')
const workshop = resolveMedia(require('../../data/workshop'))
const { getWorks } = require('../../utils/craft-works')
const { go } = require('../../utils/navigation')
const { createCloudService } = require('../../utils/cloud-service')
const { createWorkViews, resolveWorkViews } = require('../../utils/ai-work-view')
const { loadWorkCollection, deleteWorkRecord } = require('../../utils/work-collection')
const service = createCloudService(wx)

function readWindowInfo() {
  for (const method of ['getWindowInfo', 'getSystemInfoSync']) {
    if (typeof wx[method] !== 'function') continue
    try {
      const info = wx[method]()
      if (info && typeof info === 'object') return info
    } catch (error) {
      // Older clients can expose an unavailable window API.
    }
  }
  return {}
}

Page({
  data: {
    ...workshop,
    recentHeadingIcon: resolveMedia('/assets/icons/workshop-recent-reference-ui.png'),
    emptyVaseImage: resolveMedia('/assets/workshop/ai-creation-reference.jpg'),
    primaryEntry: workshop.entries[0],
    secondaryEntries: workshop.entries.slice(1),
    recentWorks: [],
    workCount: 0, workError: '', deletingWorkId: '',
    selectedEntryId: '',
    brandTop: 54,
    heroHeight: 150,
    viewportHeight: 0,
    contentHeight: 472
  },

  onLoad() {
    this.updateLayout()
  },

  updateLayout(viewport = {}) {
    const windowInfo = readWindowInfo()
    const measuredWidth = Number(viewport.width)
    const width = (Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : Number(windowInfo.windowWidth)) || 375
    const scale = width / 750
    const statusBarHeight = Number(windowInfo.statusBarHeight) || 24
    let menuTop = statusBarHeight + 6
    let menuHeight = 32

    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        const height = menu && (menu.height || menu.bottom - menu.top)
        if (menu && Number.isFinite(menu.top) && menu.top > 0 && height > 0) {
          menuTop = menu.top
          menuHeight = height
        }
      } catch (error) {
        // Keep the status-bar-safe fallback.
      }
    }

    const safeBrandTop = menuTop + menuHeight + 12 * scale
    // Native windowHeight already excludes the system tabBar; do not reserve it twice.
    const measuredHeight = Number(viewport.height)
    const viewportHeight = (Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : Number(windowInfo.windowHeight)) || 0
    const heroHeight = Math.max(
      352 * scale,
      safeBrandTop + 136 * scale,
      Math.min(472 * scale, viewportHeight - 944 * scale)
    )
    this.setData({
      brandTop: safeBrandTop + 12 * scale,
      heroHeight,
      viewportHeight,
      // A definite height lets the native WebView resolve the recent section's auto margin.
      contentHeight: Math.max(944 * scale, viewportHeight - heroHeight)
    })
  },

  onReady() {
    this._layoutReady = true
    this.fitViewport()
  },

  onResize() {
    this.updateLayout()
    this.fitViewport()
  },

  fitViewport() {
    const measure = () => {
      if (typeof wx.createSelectorQuery !== 'function') return
      try {
        const query = wx.createSelectorQuery()
        query.selectViewport().boundingClientRect()
        // Keep the fallback independent of the content height to avoid stale-size feedback.
        query.select('.workshop-viewport-probe').boundingClientRect()
        query.exec((rects) => {
          if (!Array.isArray(rects)) return
          const viewport = rects.find((rect) => rect && Number.isFinite(rect.height) && rect.height > 0 && Number.isFinite(rect.width) && rect.width > 0)
          if (viewport) this.updateLayout(viewport)
        })
      } catch (error) {
        // The initial natural-flow dimensions remain usable without selector queries.
      }
    }
    if (typeof wx.nextTick === 'function') wx.nextTick(measure)
    else measure()
  },

  onShow() {
    const epoch = this._worksEpoch = (this._worksEpoch || 0) + 1
    this._deleting = null
    this.setData({ deletingWorkId: '' })
    try { this.showWorks(getWorks()) } catch (error) { /* Retain readable records. */ }
    return this.syncWorks(epoch)
  },

  showWorks(works) {
    this._works = works
    this.setData({ recentWorks: createWorkViews(works), workCount: works.length }, () => { if (this._layoutReady) this.fitViewport() })
  },

  async syncWorks(epoch) {
    this._syncing = true
    let works = this._works || []
    try {
      works = await loadWorkCollection(service)
      if (epoch !== this._worksEpoch) return
      this.setData({ workError: '' })
    } catch (error) {
      if (epoch !== this._worksEpoch) return
      this.setData({ workError: '作品同步失败，请重试' })
    }
    this.showWorks(works)
    const recentWorks = await resolveWorkViews(works, ids => service.resolveAssets(ids))
    if (epoch === this._worksEpoch) { this._syncing = false; this.setData({ recentWorks }) }
  },

  retryWorks() {
    if (!this._syncing) return this.syncWorks(this._worksEpoch = (this._worksEpoch || 0) + 1)
  },

  async deleteWork(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const work = (this._works || []).find(item => item.id === id)
    if (this._deleting || !work || typeof wx.showModal !== 'function') return
    const epoch = this._worksEpoch
    const deletion = this._deleting = {}
    this.setData({ deletingWorkId: id })
    try {
      const confirmed = await new Promise(resolve => wx.showModal({ title: '删除作品', content: `确定删除“${work.name}”吗？`, confirmText: '删除', success: result => resolve(result.confirm), fail: () => resolve(false) }))
      if (!confirmed || epoch !== this._worksEpoch) return
      await deleteWorkRecord(work, service)
      if (epoch !== this._worksEpoch) return
      this.showWorks(this._works.filter(item => item.id !== id))
      await this.syncWorks(++this._worksEpoch)
    } catch (error) {
      if (epoch === this._worksEpoch && typeof wx.showToast === 'function') wx.showToast({ title: '删除失败，请重试', icon: 'none' })
    } finally {
      if (this._deleting === deletion) { this._deleting = null; this.setData({ deletingWorkId: '' }) }
    }
  },

  onHide() { this._worksEpoch = (this._worksEpoch || 0) + 1 },
  onUnload() { this._worksEpoch = (this._worksEpoch || 0) + 1 },

  openWorks() {
    go('/pages/works/index')
  },

  selectEntry(event) {
    const id = event.currentTarget.dataset.id
    const entry = this.data.entries.find((item) => item.id === id)
    if (!entry) return
    // Keep entry selection ready for the next-stage feature pages.
    this.setData({ selectedEntryId: id })
    if (entry.url) go(entry.url)
  }
})
