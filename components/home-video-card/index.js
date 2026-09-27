Component({
  properties: { item: Object },
  methods: {
    onPlaceholderTap() {
      wx.showToast({ title: '视频资源待补充', icon: 'none' })
    }
  }
})
