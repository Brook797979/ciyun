const { featured, videos } = require('../../data/videos')
const { go } = require('../../utils/navigation')

Page({
  data: {
    featured,
    videos,
    navTop: 24,
    brandTop: 72
  },
  onLoad() {
    if (typeof wx.getMenuButtonBoundingClientRect !== 'function') return
    const menuButton = wx.getMenuButtonBoundingClientRect()
    if (!menuButton || !menuButton.top) return
    this.setData({
      navTop: menuButton.top,
      brandTop: menuButton.bottom + 18
    })
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
  openVideo(event) {
    go(`/pages/video-detail/index?id=${event.currentTarget.dataset.id}`)
  },
  onShareAppMessage() {
    return {
      title: '瓷艺课堂｜影像记录千年制瓷技艺',
      path: '/pages/video-learning/index',
      imageUrl: featured.cover
    }
  }
})
