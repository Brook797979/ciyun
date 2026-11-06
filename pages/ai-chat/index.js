const { resolveMedia } = require('../../utils/static-media')
const { createCloudService, createRequestId } = require('../../utils/cloud-service')
const { MAX_QUESTION, sanitizeHistory, sanitizeSession, sessionKey } = require('../../utils/ai-chat-history')
const { ARCHIVE_KEY, sanitizeMessages, sanitizeArchive, upsertConversation, createConversation } = require('../../utils/ai-chat-conversations')
const ceramics = resolveMedia(require('../../data/ceramics'))
const { chatCases = [] } = resolveMedia(require('../../data/showcase'))
const uncertainCodes = ['NETWORK_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'MODEL_TIMEOUT', 'RESULT_UNKNOWN']
const defaultQuestions = ['青花瓷为什么是蓝色的？', '缠枝莲纹有什么寓意？', '宋代五大名窑有哪些？', '传统陶瓷是如何烧制的？']

function confirmRestart() {
  if (typeof wx.showModal !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    try {
      const pending = wx.showModal({ title: '重新提问', content: '上次结果未确认，再次请求可能额外计费。是否继续？', confirmText: '继续', cancelText: '取消', success: result => resolve(!!result.confirm), fail: () => resolve(false) })
      if (pending && typeof pending.then === 'function') pending.then(result => resolve(!!result.confirm), () => resolve(false))
    } catch (_) { resolve(false) }
  })
}
function metrics(viewport = {}) {
  let info = {}; let capsule = {}
  try { info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {} } catch (_) {}
  const statusBarHeight = Number(info.statusBarHeight) || 24
  try { capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() || {} : {} } catch (_) {}
  const navTop = Number(capsule.top) >= statusBarHeight ? Number(capsule.top) : statusBarHeight + 6
  const navHeight = Number(capsule.height) > 0 ? Number(capsule.height) : 32
  const windowHeight = Number(viewport.height) > 0 ? Number(viewport.height) : Number(info.windowHeight) || 667
  const bottom = info.safeArea && info.safeArea.bottom
  // Keep the safe-area edge and its reference height in the same coordinate system.
  const safeHeight = [Number(info.screenHeight), Number(info.windowHeight), windowHeight].find(height => Number.isFinite(height) && height >= bottom)
  const safeBottom = typeof bottom === 'number' && bottom > 0 && safeHeight ? Math.max(0, safeHeight - bottom) : 0
  return { navTop, navHeight, headerHeight: navTop + navHeight + 100, windowHeight, windowWidth: Number(viewport.width) > 0 ? Number(viewport.width) : Number(info.windowWidth) || 375, safeBottom }
}
function timeLabel(value, withDate = false) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return withDate ? `${date.getMonth() + 1}月${date.getDate()}日 ${time}` : time
}
function sourcesFor(value) {
  const ids = new Set()
  return (Array.isArray(value) ? value : []).flatMap(source => {
    const item = source && ceramics.find(ceramic => ceramic.id === source.id)
    if (!item || ids.has(item.id)) return []
    ids.add(item.id)
    return [{ id: item.id, name: item.name, image: item.image }]
  }).slice(0, 2)
}
function eventId(event) { return event && event.currentTarget && event.currentTarget.dataset.id }
function freshConversation(archive, ceramicId) {
  let id = createRequestId('conversation')
  while (archive.conversations.some(item => item.id === id)) id = createRequestId('conversation')
  return createConversation(id, ceramicId)
}
function mergeMessages(newer, local) {
  const rounds = []; const ids = new Set()
  for (const messages of [newer, local]) {
    for (let index = 0; index < messages.length - 1; index += 2) {
      if (ids.has(messages[index].id)) continue
      ids.add(messages[index].id); rounds.push(messages.slice(index, index + 2))
    }
  }
  rounds.sort((left, right) => left[0].createdAt - right[0].createdAt)
  return sanitizeMessages(rounds.flat())
}

