const { resolveMedia } = require('../../utils/static-media')
const catalog = resolveMedia(require('../../data/ai-create'))
const storage = require('../../utils/storage')
const { go } = require('../../utils/navigation')
const { buildGenerationRequest } = require('../../utils/ai-generation')
const { createCloudService, createRequestId } = require('../../utils/cloud-service')
const { createTaskState, confirmUnknownCreation } = require('../../utils/ai-task-state')
const { generationCases } = resolveMedia(require('../../data/showcase'))
const visuals = resolveMedia(require('../../data/ai-creation-visuals'))

const maxPromptLength = 200
const defaultStyle = 'qinghua'
const tabs = [
  { id: 'home', name: '首页' },
  { id: 'museum', name: '瓷馆' },
  { id: 'workshop', name: '工坊' },
  { id: 'challenge', name: '挑战' },
  { id: 'profile', name: '我的' }
].map((tab) => ({
  ...tab,
  icon: `/assets/icons/tab-${tab.id}.png`,
  iconActive: `/assets/icons/tab-${tab.id}-active.png`,
  url: `/pages/${tab.id}/index`
}))

function readWindowInfo() {
  for (const method of ['getWindowInfo', 'getSystemInfoSync']) {
    if (typeof wx[method] !== 'function') continue
    try {
      const info = wx[method]()
      if (info && typeof info === 'object') return info
    } catch (error) {
      // Older clients may expose a window API that is unavailable at runtime.
    }
  }
  return {}
}

function safeMetrics(size) {
  const windowInfo = readWindowInfo()
  const width = Number(size && size.windowWidth || windowInfo.windowWidth)
  const scale = (Number.isFinite(width) && width > 0 ? width : 375) / 750
  const statusHeight = Number(windowInfo.statusBarHeight)
  const statusBarHeight = Number.isFinite(statusHeight) && statusHeight > 0 ? statusHeight : 24
  let navTop = statusBarHeight + 6
  let navHeight = 32

  if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      const height = menu && (menu.height || menu.bottom - menu.top)
      if (menu && Number.isFinite(menu.top) && menu.top >= statusBarHeight && Number.isFinite(height) && height > 0) {
        navTop = menu.top
        navHeight = height
      }
    } catch (error) {
      // Retain the status-bar-safe fallback when capsule metrics are unavailable.
    }
  }

  const brandTop = navTop + navHeight + 12 * scale
  const windowHeight = Number(size && size.windowHeight || windowInfo.windowHeight)
  const safeAreaBottom = windowInfo.safeArea && windowInfo.safeArea.bottom
  const safeBottom = Number.isFinite(windowHeight) && windowHeight > 0 && Number.isFinite(safeAreaBottom) && safeAreaBottom >= 0 && safeAreaBottom <= windowHeight
    ? windowHeight - safeAreaBottom
    : 0
  return { statusBarHeight, navTop, navHeight, brandTop, taglineTop: navTop + navHeight + 24 * scale, heroHeight: navTop + navHeight + 240 * scale, safeBottom }
}

