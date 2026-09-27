const home = require('../../data/home')
const { go } = require('../../utils/navigation')

Page({
  data: { ...home, videoCarouselAutoplay: true },
  openUrl(event) {
    const url = event.currentTarget.dataset.url || event.detail.url
    go(url)
  },
  openVideos() { go('/pages/video-learning/index') },
  openNews() { go('/pages/news/index') },
  onVideoPlayState(event) { this.setData({ videoCarouselAutoplay: !event.detail.playing }) }
})
