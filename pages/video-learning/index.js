const { carouselVideos, videos } = require('../../data/videos')

function withInitialPlayUrl(items) {
  return items.map((item) => ({ ...item, playUrl: item.src }))
}

Page({
  data: {
    carouselVideos: withInitialPlayUrl(carouselVideos),
    videos: withInitialPlayUrl(videos),
    playingVideoId: '',
    navTop: 24,
    brandTop: 68
  },
  onLoad() {
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.top) {
        this.setData({
          navTop: menuButton.top,
          brandTop: menuButton.bottom + 10
        })
      }
    }
    this.resolveCloudVideoUrls()
  },
  resolveCloudVideoUrls() {
    if (!wx.cloud || typeof wx.cloud.getTempFileURL !== 'function') return
    const allVideos = [...this.data.carouselVideos, ...this.data.videos]
    const cloudFileIds = allVideos.map((item) => item.src).filter((src) => src.startsWith('cloud://'))
    if (!cloudFileIds.length) return

    wx.cloud.getTempFileURL({ fileList: cloudFileIds }).then(({ fileList = [] }) => {
      const urlMap = fileList.reduce((result, item) => {
        if (item.fileID && item.tempFileURL) result[item.fileID] = item.tempFileURL
        return result
      }, {})
      const attachUrl = (item) => ({ ...item, playUrl: urlMap[item.src] || item.src })
      this.setData({
        carouselVideos: this.data.carouselVideos.map(attachUrl),
        videos: this.data.videos.map(attachUrl)
      })
    }).catch(() => {})
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
  playVideo(event) {
    const id = event.currentTarget.dataset.id
    if (!id || id === this.data.playingVideoId) return
    this.stopCurrentVideo()
    this.setData({ playingVideoId: id }, () => {
      this.activeVideoContext = wx.createVideoContext(`video-${id}`, this)
      if (this.activeVideoContext && typeof this.activeVideoContext.play === 'function') {
        this.activeVideoContext.play()
      }
    })
  },
  stopCurrentVideo() {
    if (this.activeVideoContext && typeof this.activeVideoContext.stop === 'function') {
      this.activeVideoContext.stop()
    } else if (this.data.playingVideoId) {
      const context = wx.createVideoContext(`video-${this.data.playingVideoId}`, this)
      if (context && typeof context.stop === 'function') context.stop()
    }
    this.activeVideoContext = null
  },
  onSwiperChange(event) {
    const activeId = this.data.playingVideoId
    if (!activeId || !activeId.startsWith('carousel-')) return
    const nextVideo = this.data.carouselVideos[event.detail.current]
    if (nextVideo && nextVideo.id === activeId) return
    this.stopCurrentVideo()
    this.setData({ playingVideoId: '' })
  },
  onVideoEnded(event) {
    if (event.currentTarget.dataset.id !== this.data.playingVideoId) return
    this.activeVideoContext = null
    this.setData({ playingVideoId: '' })
  },
  onVideoError(event) {
    if (event.currentTarget.dataset.id === this.data.playingVideoId) {
      this.activeVideoContext = null
      this.setData({ playingVideoId: '' })
    }
    wx.showToast({ title: '视频加载失败，请稍后重试', icon: 'none' })
  },
  onHide() {
    this.stopCurrentVideo()
    if (this.data.playingVideoId) this.setData({ playingVideoId: '' })
  },
  onUnload() {
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
