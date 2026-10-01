Component({
  properties: { item: Object, carousel: Boolean },
  methods: {
    onPlaceholderTap() {
      this.triggerEvent('select', { url: this.data.item.url })
    },
    onPlay() { this.triggerEvent('playstate', { playing: true }) },
    onPause() { this.triggerEvent('playstate', { playing: false }) },
    onEnded() { this.triggerEvent('playstate', { playing: false }) }
  }
})
