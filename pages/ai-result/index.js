const { resolveMedia } = require('../../utils/static-media')
const visuals = resolveMedia(require('../../data/ai-creation-visuals'))
const { createCloudService } = require('../../utils/cloud-service')
const { createTaskState, confirmUnknownCreation } = require('../../utils/ai-task-state')
const { saveWork } = require('../../utils/craft-works')
const { findGenerationCase } = require('../../data/showcase')
const { go } = require('../../utils/navigation')

const states = {
  queued: { statusTitle: '创意已入窑', statusMessage: '任务正在排队，你可以离开页面，稍后回来查看。' },
  running: { statusTitle: '正在绘就瓷韵', statusMessage: 'AI正在根据你的创意和所选风格生成设计。' },
  storing: { statusTitle: '正在收藏成图', statusMessage: '图像已生成，正在安全保存。保存完成后即可收藏作品。' },
  succeeded: { statusTitle: '灵感已成瓷', statusMessage: '你的瓷器作品已生成，点击图片可查看细节。' },
  failed: { statusTitle: '本次创作未完成', statusMessage: '生成失败，请返回调整创意后再次尝试。' },
  unknown: { statusTitle: '正在确认进度', statusMessage: '暂时无法确认任务状态，正在查询原任务，请勿重复提交。' }
}

function metrics(platform, size) {
  let info = {}
  let menu = {}
  try {
    const method = typeof platform.getWindowInfo === 'function' ? 'getWindowInfo' : 'getSystemInfoSync'
    if (typeof platform[method] === 'function') info = platform[method]() || {}
  } catch (error) { /* Use safe defaults on older clients. */ }
  try { if (typeof platform.getMenuButtonBoundingClientRect === 'function') menu = platform.getMenuButtonBoundingClientRect() || {} }
  catch (error) { /* Keep the status-bar-safe navigation position. */ }
  const statusBarHeight = Number.isFinite(info.statusBarHeight) && info.statusBarHeight > 0 ? info.statusBarHeight : 24
  const navTop = Number.isFinite(menu.top) && menu.top >= statusBarHeight ? menu.top : statusBarHeight + 6
  const navHeight = Number.isFinite(menu.height) && menu.height > 0 ? menu.height : 32
  const width = Number(size && size.windowWidth || info.windowWidth)
  const scale = (Number.isFinite(width) && width > 0 ? width : 375) / 750
  const bottom = info.safeArea && info.safeArea.bottom
  const safeBottom = Number.isFinite(info.windowHeight) && Number.isFinite(bottom) && bottom >= 0 && bottom <= info.windowHeight ? info.windowHeight - bottom : 0
  return { navTop, navHeight, brandTop: navTop + navHeight + 24 * scale, heroHeight: navTop + navHeight + 244 * scale, safeBottom }
}

// These captions describe the user's inspiration, rather than claiming to inspect the generated image.
function presentation(userPrompt, styleName) {
  const prompt = typeof userPrompt === 'string' ? userPrompt.trim().replace(/\s+/g, ' ') : ''
  const style = typeof styleName === 'string' && styleName.trim() ? styleName.trim() : '东方瓷艺'
  const themes = [
    { matches: /月/.test(prompt) && /荷|莲/.test(prompt), title: '月下莲华', subject: '月色与荷塘', mood: '清雅悠远' },
    { matches: /竹/.test(prompt), title: '竹影清风', subject: '青竹与清风', mood: '疏朗清逸' },
    { matches: /山水|远山|山居|山岚/.test(prompt), title: '山水清韵', subject: '山水', mood: '悠远宁静' },
    { matches: /花鸟|飞鸟|小鸟/.test(prompt), title: '花鸟春晓', subject: '花鸟', mood: '轻盈明媚' },
    { matches: /祥云|云纹/.test(prompt), title: '祥云瑞意', subject: '祥云纹样', mood: '祥和雅致' },
    { matches: /梅花|白梅|红梅/.test(prompt), title: '疏影梅香', subject: '梅花', mood: '清逸雅洁' },
    { matches: /荷|莲/.test(prompt), title: '莲池清韵', subject: '荷莲', mood: '清新静雅' }
  ]
  const theme = themes.find((item) => item.matches)
  if (theme) return { name: theme.title, intro: `以${theme.subject}为灵感，融入${style}的艺术语言，寄托${theme.mood}的东方意境。` }
  const subject = prompt.replace(/^(?:请)?(?:帮我)?(?:设计|生成|制作)(?:一件|一个|一只)?/, '').replace(/^[，,。\s]+|[，,。\s]+$/g, '')
  const shortSubject = subject.slice(0, 14)
  return {
    name: shortSubject || `${style}瓷意`,
    intro: prompt ? `以「${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}」为灵感，融入${style}的艺术语言，将心中的意境凝于一器。` : `以${style}为灵感，将东方瓷艺的温润气韵融入创作。`
  }
}

