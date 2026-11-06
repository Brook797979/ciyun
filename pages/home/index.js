const { resolveMedia } = require('../../utils/static-media')
const home = resolveMedia(require('../../data/home'))
const { go } = require('../../utils/navigation')

Page({
  data: home,
  openUrl(event) {
    const url = event.currentTarget.dataset.url || event.detail.url
    go(url)
  },
  openFeature(event) {
    const { url } = event.currentTarget.dataset
    go(url)
  },
  openNews() { go('/pages/news/index') },
})
