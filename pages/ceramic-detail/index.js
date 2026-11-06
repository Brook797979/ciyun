const { resolveMedia } = require('../../utils/static-media')
const ceramics = resolveMedia(require('../../data/ceramics'))
const { go } = require('../../utils/navigation')

// Temporary playback URLs stay in memory and are never written to device storage.
const playbackUrls = new Map()
const videoKey = video => `${video.id}:${video.src}`
const isHttps = value => typeof value === 'string' && /^https:\/\/[^\s/]+\/[^\s]*$/i.test(value)

async function resolveVideoUrl(video) {
  if (isHttps(video.src)) return video.src
  if (!video.src.startsWith('cloud://') || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('Video playback is unavailable')
  }
  const key = videoKey(video)
  const cached = playbackUrls.get(key)
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.url
  playbackUrls.delete(key)
  const response = await wx.cloud.callFunction({ name: 'video-playback', data: { ids: [video.id] } })
  const result = response && response.result
  const entry = result && Array.isArray(result.videos) && result.videos.find(item => item.id === video.id)
  if (!entry || !isHttps(entry.url)) throw new Error('No playable video returned')
  const expiresAt = typeof result.expiresAt === 'number' ? result.expiresAt : Date.parse(result.expiresAt)
  if (expiresAt > Date.now() + 30000) playbackUrls.set(key, { url: entry.url, expiresAt })
  return entry.url
}

Page({
  data: {
    item: ceramics[0],
    navTop: 24,
    navHeight: 32,
    heroHeight: 98,
    videoUrl: '',
    videoState: 'idle',
    videoError: ''
  },

  onLoad(options = {}) {
    this._destroyed = false
    this._isVisible = true
    this._videoRequest = (this._videoRequest || 0) + 1
    this._videoLoading = false
    const matchedItem = ceramics.find((ceramic) => ceramic.id === options.id)
    const item = matchedItem || ceramics[0]
    const windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : { windowWidth: 375 }
    const scale = windowInfo.windowWidth / 750
    let navTop = this.data.navTop
    let navHeight = this.data.navHeight
    let menuBottom = navTop + navHeight

    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.top) {
        navTop = menuButton.top
        navHeight = menuButton.height || menuButton.bottom - menuButton.top || navHeight
        menuBottom = menuButton.bottom || navTop + navHeight
      }
    }

    this.setData({
      item,
      videoUrl: '',
      videoState: 'idle',
      videoError: '',
      navTop,
      navHeight,
      heroHeight: Math.max(188 * scale, menuBottom + 24 * scale)
    }, () => {
      try {
        if (matchedItem) require('../../utils/growth-progress').createGrowthProgress(wx).recordGrowthEvent('ceramic_viewed', {
          id: matchedItem.id, title: matchedItem.name, createdAt: Date.now()
        })
      } catch (_) { /* Browsing remains available when growth storage fails. */ }
    })
  },

  onShow() {
    this._isVisible = true
  },

  onHide() {
    this._isVisible = false
    this._videoRequest += 1
    this._videoLoading = false
    this.pauseRelatedVideo()
    if (!this._destroyed && this.data.videoState === 'loading') {
      this.setData({ videoState: 'idle' })
    }
  },

  onUnload() {
    this._destroyed = true
    this._isVisible = false
    this._videoRequest += 1
    this._videoLoading = false
    this.pauseRelatedVideo()
  },

  pauseRelatedVideo() {
    if (typeof wx.createVideoContext !== 'function') return
    try { wx.createVideoContext('ceramic-detail-video', this).pause() } catch (_) { /* A player may not be mounted yet. */ }
  },

  previewCeramic() {
    const image = this.data.item.image
    if (!this._destroyed && image && typeof wx.previewImage === 'function') {
      wx.previewImage({ current: image, urls: [image] })
    }
  },

  async playRelatedVideo() {
    if (this._destroyed || !this._isVisible || this._videoLoading) return
    const video = this.data.item.video
    if (!video || !video.src) {
      wx.showToast({ title: '影像待补充', icon: 'none' })
      return
    }
    const request = ++this._videoRequest
    this._videoLoading = true
    this.setData({ videoState: 'loading', videoError: '' })
    try {
      const videoUrl = await resolveVideoUrl(video)
      if (this._destroyed || !this._isVisible || request !== this._videoRequest) return
      this.setData({ videoUrl, videoState: 'ready' }, () => {
        if (this._destroyed || !this._isVisible || request !== this._videoRequest) return
        try { wx.createVideoContext('ceramic-detail-video', this).play() } catch (_) { this.onVideoError() }
      })
    } catch (_) {
      if (!this._destroyed && request === this._videoRequest) this.onVideoError()
    } finally {
      if (request === this._videoRequest) this._videoLoading = false
    }
  },

  onVideoPlay() {
    if (this._destroyed) return
    if (!this._isVisible) {
      this.pauseRelatedVideo()
      return
    }
    this.setData({ videoState: 'playing', videoError: '' })
  },

  onVideoError() {
    if (this._destroyed) return
    playbackUrls.delete(videoKey(this.data.item.video))
    this.setData({ videoUrl: '', videoState: 'error', videoError: '影像暂时无法播放' })
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function'
      ? getCurrentPages()
      : (typeof wx.getCurrentPages === 'function' ? wx.getCurrentPages() : [])

    if (pages.length > 1 && typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 })
      return
    }

    go('/pages/museum/index')
  },

  ask() {
    go(`/pages/ai-chat/index?ceramicId=${encodeURIComponent(this.data.item.id)}`)
  }
})
