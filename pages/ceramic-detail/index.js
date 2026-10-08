const ceramics = require('../../data/ceramics')
const { go } = require('../../utils/navigation')

Page({
  data: {
    item: ceramics[0],
    navTop: 24,
    navHeight: 32,
    heroHeight: 98
  },

  onLoad(options = {}) {
    const item = ceramics.find((ceramic) => ceramic.id === options.id) || ceramics[0]
    const windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : { windowWidth: 375 }
    const scale = windowInfo.windowWidth / 750
    let navTop = this.data.navTop
    let navHeight = this.data.navHeight
    let menuBottom = navTop + navHeight

    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.top) {
        navTop = menuButton.top
        navHeight = menuButton.height || menuButton.bottom - menuButton.top || navHeight
        menuBottom = menuButton.bottom || navTop + navHeight
      }
    }

    this.setData({
      item,
      navTop,
      navHeight,
      heroHeight: Math.max(188 * scale, menuBottom + 24 * scale)
    })
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function'
      ? getCurrentPages()
      : (typeof wx.getCurrentPages === 'function' ? wx.getCurrentPages() : [])

    if (pages.length > 1 && typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 })
      return
    }

    go('/pages/museum/index')
  },

  ask() {
    go(`/pages/ai-chat/index?ceramicId=${this.data.item.id}`)
  }
})
