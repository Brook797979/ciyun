const { getWorks } = require('../../utils/craft-works')
const { go } = require('../../utils/navigation')
const { createCloudService } = require('../../utils/cloud-service')
const { createWorkViews, resolveWorkViews, isPrivateAI } = require('../../utils/ai-work-view')
const { loadWorkCollection, deleteWorkRecord } = require('../../utils/work-collection')
const service = createCloudService(wx)

Page({
  data: {
    works: [],
    aiOnly: false,
    loadError: false,
    syncing: false,
    syncError: false,
    deletingId: ''
  },

  onLoad(options = {}) {
    const aiOnly = options.type === 'ai'
    this.setData({ aiOnly })
    if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: aiOnly ? 'AI创瓷作品' : '我的作品' })
  },

  visibleWorks(works) { return this.data.aiOnly ? works.filter(isPrivateAI) : works },

  onShow() {
    const epoch = this._worksEpoch = (this._worksEpoch || 0) + 1
    this._deleteAttempt = null
    try {
      const saved = this.visibleWorks(getWorks())
      const works = createWorkViews(saved)
      this.setData({ works, loadError: false, deletingId: '' })
      return this.refreshWorks(epoch)
    } catch (error) {
      this.setData({ loadError: true, syncing: false })
    }
  },

  onHide() { this._worksEpoch = (this._worksEpoch || 0) + 1 },
  onUnload() { this._worksEpoch = (this._worksEpoch || 0) + 1 },

  async refreshWorks(epoch) {
    this.setData({ syncing: true, syncError: false })
    let records
    try { records = await loadWorkCollection(service) }
    catch (error) {
      if (this._worksEpoch !== epoch) return
      records = this.data.works
      this.setData({ syncError: true })
    }
    if (this._worksEpoch !== epoch) return
    records = this.visibleWorks(records)
    this.setData({ works: createWorkViews(records) })
    const works = await resolveWorkViews(records, ids => service.resolveAssets(ids))
    if (this._worksEpoch === epoch) this.setData({ works, syncing: false })
  },

  async deleteWork(event) {
    if (this._deleteAttempt) return
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const work = this.data.works.find(item => item.id === id)
    if (!work || typeof wx.showModal !== 'function') return
    const attempt = this._deleteAttempt = { epoch: this._worksEpoch }
    this.setData({ deletingId: id })
    try {
      const result = await new Promise((resolve, reject) => wx.showModal({
        title: '删除作品', content: `确定从作品记录中删除“${work.name}”吗？`,
        confirmText: '删除', confirmColor: '#9A594C', success: resolve, fail: reject
      }))
      if (!result.confirm || this._deleteAttempt !== attempt || this._worksEpoch !== attempt.epoch) return
      await deleteWorkRecord(work, service)
      if (this._deleteAttempt !== attempt || this._worksEpoch !== attempt.epoch) return
      attempt.epoch = this._worksEpoch = this._worksEpoch + 1
      this.setData({ works: this.data.works.filter(item => item.id !== id) })
      if (typeof wx.showToast === 'function') wx.showToast({ title: '已删除作品', icon: 'none' })
      this.refreshWorks(attempt.epoch)
    } catch (error) {
      if (this._deleteAttempt === attempt && this._worksEpoch === attempt.epoch && typeof wx.showToast === 'function') wx.showToast({ title: '删除失败，请重试', icon: 'none' })
    } finally {
      if (this._deleteAttempt === attempt) {
        this._deleteAttempt = null
        if (this._worksEpoch === attempt.epoch) this.setData({ deletingId: '' })
      }
    }
  },

  previewWork(event) {
    if (this._previewFlight && this._previewEpoch === this._worksEpoch) return this._previewFlight
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const work = this.data.works.find(item => item.id === id)
    if (!work) return Promise.resolve()
    const epoch = this._worksEpoch
    this._previewEpoch = epoch
    const preview = (async () => {
      let current = work
      if (isPrivateAI(work) && (!work.image || !work.imageExpiresAt || work.imageExpiresAt <= Date.now() + 15000)) {
        const refreshed = await resolveWorkViews([work], ids => service.resolveAssets(ids))
        if (this._worksEpoch !== epoch) return
        current = refreshed[0]
        this.setData({ works: this.data.works.map(item => item.id === id ? current : item) })
      }
      if (this._worksEpoch !== epoch || !this.data.works.some(item => item.id === id)) return
      if (!current.image) {
        if (typeof wx.showToast === 'function') wx.showToast({ title: '图片暂未加载，请稍后重试', icon: 'none' })
        return
      }
      if (typeof wx.previewImage === 'function') {
        wx.previewImage({ current: current.image, urls: [current.image] })
      }
    })().finally(() => { if (this._previewFlight === preview) this._previewFlight = null })
    this._previewFlight = preview
    return preview
  },

  startCraft() {
    go(this.data.aiOnly ? '/pages/ai-create/index' : '/pages/craft/index?new=1')
  }
})