function expiresAt(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

Page({
  data: {
    pageTitle: 'AI创瓷结果', sourceLabel: '实时生成 · 你的创意', isShowcase: false, visuals,
    taskId: '', caseId: '', caseDate: '', status: 'unknown', ...states.unknown,
    image: '', imageError: '', canSave: false, refreshing: false, initialLoading: true,
    userPrompt: '', styleName: '', workName: '', artworkIntro: '', editingName: false, saved: false, saving: false, confirmingNewCreation: false,
    navTop: 30, navHeight: 32, brandTop: 74, heroHeight: 184, safeBottom: 0
  },

  onLoad(options = {}) {
    this._platform = wx
    this._service = createCloudService(this._platform)
    this._taskState = createTaskState(this._platform)
    this._session = 0
    this._visible = false
    this.setData(metrics(this._platform))
    const taskId = typeof options.taskId === 'string' ? options.taskId.slice(0, 128) : ''
    const caseId = typeof options.caseId === 'string' ? options.caseId : ''
    if (taskId) {
      this.setData({ taskId })
      return
    }
    if (caseId) {
      const example = resolveMedia(findGenerationCase(caseId))
      if (example) {
        this._case = example
        this.setData({
          caseId, isShowcase: true, pageTitle: '预生成展示案例', sourceLabel: '精选案例 · 预生成展示', initialLoading: false,
          status: 'succeeded', statusTitle: example.name, statusMessage: '这是一件预生成展示案例，可查看风格效果。',
          image: example.image, canSave: Boolean(example.image), workName: example.name,
          artworkIntro: presentation(example.prompt, example.styleName).intro,
          userPrompt: example.prompt, styleName: example.styleName,
          caseDate: typeof example.createdAt === 'string' ? example.createdAt.slice(0, 10) : ''
        })
        return
      }
    }
    this.setData({ status: 'failed', ...states.failed, initialLoading: false, statusMessage: '没有找到这件作品，请返回创瓷页重新进入。' })
  },

  onShow() {
    this._visible = true
    this._session += 1
    this._pollAttempt = 0
    this.stopPolling()
    if (this.data.taskId) return this.queryTask(this._session)
  },

  onHide() {
    this._visible = false
    this._session += 1
    this.stopPolling()
  },

  onUnload() { this.onHide() },

  onResize(event) { this.setData(metrics(this._platform, event && event.size)) },

  stopPolling() {
    if (this._pollTimer !== undefined && this._pollTimer !== null) clearTimeout(this._pollTimer)
    this._pollTimer = null
  },

  schedulePolling(session) {
    if (!this._visible || session !== this._session || !['queued', 'running', 'storing', 'unknown'].includes(this.data.status)) return
    const delays = [3000, 5000, 10000]
    const delay = delays[Math.min(this._pollAttempt || 0, delays.length - 1)]
    this._pollAttempt = (this._pollAttempt || 0) + 1
    this._pollTimer = setTimeout(() => {
      this._pollTimer = null
      return this.queryTask(session)
    }, delay)
  },

  async queryTask(session) {
    if (!this._visible || session !== this._session || this._queryingSession === session) return
    this._queryingSession = session
    this.stopPolling()
    this.setData({ refreshing: true })
    try {
      const task = await this._service.callAI('generation.get', { taskId: this.data.taskId })
      if (!this._visible || session !== this._session) return
      if (!task || task.taskId !== this.data.taskId || !states[task.status]) throw Object.assign(new Error('任务状态暂时无法读取，请重新查询'), { retryable: true })
      this._task = task
      const input = task.input || {}
      const caption = presentation(input.userPrompt, input.styleName)
      const update = {
        status: task.status, ...states[task.status],
        userPrompt: input.userPrompt || '', styleName: input.styleName || '',
        canSave: false, imageError: '', artworkIntro: caption.intro
      }
      if (!this.data.workName) update.workName = caption.name
      if (task.status !== 'succeeded') update.image = ''
      this.setData(update)
      this.rememberTaskStatus(task.status)
      if (task.status === 'succeeded') await this.resolveArtwork(session)
    } catch (error) {
      if (!this._visible || session !== this._session) return
      const terminal = ['NOT_FOUND', 'TASK_NOT_FOUND', 'FORBIDDEN', 'ASSET_FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code)
      const status = terminal ? 'failed' : 'unknown'
      this.setData({ status, ...states[status], statusMessage: error.message || states[status].statusMessage, canSave: false })
      this.rememberTaskStatus(status)
    } finally {
      if (this._queryingSession === session) this._queryingSession = null
      if (this._visible && session === this._session) {
        this.setData({ refreshing: false, initialLoading: false })
        this.schedulePolling(session)
      }
    }
  },

  rememberTaskStatus(status) {
    if (!this.data.taskId) return null
    try {
      const saved = this._taskState.read()
      const active = saved && saved.taskId === this.data.taskId ? saved : {
        // A direct entry has a server task id but does not expose its original client key.
        // This local view token is never used for a generation.create call.
        clientRequestId: `view-${this.data.taskId}`, taskId: this.data.taskId,
        input: this._task && this._task.input || { userPrompt: this.data.userPrompt, styleId: 'qinghua', styleName: this.data.styleName }
      }
      return this._taskState.write({ ...active, status, newCreationConsentFor: status === 'unknown' ? active.newCreationConsentFor : undefined })
    } catch (error) { return null }
  },

  async resolveArtwork(session) {
    const result = this._task && this._task.result
    if (!result || typeof result.assetId !== 'string') {
      this.setData({ image: '', canSave: false, imageError: '作品图片尚未准备好，请重新查询。' })
      return
    }
    try {
      const assets = await this._service.resolveAssets([result.assetId])
      if (!this._visible || session !== this._session) return
      const asset = assets.find((item) => item.assetId === result.assetId)
      if (!asset || !asset.url || !(asset.fileId || result.fileId)) throw new Error('作品图片暂时无法读取，请重新加载。')
      this._asset = { ...asset, fileId: asset.fileId || result.fileId }
      this._assetExpiresAt = expiresAt(asset.expiresAt)
      this.setData({ image: asset.url, imageError: '', canSave: true })
    } catch (error) {
      if (!this._visible || session !== this._session) return
      this.setData({ image: '', canSave: false, imageError: error.message || '图片暂时无法读取，请重新加载。' })
    }
  },

  async refreshResult() {
    if (!this.data.taskId) return
    this._pollAttempt = 0
    return this.queryTask(this._session)
  },

  artworkImageError() {
    if (!this.data.image) return
    this._assetExpiresAt = 0
    this.setData({ image: '', canSave: false, imageError: this.data.isShowcase ? '案例图片加载失败，请返回后重新打开。' : '作品图片加载失败，请重新查询后查看。' })
  },

  async previewArtwork() {
    if (!this.data.image) return
    if (!this.data.isShowcase && this._assetExpiresAt <= Date.now()) await this.resolveArtwork(this._session)
    if (!this.data.image) return
    if (typeof this._platform.previewImage === 'function') this._platform.previewImage({ current: this.data.image, urls: [this.data.image] })
  },

  nameInput(event) {
    const value = event && event.detail && event.detail.value
    if (typeof value === 'string') this.setData({ workName: value.slice(0, 24), saved: false })
  },

  editName() { if (this.data.canSave) this.setData({ editingName: true }) },

  finishNameEditing() {
    const name = this.data.workName.trim() || (this._case && this._case.name) || presentation(this.data.userPrompt, this.data.styleName).name
    this.setData({ workName: name, editingName: false })
  },

  async saveArtwork() {
    if (this._saving) return
    if (!this.data.canSave || this.data.status !== 'succeeded' || !this.data.image) {
      this.toast('图片准备好后才能保存')
      return
    }
    const name = this.data.workName.trim()
    if (!name) { this.toast('请先为作品取个名字'); return }
    this._saving = true
    this.setData({ saving: true })
    try {
      if (!this.data.isShowcase && this._assetExpiresAt <= Date.now()) {
        await this.resolveArtwork(this._session)
        if (!this.data.canSave || !this.data.image) throw new Error('图片链接暂时不可用')
      }
      let work
      if (this.data.isShowcase && this._case) {
        work = {
          id: `showcase-${this._case.id}`, name, image: this._case.image,
          creationType: 'ai', source: 'showcase', caseId: this._case.id,
          userPrompt: this._case.prompt, styleId: this._case.styleId, styleName: this._case.styleName,
          createdAt: this._case.createdAt
        }
      } else if (this._task && this._asset) {
        work = {
          id: `ai-${this._task.taskId}`, name, image: this.data.image, creationType: 'ai', source: 'generated',
          taskId: this._task.taskId, assetId: this._asset.assetId, fileId: this._asset.fileId,
          userPrompt: this._task.input.userPrompt, styleId: this._task.input.styleId, styleName: this._task.input.styleName
        }
      } else { throw new Error('作品信息尚未准备好') }
      saveWork(work)
      this.setData({ saved: true, workName: name })
      this.toast('已收藏到我的作品')
    } catch (error) { this.toast('作品保存失败，请重试') }
    finally { this._saving = false; this.setData({ saving: false }) }
  },

  toast(title) { if (typeof this._platform.showToast === 'function') this._platform.showToast({ title, icon: 'none' }) },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && typeof this._platform.navigateBack === 'function') this._platform.navigateBack({ delta: 1 })
    else go('/pages/ai-create/index')
  },

  returnToEditor() {
    const url = '/pages/ai-create/index'
    let replaced = false
    const replace = () => {
      if (replaced) return
      replaced = true
      if (typeof this._platform.redirectTo === 'function') return this._platform.redirectTo({ url })
      return go(url)
    }
    let pages = []
    try { if (typeof getCurrentPages === 'function') pages = getCurrentPages() || [] }
    catch (error) { /* Replace this page when the current stack is unavailable. */ }
    for (let index = pages.length - 2; index >= 0; index -= 1) {
      if (!pages[index] || pages[index].route !== 'pages/ai-create/index') continue
      if (typeof this._platform.navigateBack !== 'function') break
      try {
        const pending = this._platform.navigateBack({ delta: pages.length - index - 1, fail: replace })
        return pending && typeof pending.catch === 'function' ? pending.catch(replace) : pending
      } catch (error) { return replace() }
    }
    return replace()
  },

  async createAgain() {
    if (this._confirmingNewCreation || this._saving) return
    if (this.data.taskId && this.data.status === 'unknown') {
      this._confirmingNewCreation = true
      this.setData({ confirmingNewCreation: true })
      try {
        if (!await confirmUnknownCreation(this._platform)) return
        if (!this._visible) return
        if (this.data.status === 'unknown') {
          const active = this.rememberTaskStatus('unknown')
          if (!active) { this.toast('任务状态保存失败，请重试'); return }
          this._taskState.write({ ...active, newCreationConsentFor: this.data.taskId })
        }
      } catch (error) { this.toast('任务状态保存失败，请重试'); return }
      finally { this._confirmingNewCreation = false; this.setData({ confirmingNewCreation: false }) }
    }
    return this.returnToEditor()
  },
  viewWorks() { if (!this._saving && !this._confirmingNewCreation) go('/pages/works/index?type=ai') },

  onShareAppMessage() {
    return this.data.isShowcase
      ? { title: `瓷韵 · ${this.data.pageTitle}`, path: `/pages/ai-result/index?caseId=${encodeURIComponent(this.data.caseId)}` }
      : { title: '瓷韵 · 以灵感为笔，体验AI创瓷', path: '/pages/ai-create/index' }
  }
})
