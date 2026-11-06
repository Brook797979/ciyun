const { go } = require('../../utils/navigation')

Page({
  onLoad() {
    go('/pages/challenge/index')
  },
  back() {
    go('/pages/challenge/index')
  }
})
