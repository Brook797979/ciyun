const { allVideos } = require('../../data/videos')

Page({
  data: { item: allVideos[0] },
  onLoad(options) {
    const item = allVideos.find((video) => video.id === options.id) || allVideos[0]
    this.setData({ item })
    wx.setNavigationBarTitle({ title: item.title })
  },
  onShareAppMessage() {
    const { item } = this.data
    return {
      title: `${item.title}｜瓷艺课堂`,
      path: `/pages/video-detail/index?id=${item.id}`,
      imageUrl: item.cover
    }
  }
})
