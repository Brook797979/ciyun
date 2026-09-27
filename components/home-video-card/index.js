Component({ properties: { item: Object }, methods: { onTap() { this.triggerEvent('select', { url: this.properties.item.url }) } } })
