Component({
  properties: { item: Object, carousel: Boolean },
  methods: {
    onPlaceholderTap() {
      wx.showToast({ title: '视频资源待补充', icon: 'none' })
    },
    onPlay() { this.triggerEvent('playstate', { playing: true }) },
    onPause() { this.triggerEvent('playstate', { playing: false }) },
    onEnded() { this.triggerEvent('playstate', { playing: false }) }
  }
})
