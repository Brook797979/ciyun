Component({
  properties: {
    item: Object
  },
  methods: {
    onTap() {
      this.triggerEvent('select', { id: this.properties.item.id })
    }
  }
})