Page({
  data: {
    ceramicId: '', ceramic: null, conversationId: '', conversations: [], historyOpen: false,
    messages: [], viewMessages: [], hasConversation: false, input: '', inputLength: 0, pendingQuestion: '',
    status: 'idle', busy: false, error: '', errorCode: '', canRetry: false, requestId: '', sources: [], storageWarning: '',
    quickQuestions: defaultQuestions, mode: 'live', cases: chatCases, selectedCase: null, caseLabel: '预生成展示案例 · 整理示例',
    navTop: 30, navHeight: 32, headerHeight: 162, safeBottom: 0, windowHeight: 667, keyboardHeight: 0, keyboardVisible: false,
    composerHeight: 64, contentHeight: 441, scrollTarget: '', scrollTop: 0,
    headerImage: resolveMedia('/assets/backgrounds/video-classroom-header.jpg'), paperImage: '/assets/backgrounds/home-paper.png', robotImage: '/assets/ai-chat/porcelain-robot.png'
  },
  onLoad(options = {}) {
    this._service = createCloudService(wx); this._loaded = true; this._canSave = true; this._visible = true
    this._archive = sanitizeArchive(null); this._keyboardHeight = 0; this._composerBase = 64; this._pendingLegacy = null
    const layout = metrics(); this._fullWindowHeight = layout.windowHeight; this._windowWidth = layout.windowWidth
    let ceramicId = typeof options.ceramicId === 'string' ? options.ceramicId.slice(0, 80) : ''
    if (!ceramics.some(item => item.id === ceramicId)) ceramicId = ''
    let legacy = null
    try {
      this._archive = sanitizeArchive(wx.getStorageSync(ARCHIVE_KEY))
      if (!this._archive.conversations.some(item => item.ceramicId === ceramicId)) legacy = sanitizeSession(wx.getStorageSync(sessionKey(ceramicId)), ceramicId)
    } catch (_) {
      this._canSave = false
      this.setData({ storageWarning: '本地对话读取失败，当前仍可提问，但暂时无法保存对话。' })
    }
    if (legacy && (legacy.messages.length || legacy.active || legacy.input)) {
      const firstQuestion = legacy.messages.find(item => item.role === 'user')
      const title = (firstQuestion ? firstQuestion.text : legacy.active ? legacy.active.payload.question : legacy.input).slice(0, 24)
      const importedAt = Math.max(Date.now(), ...this._archive.conversations.map(item => item.updatedAt + 1))
      this._pendingLegacy = { ...createConversation(`legacy-${ceramicId || 'general'}`, ceramicId, importedAt), ...legacy, title }
      this._archive = upsertConversation(this._archive, this._pendingLegacy)
      try { wx.setStorageSync(ARCHIVE_KEY, this._archive); this._pendingLegacy = null }
      catch (_) { this.setData({ storageWarning: '旧对话暂未能归档，原记录仍保存在本机。' }) }
    }
    const conversation = freshConversation(this._archive, ceramicId)
    if (typeof options.question === 'string') {
      try { conversation.input = decodeURIComponent(options.question).slice(0, MAX_QUESTION) } catch (_) { conversation.input = options.question.slice(0, MAX_QUESTION) }
    }
    this.setData(layout); this._applyConversation(conversation); this._layout()
    this._keyboardHandler = event => { if (!this._unloaded) this.keyboardChange(event) }
    if (typeof wx.onKeyboardHeightChange === 'function') wx.onKeyboardHeightChange(this._keyboardHandler)
  },
  onReady() { this._layoutReady = true; this._fitViewport() },
  onShow() { this._visible = true; this._save(); if (this._layoutReady) this._fitViewport(); if (this._active && this.data.mode === 'live') return this.retry() },
  onHide() { this._visible = false; this._stopPolling(); this._save() },
  onUnload() {
    this._visible = false; this._unloaded = true; this._stopPolling(); this._save()
    if (this._keyboardHandler && typeof wx.offKeyboardHeightChange === 'function') wx.offKeyboardHeightChange(this._keyboardHandler)
  },
  onResize() { if (!this._unloaded) { this._viewport = null; this._layout(); this._fitViewport() } },
  _fitViewport() {
    if (this._unloaded || typeof wx.createSelectorQuery !== 'function') return
    const epoch = this._measureEpoch = (this._measureEpoch || 0) + 1
    const measure = () => {
      if (this._unloaded || epoch !== this._measureEpoch) return
      try {
        const query = wx.createSelectorQuery()
        query.selectViewport().boundingClientRect()
        // The fixed page fills the WebView independently of cached JS window dimensions.
        query.select('.chat-page').boundingClientRect()
        query.exec(rects => {
          if (this._unloaded || epoch !== this._measureEpoch || !Array.isArray(rects)) return
          const viewport = rects.find(rect => rect && Number.isFinite(rect.width) && rect.width > 0 && Number.isFinite(rect.height) && rect.height > 0)
          if (viewport) { this._viewport = { width: viewport.width, height: viewport.height }; this._layout() }
        })
      } catch (_) { /* CSS still fills the actual viewport when measurement is unavailable. */ }
    }
    if (typeof wx.nextTick === 'function') wx.nextTick(measure)
    else measure()
  },
  _layout() {
    const layout = metrics(this._viewport || {})
    if (layout.windowWidth !== this._windowWidth || (!this._keyboardHeight && (!this._inputFocused || layout.windowHeight >= this._fullWindowHeight))) this._fullWindowHeight = layout.windowHeight
    this._windowWidth = layout.windowWidth
    const viewportReduction = Math.max(0, this._fullWindowHeight - layout.windowHeight)
    const keyboardHeight = Math.max(0, (this._keyboardHeight || 0) - viewportReduction)
    const composerHeight = (this._composerBase || 64) + (this._keyboardHeight ? 0 : layout.safeBottom)
    this.setData({ ...layout, keyboardHeight, keyboardVisible: this._keyboardHeight > 0, composerHeight, contentHeight: Math.max(80, layout.windowHeight - layout.headerHeight - composerHeight - keyboardHeight) })
    this._scrollToBottom()
  },
  keyboardChange(event = {}) {
    const height = Number(event.detail ? event.detail.height : event.height)
    if (!Number.isFinite(height)) return
    this._keyboardHeight = Math.max(0, Math.min(height, this._fullWindowHeight || 1000)); this._layout(); if (this._layoutReady) this._fitViewport()
  },
  inputFocus(event) { this._inputFocused = true; if (event && event.detail && Number.isFinite(event.detail.height)) this.keyboardChange(event); this._scrollToBottom() },
  inputBlur() { this._inputFocused = false; this._save() },
  composerResize(event) {
    const height = Number(event && event.detail && event.detail.height)
    if (height > 0) { this._composerBase = Math.max(64, Math.min(110, height + 26)); this._layout() }
  },
  _scrollToBottom() {
    if (this._unloaded) return
    this._scrollVersion = (this._scrollVersion || 0) + 1
    this.setData({ scrollTarget: this._scrollVersion % 2 ? 'chat-end-a' : 'chat-end-b', scrollTop: (this.data.scrollTop || 0) + 10000 })
  },
  _refreshView() {
    const viewMessages = this.data.messages.map(message => ({ ...message, time: message.role === 'user' ? timeLabel(message.createdAt) : '', sources: message.role === 'assistant' ? sourcesFor(message.sources) : [] }))
    this.setData({ viewMessages, hasConversation: !!(viewMessages.length || this.data.pendingQuestion || this._active) })
    this._scrollToBottom()
  },
  _applyConversation(conversation) {
    this._conversation = conversation; this._active = conversation.active || null
    const ceramic = ceramics.find(item => item.id === conversation.ceramicId) || null
    this.setData({ conversationId: conversation.id, ceramicId: conversation.ceramicId, ceramic, messages: sanitizeMessages(conversation.messages), input: conversation.input || '', inputLength: (conversation.input || '').length, pendingQuestion: this._active ? this._active.payload.question : '', status: this._active ? this._active.status : 'idle', canRetry: !!this._active && this._active.status !== 'failed', requestId: this._active ? this._active.payload.clientRequestId : '', error: '', errorCode: '', sources: [], mode: 'live', selectedCase: null, quickQuestions: ceramic ? [`${ceramic.name}有哪些值得看的细节？`, '它的纹样有什么寓意？', '它的釉色与工艺有什么特点？', '这件器物有什么文化故事？'] : defaultQuestions })
    this._refreshView(); this._historyList()
  },
  _historyList() {
    this.setData({ conversations: this._archive.conversations.filter(item => item.messages.length || item.active || item.input).map(item => ({ id: item.id, title: item.title, preview: item.active ? item.active.payload.question : item.messages.length ? item.messages[item.messages.length - 1].text.slice(0, 64) : item.input, time: timeLabel(item.updatedAt, true), ceramicName: (ceramics.find(ceramic => ceramic.id === item.ceramicId) || {}).name || '', activeLabel: item.active ? '有待确认的回答' : '' })) })
  },
  input(event) {
    const value = event && event.detail && event.detail.value
    if (typeof value !== 'string') return
    const input = value.slice(0, MAX_QUESTION); this.setData({ input, inputLength: input.length })
  },
  quickQuestion(event) {
    const id = eventId(event)
    if (!/^[0-3]$/.test(String(id)) || this.data.mode !== 'live' || this._flight || this._active) return Promise.resolve()
    const question = this.data.quickQuestions[Number(id)]
    if (typeof question !== 'string') return Promise.resolve()
    this.input({ detail: { value: question } }); return this.send()
  },
  _save() {
    if (!this._loaded || !this._canSave || !this._conversation) return
    if (!this.data.messages.length && !this._active && !this.data.input && !this._archive.conversations.some(item => item.id === this._conversation.id)) return
    try {
      let latest = sanitizeArchive(wx.getStorageSync(ARCHIVE_KEY))
      if (this._pendingLegacy) latest = upsertConversation(latest, this._pendingLegacy)
      const newer = latest.conversations.find(item => item.id === this._conversation.id && item.updatedAt > this._conversation.updatedAt)
      let messages = sanitizeMessages(this.data.messages)
      let input = this.data.input
      if (newer) {
        messages = mergeMessages(newer.messages, messages)
        const completed = active => active && messages.some(message => message.id === `${active.payload.clientRequestId}-user`)
        const localActive = completed(this._active) ? null : this._active
        const savedActive = completed(newer.active) ? null : newer.active
        const previousId = this._conversation.active && this._conversation.active.payload.clientRequestId
        const changedRequest = localActive && localActive.payload.clientRequestId !== previousId
        const chosen = changedRequest ? localActive : savedActive
        // Preserve an in-flight object's identity, but never revive a replaced request.
        if (chosen && localActive && chosen.payload.clientRequestId === localActive.payload.clientRequestId) {
          localActive.status = chosen.status; this._active = localActive
        } else this._active = chosen
        if (input === this._conversation.input) input = newer.input
        if (!this._unloaded) {
          this.setData({ messages, input, inputLength: input.length, pendingQuestion: this._active ? this._active.payload.question : '', status: this._active ? this._active.status : messages.length ? 'succeeded' : 'idle', canRetry: !!this._active && this._active.status !== 'failed' })
          this._refreshView()
        }
      }
      const now = Math.max(Date.now(), ...latest.conversations.map(item => item.updatedAt + 1))
      const firstQuestion = messages.find(item => item.role === 'user')
      this._conversation = { ...this._conversation, updatedAt: now, title: (firstQuestion ? firstQuestion.text : this._active ? this._active.payload.question : input || '新的对话').slice(0, 24), messages, input, active: this._active || null }
      this._archive = upsertConversation(latest, this._conversation)
      wx.setStorageSync(ARCHIVE_KEY, this._archive)
      if (this._pendingLegacy) {
        this._pendingLegacy = null
        if (!this._unloaded) this.setData({ storageWarning: '' })
      }
      this._historyList()
    } catch (_) { if (!this._unloaded) this.setData({ storageWarning: '本地对话未能保存，离开后可能无法恢复。' }) }
  },
  openHistory() {
    this._save()
    if (this._canSave) { try { this._archive = sanitizeArchive(wx.getStorageSync(ARCHIVE_KEY)) } catch (_) {} }
    if (this._pendingLegacy) this._archive = upsertConversation(this._archive, this._pendingLegacy)
    this._historyList(); this.setData({ historyOpen: true })
    if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard()
  },
  closeHistory() { this.setData({ historyOpen: false }) },
  noop() {},
  _canSwitch() {
    if (this._flight || this._restartFlight || (this._active && ['running', 'unknown'].includes(this._active.status))) {
      if (typeof wx.showToast === 'function') wx.showToast({ title: '请先确认当前回答', icon: 'none' })
      return false
    }
    return true
  },
  selectConversation(event) {
    if (!this._canSwitch()) return Promise.resolve()
    const id = eventId(event); this._save()
    const conversation = this._archive.conversations.find(item => item.id === id)
    if (!conversation) return Promise.resolve()
    this._stopPolling(); this._applyConversation(conversation); this.setData({ historyOpen: false }); this._save()
    return this._active ? this.retry() : Promise.resolve()
  },
  newConversation() {
    if (!this._canSwitch()) return
    this._save(); this._stopPolling(); this._applyConversation(freshConversation(this._archive, this.data.ceramicId)); this.setData({ historyOpen: false })
  },
  _stopPolling() { if (this._timer) clearTimeout(this._timer); this._timer = null },
  _schedule() { this._stopPolling(); if (this._visible && this.data.mode === 'live' && this._active && this._active.status === 'running') this._timer = setTimeout(() => this.retry(), 4000) },
  send() {
    if (this.data.mode !== 'live') return Promise.resolve()
    if (this._restartFlight) return this._restartFlight
    if (this._flight) return this._flight
    if (this._active && ['running', 'unknown'].includes(this._active.status)) return this.retry()
    const question = this.data.input.trim().slice(0, MAX_QUESTION)
    if (!question) return Promise.resolve()
    this._stopPolling()
    this._active = { status: 'running', createdAt: Date.now(), payload: { question, history: sanitizeHistory(this.data.messages, 1500), clientRequestId: createRequestId('chat'), ...(this.data.ceramicId ? { ceramicId: this.data.ceramicId } : {}) } }
    this.setData({ input: '', inputLength: 0, pendingQuestion: question, error: '', sources: [] }); this._refreshView(); this._save()
    return this.retry()
  },
  retry() {
    if (this.data.mode !== 'live') return Promise.resolve()
    if (this._flight) return this._flight
    if (!this._active) return Promise.resolve()
    const active = this._active
    this.setData({ busy: true, status: 'running', error: '', canRetry: false, pendingQuestion: active.payload.question, requestId: active.payload.clientRequestId }); this._refreshView()
    const promise = this._request(active).catch(error => {
      if (this._unloaded || this._active !== active) return
      const uncertain = uncertainCodes.includes(error && error.code)
      active.status = uncertain ? 'unknown' : 'failed'
      const failureMessage = error && error.code === 'MODEL_INVALID_RESPONSE' ? 'AI返回的内容格式异常，请重新提问' : error && error.message || '问答请求失败，可以重新提问。'
      this.setData({ status: active.status, error: uncertain ? `本次回答状态暂未确认：${error.message || '连接未确认'}。请查询原请求，或明确重新提问。` : failureMessage, errorCode: error && error.code || '', canRetry: uncertain }); this._save(); this._scrollToBottom()
    }).finally(() => {
      if (this._flight !== promise) return
      this._flight = null
      if (!this._unloaded) {
        this.setData({ busy: false })
        if (this._visible && this.data.mode === 'live' && this._active && this._active !== active) return this.retry()
      }
    })
    this._flight = promise; return promise
  },
  restart() {
    if (this.data.mode !== 'live' || this._unloaded) return Promise.resolve()
    if (this._restartFlight) return this._restartFlight
    if (this._flight) return this._flight
    const active = this._active
    if (!active) return this.send()
    if (active.status === 'running') return this.retry()
    const promise = (async () => {
      if (active.status === 'unknown' && !await confirmRestart()) return
      if (this._unloaded || this.data.mode !== 'live' || this._active !== active) return
      if (active.status === 'running') return this.retry()
      const question = this.data.input.trim().slice(0, MAX_QUESTION) || active.payload.question
      const history = question === active.payload.question ? active.payload.history : sanitizeHistory(this.data.messages, 1500)
      this._stopPolling()
      this._active = { status: 'running', createdAt: Date.now(), payload: { ...active.payload, question, history, clientRequestId: createRequestId('chat') } }
      this.setData({ input: '', inputLength: 0, pendingQuestion: question, error: '', errorCode: '', sources: [] }); this._refreshView(); this._save()
      await this.retry()
    })().finally(() => { if (this._restartFlight === promise) this._restartFlight = null })
    this._restartFlight = promise; return promise
  },
  async _request(active) {
    const response = await this._service.callAI('chat.answer', active.payload)
    if (this._unloaded || this._active !== active) return
    if (response && response.status === 'succeeded') {
      if (typeof response.answer !== 'string' || !response.answer.trim()) throw Object.assign(new Error('问答服务返回的内容不完整，请重试查询。'), { code: 'INVALID_RESPONSE' })
      const sources = sourcesFor(response.sources)
      const id = active.payload.clientRequestId
      const messages = sanitizeMessages([...this.data.messages, { role: 'user', text: active.payload.question, id: `${id}-user`, createdAt: active.createdAt || Date.now() }, { role: 'assistant', text: response.answer.trim(), id: `${id}-assistant`, createdAt: Date.now(), sources }])
      this._active = null; this.setData({ messages, sources, pendingQuestion: '', status: 'succeeded', error: '', errorCode: '', canRetry: false, requestId: response.requestId || id }); this._refreshView(); this._save()
      try {
        const assistantMessage = messages[messages.length - 1]
        require('../../utils/growth-progress').createGrowthProgress(wx).recordGrowthEvent('chat_answered', {
          id: assistantMessage.id, conversationId: this.data.conversationId, title: active.payload.question, createdAt: assistantMessage.createdAt
        })
      } catch (_) { /* Growth storage cannot turn a completed answer into a failure. */ }
    } else if (response && response.status === 'running') { active.status = 'running'; this.setData({ status: 'running', canRetry: true }); this._save(); this._schedule() }
    else if (response && response.status === 'unknown') { active.status = 'unknown'; this.setData({ status: 'unknown', error: '这次回答状态暂未确认，请查询原请求。', canRetry: true }); this._save() }
    else throw Object.assign(new Error(response && response.error && response.error.message || '问答服务返回异常，请重试查询。'), { code: response && response.status === 'failed' ? 'MODEL_ERROR' : 'INVALID_RESPONSE' }, response && response.error)
    this._scrollToBottom()
  },
  copyMessage(event) {
    const message = this.data.messages.find(item => item.id === eventId(event) && item.role === 'assistant')
    if (message && typeof wx.setClipboardData === 'function') wx.setClipboardData({ data: message.text })
  },
  previewSource(event) {
    const image = event && event.currentTarget && event.currentTarget.dataset.image
    if (typeof image === 'string' && ceramics.some(item => item.image === image) && typeof wx.previewImage === 'function') wx.previewImage({ current: image, urls: [image] })
  },
  showCases() { this._stopPolling(); this.setData({ mode: 'showcase', selectedCase: null }); this._scrollToBottom() },
  selectCase(event) { const item = chatCases.find(candidate => candidate.id === eventId(event) && candidate.source === 'showcase'); if (item && this.data.mode === 'showcase') this.setData({ selectedCase: item }) },
  returnToLive() { this.setData({ mode: 'live', selectedCase: null }); this._scrollToBottom(); if (this._active) return this.retry() },
  openSource(event) { const id = eventId(event); if (ceramics.some(item => item.id === id) && typeof wx.navigateTo === 'function') wx.navigateTo({ url: `/pages/ceramic-detail/index?id=${encodeURIComponent(id)}` }) },
  goBack() {
    this._save()
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (this.data.ceramicId && pages.length > 1 && typeof wx.navigateBack === 'function') wx.navigateBack({ delta: 1 })
    else if (typeof wx.switchTab === 'function') wx.switchTab({ url: '/pages/home/index' })
  }
})
