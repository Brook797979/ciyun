const { resolveMedia } = require('../../utils/static-media')
const shapes = resolveMedia(require('../../data/shapes'))
const patternCatalog = resolveMedia(require('../../data/patterns'))
const glazeCatalog = resolveMedia(require('../../data/glazes'))
const storage = require('../../utils/storage')
const works = require('../../utils/craft-works')
const { getCraftPreview } = require('../../utils/craft-preview')
const { go } = require('../../utils/navigation')

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
      // Older clients may expose an API that is unavailable at runtime.
    }
  }
  return {}
}

function isDraft(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function buildChoices(catalog, unlockedIds) {
  const ids = Array.isArray(unlockedIds) ? unlockedIds : []
  return catalog.map((item) => ({ ...item, unlocked: item.unlocked || ids.includes(item.id) }))
}

function automaticName(shape, pattern, glaze) {
  return `${glaze.shortName}${pattern.name.replace(/^青花/, '')}${shape.name}`
}

const defaultShapes = buildChoices(shapes, [])
const defaultPatterns = buildChoices(patternCatalog, [])
const defaultGlazes = buildChoices(glazeCatalog, [])
const previewPendingMessage = '该器型创作预览准备中'

Page({
  data: {
    shapes: defaultShapes,
    selectedShape: shapes[0].id,
    selectedShapeItem: shapes[0],
    patterns: defaultPatterns,
    selectedPattern: defaultPatterns[0].id,
    selectedPatternItem: defaultPatterns[0],
    glazes: defaultGlazes,
    selectedGlaze: defaultGlazes[0].id,
    selectedGlazeItem: defaultGlazes[0],
    previewImage: getCraftPreview(shapes[0].id, defaultPatterns[0].id, defaultGlazes[0].id),
    previewUnavailable: false,
    workId: '',
    workName: automaticName(shapes[0], defaultPatterns[0], defaultGlazes[0]),
    nameEdited: false,
    saving: false,
    saved: false,
    steps: [
      { number: '01', name: '选择器型' },
      { number: '02', name: '选择纹样' },
      { number: '03', name: '选择釉色' },
      { number: '04', name: '完成作品' }
    ],
    currentStep: 0,
    tabs,
    statusBarHeight: 24,
    navTop: 24,
    navHeight: 32,
    brandTop: 70,
    heroHeight: 220,
    safeBottom: 0,
    layoutScale: 0.5,
    previewHeight: 400,
    shapeCoverHeight: 190,
    shapeCardHeight: 344
  },

  onLoad(options = {}) {
    const windowInfo = readWindowInfo()
    const width = Number(windowInfo.windowWidth)
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
        // Keep the status-bar-safe fallback if capsule metrics are unavailable.
      }
    }

    let shapeChoices = defaultShapes
    let selectedShapeItem = defaultShapes[0]
    let patterns = defaultPatterns
    let selectedPatternItem = defaultPatterns[0]
    let glazes = defaultGlazes
    let selectedGlazeItem = defaultGlazes[0]
    let draft = {}
    try {
      shapeChoices = buildChoices(shapes, storage.get('unlockedShapeIds', []))
      patterns = buildChoices(patternCatalog, storage.get('unlockedPatternIds', []))
      glazes = buildChoices(glazeCatalog, storage.get('unlockedGlazeIds', []))
      selectedPatternItem = patterns[0]
      selectedGlazeItem = glazes[0]
      const savedDraft = storage.get('craftDraft', {})
      draft = isDraft(savedDraft) ? savedDraft : {}
      selectedShapeItem = shapeChoices.find((shape) => shape.id === draft.selectedShape && shape.unlocked) || shapeChoices[0]
      selectedPatternItem = patterns.find((pattern) => pattern.id === draft.selectedPattern && pattern.unlocked) || patterns[0]
      selectedGlazeItem = glazes.find((glaze) => glaze.id === draft.selectedGlaze && glaze.unlocked) || glazes[0]
    } catch (error) {
      // A read failure must not prevent opening the shape selector.
    }

    const brandTop = navTop + navHeight + 12 * scale
    const windowHeight = Number(windowInfo.windowHeight)
    const safeAreaBottom = windowInfo.safeArea && windowInfo.safeArea.bottom
    const safeBottom = Number.isFinite(windowHeight) && windowHeight > 0 && Number.isFinite(safeAreaBottom) && safeAreaBottom >= 0 && safeAreaBottom <= windowHeight
      ? windowHeight - safeAreaBottom
      : 0
    const heroHeight = brandTop + 188 * scale

    const workId = typeof draft.workId === 'string' && draft.workId.trim() && draft.workId.length <= 100
      ? draft.workId : works.createWorkId()
    const currentStep = Number.isInteger(draft.currentStep) && draft.currentStep >= 0 && draft.currentStep <= 3
      ? draft.currentStep : 0
    try { this._savedWork = works.getWorks().find((item) => item.id === workId) } catch (error) { this._savedWork = null }

    this.applySelection({
      statusBarHeight,
      navTop,
      navHeight,
      brandTop,
      heroHeight,
      safeBottom,
      layoutScale: scale,
      previewHeight: currentStep === 3 ? 480 : 400,
      shapeCoverHeight: 190,
      shapeCardHeight: 344,
      shapes: shapeChoices,
      selectedShape: selectedShapeItem.id,
      selectedShapeItem,
      patterns,
      selectedPattern: selectedPatternItem.id,
      selectedPatternItem,
      glazes,
      selectedGlaze: selectedGlazeItem.id,
      selectedGlazeItem,
      currentStep,
      workId,
      nameEdited: draft.nameEdited === true && typeof draft.workName === 'string',
      workName: typeof draft.workName === 'string' ? draft.workName.slice(0, 24) : ''
    })
    this._hasLoaded = true
    if (options.new === '1') this.startAgain()
  },

  onShow() {
    if (!this._hasLoaded) return
    try {
      const shapeChoices = buildChoices(shapes, storage.get('unlockedShapeIds', []))
      const patterns = buildChoices(patternCatalog, storage.get('unlockedPatternIds', []))
      const glazes = buildChoices(glazeCatalog, storage.get('unlockedGlazeIds', []))
      const selectedShapeItem = shapeChoices.find((item) => item.id === this.data.selectedShape && item.unlocked) || shapeChoices[0]
      const selectedPatternItem = patterns.find((item) => item.id === this.data.selectedPattern && item.unlocked) || patterns[0]
      const selectedGlazeItem = glazes.find((item) => item.id === this.data.selectedGlaze && item.unlocked) || glazes[0]
      this._savedWork = works.getWorks().find((item) => item.id === this.data.workId)
      this.applySelection({ shapes: shapeChoices, selectedShape: selectedShapeItem.id, selectedShapeItem,
        patterns, glazes, selectedPattern: selectedPatternItem.id, selectedPatternItem,
        selectedGlaze: selectedGlazeItem.id, selectedGlazeItem })
    } catch (error) {
      // Keep the visible draft if storage temporarily cannot be read.
    }
  },

  onHide() {
    if (this._hasLoaded) this.saveDraft(this.draftValues())
  },

  onReady() {
    this.fitFirstViewport()
  },

  fitFirstViewport() {
    if (typeof wx.createSelectorQuery !== 'function') return
    const measuredStep = this.data.currentStep
    const query = wx.createSelectorQuery()
    if (!query || typeof query.select !== 'function' || typeof query.exec !== 'function') return
    const measurement = this._viewportMeasurement = (this._viewportMeasurement || 0) + 1

    query.select('.craft-actions').boundingClientRect()
    query.select('.craft-tabbar').boundingClientRect()
    query.exec((rects) => {
      if (this._viewportMeasurement !== measurement || this.data.currentStep !== measuredStep) return
      if (!Array.isArray(rects) || rects.length < 2) return
      const actionsBottomValue = rects[0] && rects[0].bottom
      const tabTopValue = rects[1] && rects[1].top
      if (typeof actionsBottomValue !== 'number' || typeof tabTopValue !== 'number') return
      const actionsBottom = actionsBottomValue
      const tabTop = tabTopValue
      const scale = Number(this.data.layoutScale)
      if (!Number.isFinite(actionsBottom) || !Number.isFinite(tabTop) || !Number.isFinite(scale) || scale <= 0) return

      // Fit the finish preview around its cards while retaining room above the tabbar.
      const spareHeight = (tabTop - actionsBottom) / scale - 22
      if (measuredStep === 3) {
        const previewHeight = Math.max(360, Math.min(720, Math.round(this.data.previewHeight + spareHeight)))
        if (previewHeight !== this.data.previewHeight) this.setData({ previewHeight })
        return
      }
      // Keep the existing image growth distribution for the selection steps.
      const extraHeight = Math.floor(Math.min(160, Math.max(0, spareHeight)))
      if (extraHeight <= 0) return
      // Bound card cropping for the wide bowl; the remaining growth belongs to the hero preview.
      const coverGrowth = Math.min(40, Math.round(extraHeight * 0.4))
      this.setData({
        previewHeight: 400 + extraHeight - coverGrowth,
        shapeCoverHeight: 190 + coverGrowth,
        shapeCardHeight: 344 + coverGrowth
      })
    })
  },

  selectShape(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
    const shape = this.data.shapes.find((item) => item.id === (dataset && dataset.id))
    if (!shape) return
    if (!shape.unlocked) {
      wx.showToast({ title: '完成对应挑战后即可解锁', icon: 'none' })
      return
    }
    this.applySelection({ selectedShape: shape.id, selectedShapeItem: shape })
    this.saveDraft(this.draftValues())
  },

  selectPattern(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
    const pattern = this.data.patterns.find((item) => item.id === (dataset && dataset.id))
    if (!pattern) return
    if (!pattern.unlocked) {
      wx.showToast({ title: '完成对应挑战后即可解锁', icon: 'none' })
      return
    }
    this.applySelection({ selectedPattern: pattern.id, selectedPatternItem: pattern })
    this.saveDraft(this.draftValues())
  },

  selectGlaze(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
    const glaze = this.data.glazes.find((item) => item.id === (dataset && dataset.id))
    if (!glaze) return
    if (!glaze.unlocked) {
      wx.showToast({ title: '完成对应挑战后即可解锁', icon: 'none' })
      return
    }
    this.applySelection({ selectedGlaze: glaze.id, selectedGlazeItem: glaze })
    this.saveDraft(this.draftValues())
  },

  applySelection(update = {}) {
    const state = { ...this.data, ...update }
    const workName = state.nameEdited ? state.workName : automaticName(state.selectedShapeItem, state.selectedPatternItem, state.selectedGlazeItem)
    const workImage = getCraftPreview(state.selectedShape, state.selectedPattern, state.selectedGlaze)
    const previewUnavailable = !getCraftPreview(state.selectedShape, defaultPatterns[0].id, defaultGlazes[0].id)
    const currentStep = previewUnavailable ? 0 : state.currentStep
    const previewImage = currentStep < 2
      ? getCraftPreview(state.selectedShape, state.selectedPattern)
      : workImage
    const saved = Boolean(this._savedWork && this._savedWork.id === state.workId && this._savedWork.name === workName.trim() &&
      this._savedWork.shapeId === state.selectedShape && this._savedWork.patternId === state.selectedPattern &&
      this._savedWork.glazeId === state.selectedGlaze && this._savedWork.image === workImage)
    this.setData({ ...update, currentStep, workName, previewImage, previewUnavailable, saved,
      ...(previewUnavailable && state.currentStep !== 0 ? { previewHeight: 400 } : {}) })
  },

  onNameInput(event) {
    const value = event && event.detail && event.detail.value
    if (typeof value !== 'string') return
    this.applySelection({ workName: value.slice(0, 24), nameEdited: true })
    this.saveDraft(this.draftValues())
  },

  draftValues(update = {}) {
    if (!this.data.workId) this.setData({ workId: works.createWorkId() })
    return {
      selectedShape: this.data.selectedShape,
      selectedPattern: this.data.selectedPattern,
      selectedGlaze: this.data.selectedGlaze,
      currentStep: this.data.currentStep,
      workId: this.data.workId,
      workName: this.data.workName,
      nameEdited: this.data.nameEdited,
      ...update
    }
  },

  changeStep(currentStep) {
    this.applySelection({ currentStep, previewHeight: currentStep === 3 ? 480 : 400, shapeCoverHeight: 190, shapeCardHeight: 344 })
    const fit = () => this.fitFirstViewport()
    if (typeof wx.nextTick === 'function') wx.nextTick(fit)
    else fit()
  },

  previous() {
    if (this.data.saving || this.data.currentStep <= 0) return
    const currentStep = this.data.currentStep - 1
    if (this.saveDraft(this.draftValues({ currentStep }))) this.changeStep(currentStep)
  },

  saveDraft(update) {
    try {
      const draft = storage.get('craftDraft', {})
      storage.set('craftDraft', { ...(isDraft(draft) ? draft : {}), ...update })
      return true
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      return false
    }
  },

  next() {
    if (this.data.saving || this.data.currentStep >= 3) return
    const shape = this.data.shapes.find((item) => item.id === this.data.selectedShape && item.unlocked)
    if (!shape) return
    if (!getCraftPreview(shape.id, defaultPatterns[0].id, defaultGlazes[0].id)) {
      wx.showToast({ title: previewPendingMessage, icon: 'none' })
      return
    }
    const pattern = this.data.patterns.find((item) => item.id === this.data.selectedPattern && item.unlocked)
    const glaze = this.data.glazes.find((item) => item.id === this.data.selectedGlaze && item.unlocked)
    if ((this.data.currentStep >= 1 && !pattern) || (this.data.currentStep >= 2 && !glaze)) return
    const currentStep = this.data.currentStep + 1
    if (this.saveDraft(this.draftValues({ currentStep }))) this.changeStep(currentStep)
  },

  saveWork() {
    if (this.data.currentStep !== 3 || this.data.saving || this.data.saved) return
    const shape = this.data.shapes.find((item) => item.id === this.data.selectedShape && item.unlocked)
    if (shape && !getCraftPreview(shape.id, defaultPatterns[0].id, defaultGlazes[0].id)) {
      wx.showToast({ title: previewPendingMessage, icon: 'none' })
      return
    }
    const pattern = this.data.patterns.find((item) => item.id === this.data.selectedPattern && item.unlocked)
    const glaze = this.data.glazes.find((item) => item.id === this.data.selectedGlaze && item.unlocked)
    const name = this.data.workName.trim()
    if (!name) { wx.showToast({ title: '请输入作品名称', icon: 'none' }); return }
    const image = getCraftPreview(this.data.selectedShape, this.data.selectedPattern, this.data.selectedGlaze)
    if (!shape || !pattern || !glaze || !image) return
    this.setData({ saving: true, workName: name })
    try {
      if (!this.saveDraft(this.draftValues())) return
      this._savedWork = works.saveWork({
        id: this.data.workId, name, image,
        shapeId: shape.id, patternId: pattern.id, glazeId: glaze.id,
        shape: shape.name, pattern: pattern.name, glaze: glaze.name, creationType: 'digital'
      })
      this.applySelection()
      wx.showToast({ title: '作品已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  viewWorks() { go('/pages/works/index') },

  startAgain() {
    if (this.data.saving) return
    const fresh = { selectedShape: shapes[0].id, selectedPattern: defaultPatterns[0].id, selectedGlaze: defaultGlazes[0].id,
      currentStep: 0, workId: works.createWorkId(), workName: automaticName(shapes[0], defaultPatterns[0], defaultGlazes[0]), nameEdited: false }
    try {
      storage.set('craftDraft', fresh)
    } catch (error) {
      wx.showToast({ title: '新建失败，请重试', icon: 'none' })
      return
    }
    this._savedWork = null
    this.applySelection({ ...fresh, selectedShapeItem: shapes[0], selectedPatternItem: this.data.patterns[0], selectedGlazeItem: this.data.glazes[0], saving: false })
    this.changeStep(0)
  },

  onTabTap(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
    if (!dataset) return
    const tab = dataset.url
      ? tabs.find((item) => item.url === dataset.url)
      : tabs.find((item) => item.id === dataset.id)
    if (tab) go(tab.url)
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    go('/pages/workshop/index')
  }
})