function isDraft(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function getDataset(event) {
  return event && event.currentTarget && event.currentTarget.dataset
}

function showToast(title) {
  if (typeof wx.showToast === 'function') wx.showToast({ title, icon: 'none' })
}

function styleState(styleId) {
  const style = catalog.styles.find((item) => item.id === styleId) || catalog.styles.find((item) => item.id === defaultStyle)
  return { selectedStyle: style.id, selectedStyleName: style.name, selectedStyleSummary: style.summary }
}

function recommendationId(prompt, styleId) {
  const recommendation = catalog.recommendations.find((item) => item.prompt === prompt && item.styleId === styleId)
  return recommendation ? recommendation.id : ''
}

function initialEditor() {
  return { prompt: '', promptLength: 0, selectedRecommendation: '', ...styleState(defaultStyle) }
}

Page({
  data: {
    prompt: '',
    promptLength: 0,
    selectedRecommendation: '',
    recommendations: catalog.recommendations,
    visuals,
    ...styleState(defaultStyle),
    styles: catalog.styles,
    examples: catalog.examples,
    keywords: catalog.keywordBatches[0],
    tabs,
    statusBarHeight: 24,
    navTop: 30,
    navHeight: 32,
    brandTop: 68,
    taglineTop: 98,
    heroHeight: 182,
    safeBottom: 0,
    submitting: false,
    recoveryPending: false,
    generationError: '',
    activeTaskId: '',
    activeTaskPending: false,
    activeTaskUnknown: false,
    confirmingNewCreation: false,
    experienceMode: 'live',
    generationCases
  },

  onLoad() {
    this._platform = wx
    this._service = createCloudService(this._platform)
    this._taskState = createTaskState(this._platform)
    this._unloaded = false
    this._openingResult = false
    this.setData({ ...safeMetrics(), ...initialEditor() })
    this._hasLoaded = true
    this.readActiveGeneration()
  },

  onShow() {
    if (!this._hasLoaded) return
    this._openingResult = false
    this.setData({ submitting: Boolean(this._submitting), ...initialEditor() })
    this.readActiveGeneration()
  },

  readActiveGeneration() {
    try {
      this._activeGeneration = this._taskState.read()
      this.setData({
        recoveryPending: Boolean(this._activeGeneration && !this._activeGeneration.taskId && ['submitting', 'unknown'].includes(this._activeGeneration.status)),
        activeTaskId: this._activeGeneration && this._activeGeneration.taskId || '',
        activeTaskPending: Boolean(this._activeGeneration && this._activeGeneration.taskId && ['queued', 'running', 'storing'].includes(this._activeGeneration.status)),
        activeTaskUnknown: Boolean(this._activeGeneration && this._activeGeneration.taskId && this._activeGeneration.status === 'unknown')
      })
    } catch (error) { /* Keep the blank editor usable if local task recovery is unavailable. */ }
  },

  onHide() {
    if (this._hasLoaded) this.saveDraft()
  },

  onUnload() {
    if (this._hasLoaded) this.saveDraft()
    this._unloaded = true
  },

  onResize(event) {
    this.setData(safeMetrics(event && event.size))
  },

  input(event) {
    const value = event && event.detail && event.detail.value
    if (typeof value !== 'string') return
    const prompt = value.slice(0, maxPromptLength)
    this.setData({ prompt, promptLength: prompt.length, selectedRecommendation: recommendationId(prompt, this.data.selectedStyle) })
  },

  selectStyle(event) {
    const dataset = getDataset(event)
    const style = catalog.styles.find((item) => item.id === (dataset && dataset.id))
    if (style) this.setData({ ...styleState(style.id), selectedRecommendation: recommendationId(this.data.prompt, style.id) })
  },

  addKeyword(event) {
    const dataset = getDataset(event)
    const keyword = dataset && dataset.keyword
    if (!this.data.keywords.includes(keyword) || this.data.prompt.includes(keyword)) return
    const prompt = this.data.prompt ? `${this.data.prompt}、${keyword}` : keyword
    if (prompt.length > maxPromptLength) {
      showToast('创意描述最多200字')
      return
    }
    this.setData({ prompt, promptLength: prompt.length, selectedRecommendation: '' })
  },

  refreshKeywords() {
    this._keywordBatch = ((this._keywordBatch || 0) + 1) % catalog.keywordBatches.length
    this.setData({ keywords: catalog.keywordBatches[this._keywordBatch] })
  },

  randomInspiration() {
    const candidates = catalog.inspirations.filter((item) => item.prompt !== this.data.prompt.trim())
    if (!candidates.length) return
    const inspiration = candidates[Math.floor(Math.random() * candidates.length)]
    this.setData({ prompt: inspiration.prompt, promptLength: inspiration.prompt.length, ...styleState(inspiration.styleId), selectedRecommendation: recommendationId(inspiration.prompt, inspiration.styleId) })
  },

  applyExample(event) {
    const dataset = getDataset(event)
    const example = catalog.examples.find((item) => item.id === (dataset && dataset.id))
    if (!example) return
    this.setData({ prompt: example.prompt, promptLength: example.prompt.length, ...styleState(example.styleId), selectedRecommendation: recommendationId(example.prompt, example.styleId) })
    showToast('灵感示例已套用')
  },

  applyRecommendation(event) {
    if (this._submitting || this._confirmingNewCreation) return
    const dataset = getDataset(event)
    const recommendation = catalog.recommendations.find((item) => item.id === (dataset && dataset.id))
    if (!recommendation) return
    this.setData({
      prompt: recommendation.prompt, promptLength: recommendation.prompt.length,
      ...styleState(recommendation.styleId), selectedRecommendation: recommendation.id
    })
  },

  saveDraft() {
    try {
      const draft = storage.get('aiCraftDraft', {})
      storage.set('aiCraftDraft', {
        ...(isDraft(draft) ? draft : {}),
        prompt: this.data.prompt,
        selectedStyle: this.data.selectedStyle,
        generationRequest: buildGenerationRequest(this.data.prompt, this.data.selectedStyle)
      })
      return true
    } catch (error) {
      showToast('保存失败，请重试')
      return false
    }
  },

  async generate() {
    if (this._submitting || this._openingResult || this._confirmingNewCreation) return
    if (this.data.recoveryPending) return this.retryGeneration()
    if ((this.data.activeTaskPending && this.data.activeTaskId) || this._existingTaskPending) {
      this.saveDraft()
      return this.openRecentTask()
    }
    return this.newCreation()
  },

  async newCreation() {
    if (this._submitting || this._openingResult || this._confirmingNewCreation) return
    if ((this.data.activeTaskPending && this.data.activeTaskId) || this._existingTaskPending) return this.openRecentTask()
    if (!this.data.prompt.trim()) {
      showToast('请先填写创意描述')
      return
    }
    if (!this.saveDraft()) return
    const request = buildGenerationRequest(this.data.prompt, this.data.selectedStyle)
    const previous = this._activeGeneration
    if (previous && ['submitting', 'unknown'].includes(previous.status)) {
      const consentToken = previous.taskId || previous.clientRequestId
      if (previous.newCreationConsentFor !== consentToken) {
        this._confirmingNewCreation = true
        this.setData({ confirmingNewCreation: true })
        let confirmed
        try { confirmed = await confirmUnknownCreation(this._platform || wx) }
        finally { this._confirmingNewCreation = false; this.setData({ confirmingNewCreation: false }) }
        if (!confirmed || this._unloaded) return
      }
    }
    const active = {
      clientRequestId: createRequestId('generation'), status: 'submitting',
      input: { userPrompt: request.userPrompt, styleId: request.styleId, styleName: request.styleName }
    }
    return this.submitGeneration(active)
  },

  async retryGeneration() {
    if (this._submitting || this._openingResult || this._confirmingNewCreation || !this._activeGeneration || this._activeGeneration.taskId) return
    return this.submitGeneration(this._activeGeneration)
  },

  async submitGeneration(active) {
    this._submitting = true
    this.setData({ submitting: true, generationError: '' })
    const platform = this._platform || wx
    this._service = this._service || createCloudService(platform)
    this._taskState = this._taskState || createTaskState(platform)
    // Persist the immutable submission before calling a service that may charge.
    try {
      this._activeGeneration = this._taskState.write({ ...active, status: 'submitting' })
    } catch (error) {
      this._submitting = false
      this.setData({ submitting: false, generationError: '任务保存失败，请重试' })
      showToast('任务保存失败，请重试')
      return
    }
    try {
      const result = await this._service.callAI('generation.create', {
        clientRequestId: active.clientRequestId,
        userPrompt: active.input.userPrompt,
        styleId: active.input.styleId
      })
      if (!result || typeof result.taskId !== 'string' || !result.taskId) throw Object.assign(new Error('服务响应异常，请查询原任务'), { code: 'INVALID_RESPONSE', retryable: true })
      this._activeGeneration = { ...active, taskId: result.taskId, status: result.status || 'queued' }
      try { this._taskState.write(this._activeGeneration) }
      catch (error) { this.setData({ generationError: '任务已提交，本地记录保存失败' }) }
      this.setData({ activeTaskId: result.taskId, activeTaskPending: ['queued', 'running', 'storing'].includes(result.status), activeTaskUnknown: result.status === 'unknown', recoveryPending: false })
      this.navigateToResult(result.taskId)
    } catch (error) {
      const uncertain = ['NETWORK_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'MODEL_TIMEOUT', 'MODEL_INVALID_RESPONSE', 'RESULT_UNKNOWN', 'IDEMPOTENCY_CONFLICT'].includes(error.code)
      this._existingTaskPending = error.code === 'GENERATION_IN_PROGRESS'
      this._activeGeneration = { ...active, status: uncertain ? 'unknown' : 'failed' }
      try { this._taskState.write(this._activeGeneration) } catch (storageError) { /* Keep the same in-memory request for recovery. */ }
      this.setData({
        recoveryPending: uncertain,
        generationError: uncertain ? '连接中断，任务可能已提交。请恢复原任务，避免重复生成。' : error.message || '生成服务暂时不可用，请稍后重试'
      })
    } finally {
      this._submitting = false
      // Keep the submission screen visible throughout the native page transition.
      if (!this._openingResult) this.setData({ submitting: false })
    }
  },

  navigateToResult(taskId) {
    if (this._unloaded || this._openingResult || typeof taskId !== 'string' || !taskId) return
    this._openingResult = true
    this.setData({ submitting: true })
    const platform = this._platform || wx
    const url = `/pages/ai-result/index?taskId=${encodeURIComponent(taskId)}`
    const message = '任务已提交，请点击查看最近任务继续'
    let redirectStarted = false
    let finished = false
    const opened = () => {
      if (finished || this._unloaded) return
      finished = true
      if (!this._unloaded && this.data.generationError === message) this.setData({ generationError: '' })
    }
    const failed = () => {
      if (finished || this._unloaded) return
      finished = true
      this._openingResult = false
      this.setData({ submitting: false, generationError: message })
    }
    const redirect = () => {
      if (finished || redirectStarted || this._unloaded) return
      redirectStarted = true
      try {
        const navigation = platform.redirectTo({ url, success: opened, fail: failed })
        if (navigation && typeof navigation.catch === 'function') navigation.catch(failed)
      } catch (error) { failed() }
    }
    try {
      const navigation = platform.navigateTo({ url, success: opened, fail: redirect })
      if (navigation && typeof navigation.catch === 'function') navigation.catch(redirect)
    } catch (error) { redirect() }
  },

  viewWorks() {
    if (this._submitting || this._openingResult || this._confirmingNewCreation) return
    go('/pages/works/index?type=ai')
  },

  async openRecentTask() {
    if (this._submitting || this._openingResult || this._confirmingNewCreation) return
    if (this.data.activeTaskId) {
      this.navigateToResult(this.data.activeTaskId)
      return
    }
    if (this.data.recoveryPending) return this.retryGeneration()
    try {
      const result = await (this._service || createCloudService(wx)).callAI('generation.findRecent', {})
      const task = result.tasks && result.tasks[0]
      if (task && task.taskId) {
        this._existingTaskPending = false
        this._activeGeneration = {
          clientRequestId: this._activeGeneration && this._activeGeneration.clientRequestId || createRequestId('recent'),
          taskId: task.taskId, input: task.input, status: task.status
        }
        try { this._taskState.write(this._activeGeneration) } catch (error) { /* Viewing a server task does not require local storage. */ }
        this.setData({ activeTaskId: task.taskId, activeTaskPending: ['queued', 'running', 'storing'].includes(task.status) })
        this.navigateToResult(task.taskId)
      }
      else showToast('还没有生成任务，写下你的创意吧')
    } catch (error) { this.setData({ generationError: error.message }) }
  },

  selectExperience(event) {
    const dataset = getDataset(event)
    if (dataset && ['live', 'showcase'].includes(dataset.mode)) this.setData({ experienceMode: dataset.mode })
  },

  openCase(event) {
    const dataset = getDataset(event)
    if (dataset && generationCases.some((item) => item.id === dataset.id)) go(`/pages/ai-result/index?caseId=${encodeURIComponent(dataset.id)}`)
  },

  onTabTap(event) {
    const dataset = getDataset(event)
    if (!dataset) return
    const tab = dataset.url
      ? tabs.find((item) => item.url === dataset.url)
      : tabs.find((item) => item.id === dataset.id)
    if (tab) go(tab.url)
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 })
      return
    }
    go('/pages/workshop/index')
  }
})
