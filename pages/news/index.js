const { resolveMedia } = require('../../utils/static-media')
const news = resolveMedia(require('../../data/news'))
const { go } = require('../../utils/navigation')

const featuredNews = news.find((item) => item.id === 'news-002') || news[0]
const latestNewsIds = ['news-005', 'news-004', 'news-007', 'news-006', 'news-008']
const latestNews = latestNewsIds.map((id) => news.find((item) => item.id === id)).filter(Boolean)

Page({
  data: {
    featured: featuredNews,
    latestNews: latestNews,
    navTop: 24
  },
  onLoad() {
    if (typeof wx.getMenuButtonBoundingClientRect !== 'function') return
    const menuButton = wx.getMenuButtonBoundingClientRect()
    if (menuButton && menuButton.top) this.setData({ navTop: menuButton.top })
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
