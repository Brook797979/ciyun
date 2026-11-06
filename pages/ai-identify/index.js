const { resolveMedia } = require('../../utils/static-media')
const { createCloudService, createRequestId } = require('../../utils/cloud-service')
const { createIdentifyHistory } = require('../../utils/ai-identify-history')
const { createResultView } = require('../../utils/identify-result')
const ceramics = resolveMedia(require('../../data/ceramics'))
const { identificationCases = [] } = resolveMedia(require('../../data/showcase'))
const STORAGE_KEY = 'aiIdentifySessionV1'
const uncertainCodes = ['NETWORK_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'MODEL_TIMEOUT', 'RESULT_UNKNOWN']
function confirmRestart() {
  if (typeof wx.showModal !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    try {
      const pending = wx.showModal({ title: '重新识瓷', content: '上次结果未确认，再次请求可能额外计费。是否继续？', confirmText: '继续', cancelText: '取消', success: result => resolve(!!result.confirm), fail: () => resolve(false) })
      if (pending && typeof pending.then === 'function') pending.then(result => resolve(!!result.confirm), () => resolve(false))
    } catch (_) { resolve(false) }
  })
}
const text = value => typeof value === 'string' ? value.trim() : ''
function resultView(value) {
  return createResultView(value, ceramics)
}
function metrics() {
  let info = {}; let capsule = {}
  try { info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {} } catch (_) {}
  const statusBarHeight = Number(info.statusBarHeight) || 24
  try { capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() || {} : {} } catch (_) {}
  const navTop = Number(capsule.top) >= statusBarHeight ? Number(capsule.top) : statusBarHeight + 6
  const navHeight = Number(capsule.height) > 0 ? Number(capsule.height) : 32
  const bottom = info.safeArea && info.safeArea.bottom
  return { navTop, navHeight, headerHeight: navTop + navHeight + 18, safeBottom: typeof bottom === 'number' && bottom > 0 && bottom <= info.windowHeight ? info.windowHeight - bottom : 0 }
}
Page({
  data: { mode: 'live', caseLabel: '预生成展示案例 · 整理示例', cases: identificationCases, selectedCase: null, imagePath: '', assetId: '', imageWarning: '', status: 'empty', busy: false, result: null, resultTitle: '', resultName: '', resultTags: [], featureCards: [], relatedCeramic: null, error: '', errorCode: '', canRetry: false, requestId: '', recordId: '', fromHistory: false, historySaved: false, navTop: 30, navHeight: 32, headerHeight: 80, safeBottom: 0, media: resolveMedia({ hero: '/assets/backgrounds/video-classroom-header.jpg', paper: '/assets/backgrounds/home-paper.png' }) },
  onLoad(options = {}) {
    this._service = createCloudService(wx); this._history = createIdentifyHistory(wx); this._loaded = true; this._canSave = true; this._visible = true; this._revision = 0; this.setData(metrics())
    if (text(options.recordId)) {
      this._historyView = true
      this.setData({ fromHistory: true, recordId: text(options.recordId) })
      try {
        const record = this._history.get(options.recordId)
        if (!record) throw new Error('这条识别记录已不存在，请返回记录列表。')
        this.setData({ ...resultView(record.result), imagePath: record.imagePath || '', assetId: record.assetId, requestId: record.requestId, status: 'succeeded', historySaved: true })
      } catch (error) { this.setData({ status: 'failed', error: error.message || '识别记录暂时无法读取。' }) }
      return
    }
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const imagePath = text(saved.imagePath); const active = saved.active
        if (active && text(active.assetId) && text(active.clientRequestId) && imagePath) this._active = { assetId: active.assetId, clientRequestId: active.clientRequestId, imagePath, status: ['running', 'unknown', 'failed'].includes(active.status) ? active.status : 'running' }
        this.setData({ imagePath, assetId: text(saved.assetId) || this._active && this._active.assetId || '', status: this._active ? this._active.status : imagePath ? 'ready' : 'empty', requestId: this._active ? this._active.clientRequestId : '', canRetry: !!this._active })
        if (!this._active && saved.result) this.setData({ ...resultView(saved.result), status: 'succeeded' })
      }
    } catch (_) { this._canSave = false; this.setData({ storageWarning: '本地记录读取失败，当前体验仍可使用，但暂时无法保存恢复记录。' }) }
  },
  async onShow() { this._visible = true; if (this.data.mode !== 'live') return; await this._refreshImage(); if (this._active) return this.retry() },
  onHide() { this._visible = false; this._stopPolling(); this._save() },
  onUnload() { this._visible = false; this._unloaded = true; this._stopPolling(); this._save() },
  onResize() { this.setData(metrics()) },
  _save() {
    if (!this._loaded || !this._canSave || this._historyView) return
    try { wx.setStorageSync(STORAGE_KEY, { imagePath: this._liveSnapshot ? this._liveSnapshot.imagePath : this.data.imagePath, assetId: this._liveSnapshot ? this._liveSnapshot.assetId : this.data.assetId, result: this._liveSnapshot ? this._liveSnapshot.result : this.data.mode === 'live' ? this.data.result : null, active: this._active || null }) } catch (_) { if (!this._unloaded) this.setData({ storageWarning: '本地记录未能保存，离开后可能需要重新选择图片。' }) }
  },
  async _refreshImage() {
    const assetId = this.data.assetId; const revision = this._revision
    if (!assetId) return
    try {
      const assets = await this._service.resolveAssets([assetId]); const asset = assets.find(item => item.assetId === assetId)
      if (this._current(revision) && this.data.assetId === assetId && asset && typeof asset.url === 'string' && /^https:\/\//.test(asset.url)) { this._imageExpiresAt = Number(asset.expiresAt) || 0; this.setData({ imagePath: asset.url, imageWarning: '' }); this._save() }
    } catch (_) { if (this._current(revision) && this.data.assetId === assetId) this.setData({ imageWarning: '图片预览暂未恢复，可以重试加载或重新选择图片。' }) }
  },
  refreshImage() { return this._refreshImage() },
  _stopPolling() { if (this._timer) clearTimeout(this._timer); this._timer = null },
  _schedule() { this._stopPolling(); if (this._visible && this.data.mode === 'live' && this._active && this._active.status === 'running') this._timer = setTimeout(() => this.retry(), 4000) },
  chooseCamera() { return this.choose(['camera']) },
  chooseAlbum() { return this.choose(['album']) },
  choose(sources) {
    if (this._choosing) return this._choosing
    const active = this._active; const revision = this._revision
    const picker = typeof wx.chooseMedia === 'function' ? 'chooseMedia' : 'chooseImage'
    if (typeof wx[picker] !== 'function') { this.setData({ error: '当前环境无法选择图片，请在微信中打开。' }); return Promise.resolve() }
    const choosing = (async () => {
      if (active && active.status === 'unknown') {
        if (!await confirmRestart()) return
        if (!this._current(revision) || this._active !== active) return
      }
      return new Promise(resolve => {
        const sourceType = Array.isArray(sources) ? sources.filter(item => ['album', 'camera'].includes(item)) : ['album', 'camera']
        const options = { count: 1, sourceType: sourceType.length ? sourceType : ['album', 'camera'], success: response => {
          const imagePath = picker === 'chooseMedia' ? response.tempFiles && response.tempFiles[0] && response.tempFiles[0].tempFilePath : response.tempFilePaths && response.tempFilePaths[0]
          if (text(imagePath)) {
            if (this._unloaded) { resolve(); return }
            this._revision += 1; this._active = null; this._liveSnapshot = null; this._historyView = false; this._imageExpiresAt = 0; this._stopPolling()
            this.setData({ mode: 'live', selectedCase: null, fromHistory: false, recordId: '', historySaved: false, imagePath, assetId: '', imageWarning: '', status: 'ready', busy: false, result: null, resultName: '', resultTags: [], featureCards: [], relatedCeramic: null, error: '', errorCode: '', canRetry: false, requestId: '', storageWarning: '' }); this._save()
          }
          resolve()
        }, fail: error => { if (!/cancel/i.test(error && error.errMsg || '')) this.setData({ error: '图片选择失败，请再试一次。' }); resolve() } }
        if (picker === 'chooseMedia') options.mediaType = ['image']
        try { wx[picker](options) } catch (_) { this.setData({ error: '图片选择失败，请再试一次。' }); resolve() }
      })
    })()
    this._choosing = choosing; choosing.then(() => { if (this._choosing === choosing) this._choosing = null }); return choosing
  },
  async previewImage() {
    const revision = this._revision
    const isPrivate = this.data.mode === 'live' && this.data.assetId
    if (isPrivate && this._imageExpiresAt && this._imageExpiresAt <= Date.now()) await this._refreshImage()
    if (revision !== this._revision || this._unloaded || isPrivate && this._imageExpiresAt && this._imageExpiresAt <= Date.now()) return
    if (this.data.imagePath && typeof wx.previewImage === 'function') wx.previewImage({ current: this.data.imagePath, urls: [this.data.imagePath] })
  },
  startIdentify() { return this.data.status === 'failed' && this._active ? this.restart() : this.analyze() },
  analyze() {
    if (this.data.mode !== 'live') return Promise.resolve()
    if (this._restartFlight) return this._restartFlight
    if (this._flight && this._flight.revision === this._revision) return this._flight.promise
    if (!this.data.imagePath) { this.setData({ error: '请先选择一张陶瓷图片。' }); return Promise.resolve() }
    if (this._active) return this.retry()
    const revision = this._revision; const imagePath = this.data.imagePath; const clientRequestId = createRequestId('identify')
    this.setData({ busy: true, status: 'uploading', error: '', errorCode: '', canRetry: false, requestId: clientRequestId })
    const promise = (async () => {
      try {
        const asset = await this._service.uploadImage(imagePath, 'identify')
        if (!this._current(revision)) return
        if (!asset || !text(asset.assetId)) throw new Error('图片上传未返回有效资源，请重试。')
        this._active = { assetId: asset.assetId, fileId: asset.fileId || '', clientRequestId, imagePath, status: 'running' }; this.setData({ assetId: asset.assetId }); this._save()
        await this._request(revision)
      } catch (error) { if (this._current(revision)) this._failure(error) }
      finally { if (this._current(revision)) this.setData({ busy: false }); if (this._flight && this._flight.promise === promise) this._flight = null }
    })()
    this._flight = { revision, promise }; return promise
  },
  _current(revision) { return revision === this._revision && !this._unloaded && this.data.mode === 'live' },
  retry() {
    if (this.data.mode !== 'live') return Promise.resolve()
    if (this._flight && this._flight.revision === this._revision) return this._flight.promise
    if (!this._active) return this.analyze()
    const revision = this._revision; this.setData({ busy: true, error: '', canRetry: false })
    const promise = this._request(revision).catch(error => { if (this._current(revision)) this._failure(error) }).finally(() => { if (this._current(revision)) this.setData({ busy: false }); if (this._flight && this._flight.promise === promise) this._flight = null })
    this._flight = { revision, promise }; return promise
  },
  restart() {
    if (this.data.mode !== 'live' || this._unloaded) return Promise.resolve()
    if (this._restartFlight) return this._restartFlight
    if (this._flight && this._flight.revision === this._revision) return this._flight.promise
    const active = this._active; const revision = this._revision
    if (!active) return this.analyze()
    if (active.status === 'running') return this.retry()
    const promise = (async () => {
      if (active.status === 'unknown' && !await confirmRestart()) return
      if (!this._current(revision) || this._active !== active) return
      if (active.status === 'running') return this.retry()
      this._stopPolling()
      this._active = { ...active, status: 'running', clientRequestId: createRequestId('identify') }
      this.setData({ result: null, featureCards: [], relatedCeramic: null, error: '', errorCode: '' }); this._save()
      await this.retry()
    })().finally(() => { if (this._restartFlight === promise) this._restartFlight = null })
    this._restartFlight = promise; return promise
  },
  async _request(revision) {
    const active = this._active; if (!active) return
    this.setData({ status: 'running', requestId: active.clientRequestId })
    const response = await this._service.callAI('identify.analyze', { assetId: active.assetId, clientRequestId: active.clientRequestId })
    if (!this._current(revision) || this._active !== active) return
    if (response && response.status === 'succeeded') {
      const view = resultView(response.result); this._active = null
      this.setData({ ...view, status: 'succeeded', error: '', canRetry: false, requestId: response.requestId || active.clientRequestId }); this._save()
      try {
        const record = this._history.save({ requestId: response.requestId || active.clientRequestId, assetId: active.assetId, fileId: active.fileId || '', result: view.result })
        this.setData({ recordId: record.id, historySaved: true, storageWarning: '' })
      } catch (_) { this.setData({ historySaved: false, storageWarning: '识别结果已生成，但识别记录未能保存，请检查本机存储空间。' }) }
    } else if (response && response.status === 'running') {
      active.status = 'running'; this.setData({ status: 'running', canRetry: true }); this._save(); this._schedule()
    } else if (response && response.status === 'unknown') {
      active.status = 'unknown'; this.setData({ status: 'unknown', canRetry: true, error: '这次识瓷状态暂未确认，可查询原请求；如需重新识别，请重新选择图片。' }); this._save()
    } else throw Object.assign(new Error(response && response.error && response.error.message || '识瓷服务返回异常，请重试查询。'), { code: response && response.status === 'failed' ? 'MODEL_ERROR' : 'INVALID_RESPONSE' }, response && response.error)
  },
  _failure(error) {
    const uncertain = !!this._active && uncertainCodes.includes(error && error.code)
    const status = uncertain ? 'unknown' : 'failed'
    if (this._active) this._active.status = status
    this.setData({ status, result: null, featureCards: [], relatedCeramic: null, error: uncertain ? `本次识瓷状态暂未确认：${error.message || '连接未确认'}。请查询原请求，或明确重新识瓷。` : error && error.message || '识瓷请求失败，可以重新识瓷。', errorCode: error && error.code || '', canRetry: true }); this._save()
  },
  showCases() {
    if (this.data.mode === 'live') this._liveSnapshot = { imagePath: this.data.imagePath, assetId: this.data.assetId, imageWarning: this.data.imageWarning, result: this.data.result, featureCards: this.data.featureCards, relatedCeramic: this.data.relatedCeramic, resultTitle: this.data.resultTitle, resultName: this.data.resultName, resultTags: this.data.resultTags, historySaved: this.data.historySaved, recordId: this.data.recordId, fromHistory: this.data.fromHistory, status: this.data.status, error: this.data.error, canRetry: this.data.canRetry, requestId: this.data.requestId }
    this._stopPolling(); this.setData({ mode: 'showcase', selectedCase: null, result: null, imagePath: '', busy: false, error: '', featureCards: [], relatedCeramic: null })
  },
  selectCase(event) { const id = event && event.currentTarget && event.currentTarget.dataset.id; const item = identificationCases.find(candidate => candidate.id === id && candidate.source === 'showcase'); if (!item || this.data.mode !== 'showcase') return; this.setData({ ...resultView(item.result), selectedCase: item, imagePath: item.image, status: 'succeeded' }) },
  returnToLive() { const snapshot = this._liveSnapshot; this._liveSnapshot = null; this.setData({ mode: 'live', selectedCase: null, result: null, imagePath: '', assetId: '', imageWarning: '', featureCards: [], relatedCeramic: null, error: '', status: 'empty', canRetry: false, ...(snapshot || {}) }); if (this._active) this.retry() },
  returnToIdentify() {
    this._revision += 1; this._active = null; this._liveSnapshot = null; this._historyView = false; this._imageExpiresAt = 0; this._stopPolling()
    this.setData({ mode: 'live', selectedCase: null, imagePath: '', assetId: '', imageWarning: '', status: 'empty', busy: false, result: null, resultTitle: '', resultName: '', resultTags: [], featureCards: [], relatedCeramic: null, error: '', errorCode: '', canRetry: false, requestId: '', recordId: '', fromHistory: false, historySaved: false, storageWarning: '' })
    this._save()
  },
  openRelated() { const item = this.data.relatedCeramic; if (item && ceramics.some(ceramic => ceramic.id === item.id)) wx.navigateTo({ url: `/pages/ceramic-detail/index?id=${encodeURIComponent(item.id)}` }) },
  ask() {
    const result = this.data.result; if (!result || result.status === 'not_ceramic') return
    const item = this.data.relatedCeramic
    const question = `图片观察提示（尚待核实）：${[result.shape, result.category, result.patterns.join('、'), result.glazeDescription].filter(Boolean).join('，')}。请简短介绍相关陶瓷文化。`.slice(0, 500)
    wx.navigateTo({ url: `/pages/ai-chat/index?question=${encodeURIComponent(question)}${item ? `&ceramicId=${encodeURIComponent(item.id)}` : ''}` })
  },
  openHistory() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const index = pages.slice(0, -1).map(page => page.route).lastIndexOf('pages/ai-identify-history/index')
    if (index >= 0 && typeof wx.navigateBack === 'function') return wx.navigateBack({ delta: pages.length - 1 - index })
    const method = this.data.fromHistory && typeof wx.redirectTo === 'function' ? 'redirectTo' : 'navigateTo'
    if (typeof wx[method] === 'function') wx[method]({ url: '/pages/ai-identify-history/index' })
  },
  goBack() {
    const home = () => { if (typeof wx.switchTab === 'function') wx.switchTab({ url: '/pages/home/index' }) }
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && typeof wx.navigateBack === 'function') {
      try { return wx.navigateBack({ delta: 1, fail: home }) } catch (_) { return home() }
    }
    return home()
  }
})
