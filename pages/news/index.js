const news = require('../../data/news')
const { go } = require('../../utils/navigation')

const defaultFeatured = news.find((item) => item.id === 'news-002') || news[0]

Page({
  data: {
    featured: defaultFeatured,
    latestNews: news
  },
  onLoad(options) {
    const featured = news.find((item) => item.id === (options && options.active))
    if (featured) this.setData({ featured })
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
  openDetail(event) { go(`/pages/news-detail/index?id=${event.currentTarget.dataset.id}`) }
})
