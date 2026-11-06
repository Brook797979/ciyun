const { resolveMedia } = require('../../utils/static-media')
const { createCloudService } = require('../../utils/cloud-service')
const { createIdentifyHistory } = require('../../utils/ai-identify-history')
const text = value => typeof value === 'string' ? value.trim() : ''
const strings = value => Array.isArray(value) ? value.filter(item => text(item)).map(text) : []

function confirmDelete() {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('暂时无法确认删除，请重试。'))
    if (typeof wx.showModal !== 'function') { fail(); return }
    const success = response => resolve(Boolean(response && response.confirm))
    try {
      const pending = wx.showModal({ title: '删除识瓷记录', content: '确定删除这条本机识瓷记录？删除后无法恢复。', confirmText: '删除', confirmColor: '#a94b3e', cancelText: '保留', success, fail })
      if (pending && typeof pending.then === 'function') pending.then(success, fail)
    } catch (_) { fail() }
  })
}

function metrics() {
  let info = {}; let capsule = {}
  try { info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {} } catch (_) {}
  const statusBarHeight = Number(info.statusBarHeight) || 24
  try { capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() || {} : {} } catch (_) {}
  const navTop = Number(capsule.top) >= statusBarHeight ? Number(capsule.top) : statusBarHeight + 6
  const navHeight = Number(capsule.height) > 0 ? Number(capsule.height) : 32
  const headerHeight = navTop + navHeight + 18; const bottom = info.safeArea && info.safeArea.bottom
  return { navTop, navHeight, headerHeight, brandTop: headerHeight + 12, heroHeight: headerHeight + 138, safeBottom: typeof bottom === 'number' && bottom > 0 && bottom <= info.windowHeight ? info.windowHeight - bottom : 0 }
}
function viewRecord(record) {
  const result = record.result
  const statusLabel = { recognized: '识别完成', uncertain: '尚难判断', not_ceramic: '未发现陶瓷' }[result.status]
  const title = result.status === 'not_ceramic' ? '未发现可辨识的陶瓷' : text(result.name) || [text(result.category), text(result.shape)].filter(Boolean).join('') || (result.status === 'uncertain' ? '这张图片尚难判断' : '陶瓷识别记录')
  const date = new Date(record.createdAt); const pad = value => String(value).padStart(2, '0')
  return { id: record.id, assetId: record.assetId, title, status: result.status, statusLabel, tags: strings(result.tags).slice(0, 3), summary: [strings(result.patterns).join('、'), text(result.glazeDescription), text(result.technique)].filter(Boolean).join(' · ') || strings(result.observations).join('；'), dateLabel: record.createdAt ? `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` : '较早的识瓷记录', imagePath: '', imageWarning: '', imageLoading: true }
}

Page({
  data: { media: resolveMedia({ paper: '/assets/backgrounds/home-paper.png', header: '/assets/backgrounds/video-classroom-header.jpg' }), records: [], loading: true, loadingImages: false, error: '', deleteError: '', deletingId: '', navTop: 30, navHeight: 32, headerHeight: 80, brandTop: 92, heroHeight: 218, safeBottom: 0 },
  onLoad() {
    this._history = createIdentifyHistory(wx); this._service = createCloudService(wx); this._revision = 0; this._visible = true; this._unloaded = false
    this.setData(metrics())
  },
  onShow() { this._visible = true; return this.refresh() },
  onHide() { this._visible = false; this._revision += 1; this._deleteFlight = null },
  onUnload() { this._visible = false; this._unloaded = true; this._revision += 1; this._deleteFlight = null },
  onResize() { this.setData(metrics()) },
  _current(revision) { return this._visible && !this._unloaded && this._revision === revision },
  async refresh() {
    if (!this._visible || this._unloaded) return
    const revision = ++this._revision
    this.setData({ loading: true, error: '', loadingImages: false, deleteError: '', deletingId: '' })
    let records
    try { records = this._history.list().map(viewRecord) }
    catch (_) { if (this._current(revision)) this.setData({ records: [], loading: false, error: '本地识瓷记录读取失败，请重试。' }); return }
    this.setData({ records, loading: false, loadingImages: records.length > 0 })
    return this._resolveImages(records.map(item => item.assetId), revision)
  },
  async _resolveImages(assetIds, revision) {
    const ids = Array.from(new Set(assetIds.filter(Boolean)))
    for (let offset = 0; offset < ids.length; offset += 20) {
      if (!this._current(revision)) return
      const batch = ids.slice(offset, offset + 20); let assets = []
      try { assets = await this._service.resolveAssets(batch) } catch (_) {}
      if (!this._current(revision)) return
      const resolved = new Map((Array.isArray(assets) ? assets : []).filter(asset => asset && batch.includes(asset.assetId) && /^https:\/\//i.test(asset.url)).map(asset => [asset.assetId, asset.url]))
      this.setData({ records: this.data.records.map(record => batch.includes(record.assetId) ? { ...record, imagePath: resolved.get(record.assetId) || '', imageLoading: false, imageWarning: resolved.has(record.assetId) ? '' : '图片暂时无法加载，可重试' } : record) })
    }
    if (this._current(revision)) this.setData({ loadingImages: false })
  },
  retryImages(event) {
    if (!this._visible || this._unloaded || this.data.loadingImages) return Promise.resolve()
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const records = this.data.records.filter(record => (!id || record.id === id) && !record.imagePath)
    if (!records.length) return Promise.resolve()
    const selected = new Set(records.map(record => record.id)); const revision = ++this._revision
    this.setData({ loadingImages: true, records: this.data.records.map(record => selected.has(record.id) ? { ...record, imageLoading: true, imageWarning: '' } : record) })
    return this._resolveImages(records.map(record => record.assetId), revision)
  },
  onImageError(event) {
    if (!this._visible || this._unloaded) return
    const { id, url } = event.currentTarget.dataset
    this.setData({ records: this.data.records.map(record => record.id === id && record.imagePath === url ? { ...record, imagePath: '', imageLoading: false, imageWarning: '图片链接已失效，请重试加载' } : record) })
  },
  deleteRecord(event) {
    if (!this._visible || this._unloaded) return Promise.resolve()
    if (this._deleteFlight) return this._deleteFlight
    const id = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id
    if (!this.data.records.some(record => record.id === id)) return Promise.resolve()
    const revision = this._revision
    this.setData({ deletingId: id, deleteError: '' })
    const flight = (async () => {
      try {
        if (!await confirmDelete() || !this._current(revision)) return
        this._history.remove(id)
        const records = this.data.records.filter(record => record.id !== id)
        this.setData({ records, deleteError: '', loadingImages: records.length > 0 && this.data.loadingImages })
      } catch (error) {
        if (this._current(revision)) this.setData({ deleteError: error && error.message || '本地识瓷记录删除失败，请重试。' })
      } finally {
        if (this._deleteFlight === flight) {
          this._deleteFlight = null
          if (this._visible && !this._unloaded) this.setData({ deletingId: '' })
        }
      }
    })()
    this._deleteFlight = flight
    return flight
  },
  openRecord(event) {
    if (this._deleteFlight) return
    const id = event.currentTarget.dataset.id
    if (this.data.records.some(record => record.id === id)) wx.navigateTo({ url: `/pages/ai-identify/index?recordId=${encodeURIComponent(id)}` })
  },
  goIdentify() { wx.redirectTo({ url: '/pages/ai-identify/index' }) },
  goBack() { if (typeof getCurrentPages === 'function' && getCurrentPages().length > 1) wx.navigateBack({ delta: 1 }); else this.goIdentify() }
})
