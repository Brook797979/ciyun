const news = require('../../data/news')
const { go } = require('../../utils/navigation')

Page({
  data: { news, current: 0 },
  onLoad(options) {
    const index = news.findIndex((item) => item.id === options.active)
    if (index >= 0) this.setData({ current: index })
  },
  onChange(event) { this.setData({ current: event.detail.current }) },
  openDetail(event) { go(`/pages/news-detail/index?id=${event.currentTarget.dataset.id}`) }
})
