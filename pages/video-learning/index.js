const { carouselVideos, videos } = require('../../data/videos')

function withInitialPlayUrl(items) {
  return items.map((item) => ({ ...item, playUrl: '' }))
}

Page({
  data: {
    carouselVideos: withInitialPlayUrl(carouselVideos),
    videos: withInitialPlayUrl(videos),
    playingVideoId: '',
    isVideoFullscreen: false,
    isSimulator: false,
    simulatorFullscreen: false,
    simulatorVideo: null,
    simulatorPlayerStyle: '',
    currentSwiperIndex: 0,
    navTop: 24,
    brandTop: 60,
    heroHeight: 145
  },
  onLoad() {
    const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { windowWidth: 390 }
    const scale = windowInfo.windowWidth / 750
    const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo()
      : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {}
    let brandTop = this.data.brandTop
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.top) {
        brandTop = menuButton.bottom + 2
        this.setData({ navTop: menuButton.top })
      }
    }
    this.setData({ brandTop, heroHeight: Math.max(260 * scale, brandTop + 112 * scale), isSimulator: deviceInfo.platform === 'devtools' })
    this.resolveCloudVideoUrls().catch((error) => {
      console.warn('[video-classroom] URL preparation failed:', error.errMsg || error.message)
    })
  },
  resolveCloudVideoUrls(force = false) {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return Promise.resolve()
    if (!force && this.videoUrlsExpireAt > Date.now()) return Promise.resolve()
    if (this.videoUrlRequest) return this.videoUrlRequest
    // Private storage requires server-side access; never persist temporary signatures in the bundle.
    this.videoUrlRequest = wx.cloud.callFunction({ name: 'video-playback' }).then(({ result }) => {
      if (!result || !Array.isArray(result.videos)) throw new Error('No video playback URLs returned')
      const urlMap = result.videos.reduce((result, item) => {
        if (item.id && item.url) result[item.id] = item.url
        return result
      }, {})
      const attachUrl = (item) => ({ ...item, playUrl: urlMap[item.id] || '' })
      this.videoUrlsExpireAt = result.expiresAt || Date.now() + 45 * 60 * 1000
      this.setData({
        carouselVideos: this.data.carouselVideos.map(attachUrl),
        videos: this.data.videos.map(attachUrl)
      })
    }).then(() => { this.videoUrlRequest = null }, (error) => {
      this.videoUrlRequest = null
      throw error
    })
    return this.videoUrlRequest
  },
  goBack() {
    if (this.data.simulatorFullscreen) {
      this.exitSimulatorFullscreen()
      return
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
  async playVideo(event) {
    const id = event.currentTarget.dataset.id
    if (!id || id === this.data.playingVideoId) return
    this.stopCurrentVideo()
    const request = (this.playRequest || 0) + 1
    this.playRequest = request
    this.setData({ playingVideoId: '' })
    let video
    try {
      await this.resolveCloudVideoUrls()
      if (request !== this.playRequest) return
      video = [...this.data.carouselVideos, ...this.data.videos].find((item) => item.id === id)
      if (!video || !video.playUrl) throw new Error('Video URL unavailable')
      if (this.data.isSimulator) {
        const rect = await this.measureVideoBox(id)
        if (request !== this.playRequest) return
        this.simulatorAnchor = { ...rect, documentTop: rect.top + (this.pageScrollTop || 0) }
      }
    } catch (error) {
      if (request !== this.playRequest) return
      console.warn('[video-classroom] Playback preparation failed:', id, error.errMsg || error.message)
      wx.showToast({ title: '视频暂时无法加载，请重试', icon: 'none' })
      return
    }
    this.setData({
      playingVideoId: id,
      simulatorVideo: this.data.isSimulator ? { ...video, isCarousel: id.startsWith('carousel-') } : null,
      simulatorPlayerStyle: this.data.isSimulator ? this.getSimulatorPlayerStyle() : ''
    }, () => {
      this.activeVideoContext = wx.createVideoContext(`video-${id}`, this)
      if (this.activeVideoContext && typeof this.activeVideoContext.play === 'function') {
        this.activeVideoContext.play()
      }
    })
  },
  measureVideoBox(id) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().select(`#media-${id}`).boundingClientRect((rect) => {
        if (!rect || !rect.width || !rect.height) reject(new Error('Video container is not ready'))
        else resolve(rect)
      }).exec()
    })
  },
  getSimulatorPlayerStyle() {
    const box = this.simulatorAnchor
    return box ? `left: ${box.left}px; top: ${box.documentTop - (this.pageScrollTop || 0)}px; width: ${box.width}px; height: ${box.height}px;` : ''
  },
  enterSimulatorFullscreen() {
    if (!this.data.isSimulator || !this.data.playingVideoId) return
    // Keep the same video node and source. DevTools' browser fullscreen is not used.
    this.setData({ simulatorFullscreen: true, isVideoFullscreen: true })
  },
  exitSimulatorFullscreen() {
    if (!this.data.simulatorFullscreen) return
    this.setData({ simulatorFullscreen: false, isVideoFullscreen: false, simulatorPlayerStyle: this.getSimulatorPlayerStyle() })
  },
  onPageScroll(event) {
    this.pageScrollTop = event.scrollTop || 0
    if (this.data.isSimulator && this.data.playingVideoId && !this.data.simulatorFullscreen) {
      this.setData({ simulatorPlayerStyle: this.getSimulatorPlayerStyle() })
    }
  },
  preventPlayerScroll() {},
  stopCurrentVideo() {
    if (this.activeVideoContext && typeof this.activeVideoContext.stop === 'function') {
      this.activeVideoContext.stop()
    } else if (this.data.playingVideoId) {
      const context = wx.createVideoContext(`video-${this.data.playingVideoId}`, this)
      if (context && typeof context.stop === 'function') context.stop()
    }
    this.activeVideoContext = null
    if (this.data.isVideoFullscreen) this.setData({ isVideoFullscreen: false, simulatorFullscreen: false })
  },
  onSwiperChange(event) {
    if (this.data.isVideoFullscreen) return
    const currentSwiperIndex = event.detail.current || 0
    if (currentSwiperIndex !== this.data.currentSwiperIndex) {
      this.setData({ currentSwiperIndex })
    }
    const activeId = this.data.playingVideoId
    if (!activeId || !activeId.startsWith('carousel-')) return
    const nextVideo = this.data.carouselVideos[currentSwiperIndex]
    if (nextVideo && nextVideo.id === activeId) return
    this.stopCurrentVideo()
    this.setData({ playingVideoId: '' })
  },
  onVideoFullscreenChange(event) {
    if (event.currentTarget.dataset.id !== this.data.playingVideoId) return
    this.setData({ isVideoFullscreen: !!event.detail.fullScreen })
  },
  onVideoEnded(event) {
    if (event.currentTarget.dataset.id !== this.data.playingVideoId) return
    this.activeVideoContext = null
    this.setData({ playingVideoId: '', isVideoFullscreen: false, simulatorFullscreen: false, simulatorVideo: null })
  },
  onVideoError(event) {
    console.warn('[video-classroom] Player error:', event.currentTarget.dataset.id, event.detail)
    this.videoUrlsExpireAt = 0
    if (event.currentTarget.dataset.id === this.data.playingVideoId) {
      this.activeVideoContext = null
      this.setData({ playingVideoId: '', isVideoFullscreen: false, simulatorFullscreen: false, simulatorVideo: null })
    }
    wx.showToast({ title: '视频加载失败，请稍后重试', icon: 'none' })
  },
  onHide() {
    this.playRequest = (this.playRequest || 0) + 1
    this.stopCurrentVideo()
    if (this.data.playingVideoId) this.setData({ playingVideoId: '' })
  },
  onUnload() {
    this.playRequest = (this.playRequest || 0) + 1
    this.stopCurrentVideo()
  },
  onShareAppMessage() {
    return {
      title: '瓷艺课堂｜影像记录千年制瓷技艺',
      path: '/pages/video-learning/index',
      imageUrl: carouselVideos[0].cover
    }
  }
})
