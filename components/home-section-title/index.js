Component({ properties: { title: String, actionText: { type: String, value: '更多' }, mark: String }, methods: { onAction() { this.triggerEvent('action') } } })
