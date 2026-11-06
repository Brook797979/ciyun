const tabs = [
  { id: 'home', name: '首页', route: '/pages/home/index' },
  { id: 'museum', name: '瓷馆', route: '/pages/museum/index' },
  { id: 'workshop', name: '工坊', route: '/pages/workshop/index' },
  { id: 'challenge', name: '挑战', route: '/pages/challenge/index' },
  { id: 'profile', name: '我的', route: '/pages/profile/index' }
]
Component({
  properties: { selected: { type: String, value: 'workshop' }, safeBottom: { type: Number, value: 0 } },
  data: { tabs },
  methods: {
    openTab(event) {
      const tab = tabs.find(item => item.id === event.currentTarget.dataset.id)
      if (tab) wx.switchTab({ url: tab.route })
    }
  }
})
