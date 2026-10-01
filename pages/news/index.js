const news = require('../../data/news')
const { go } = require('../../utils/navigation')

const featuredNews = news.find((item) => item.id === 'news-002') || news[0]

Page({
  data: {
    featured: featuredNews,
    latestNews: news.filter((item) => item.id !== featuredNews.id)
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
