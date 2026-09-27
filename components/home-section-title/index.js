Component({ properties: { title: String, actionText: { type: String, value: '更多' }, icon: String }, methods: { onAction() { this.triggerEvent('action') } } })
