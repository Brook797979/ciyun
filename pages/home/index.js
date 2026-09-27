const home = require('../../data/home')
const { go } = require('../../utils/navigation')

Page({
  data: home,
  openUrl(event) {
    const url = event.currentTarget.dataset.url || event.detail.url
    go(url)
  },
  openFeature(event) {
    const { id, url } = event.currentTarget.dataset
    if (id === 'video') {
      const video = this.data.features.find((item) => item.id === 'video')
      if (!video.videoSrc) wx.showToast({ title: '视频资源待补充', icon: 'none' })
      return
    }
    go(url)
  },
  openNews() { go('/pages/news/index') },
})
