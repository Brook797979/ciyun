const { resolveMedia } = require('../../utils/static-media')
const ceramics = resolveMedia(require('../../data/ceramics'))
const filterCeramics = require('../../utils/filter-ceramics')
const { go } = require('../../utils/navigation')

Page({
  data: {
    dynasties: ['全部', '唐代', '宋代', '元代', '明代', '清代'],
    selectedDynasty: '全部',
    keyword: '',
    filteredCeramics: ceramics,
    selectedCeramicId: '',
    navTop: 24,
    brandTop: 60,
    heroHeight: 142
  },
  onLoad() {
    const windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : { windowWidth: 390 }
    const scale = windowInfo.windowWidth / 750
    let brandTop = this.data.brandTop

    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.top) {
        brandTop = menuButton.top + (menuButton.height || menuButton.bottom - menuButton.top) / 2
        this.setData({ navTop: menuButton.top })
      }
    }

    this.setData({
      brandTop,
      heroHeight: Math.max(278 * scale, brandTop + 98 * scale)
    })
  },
  applyFilters() {
    this.setData({
      filteredCeramics: filterCeramics(
        ceramics,
        this.data.keyword,
        this.data.selectedDynasty
      )
    })
  },
  onSearchInput(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilters())
  },
  selectDynasty(event) {
    this.setData(
      { selectedDynasty: event.currentTarget.dataset.dynasty },
      () => this.applyFilters()
    )
  },
  selectCeramic(event) {
    const id = event.detail.id
    this.setData({ selectedCeramicId: id })
    go(`/pages/ceramic-detail/index?id=${id}`)
  }
})
