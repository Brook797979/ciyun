Component({ properties: { title: String, description: String, disabled: Boolean }, methods: { onTap() { if (!this.properties.disabled) this.triggerEvent('select') } } })
