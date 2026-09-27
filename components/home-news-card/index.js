Component({ properties: { item: Object, carousel: Boolean }, methods: { onTap() { this.triggerEvent('select', { url: this.properties.item.url }) } } })
