const { go } = require('../../utils/navigation')

Page({
  data: { entries: [
    { title: 'AI识瓷', description: '上传图片，探索器型、纹样与工艺', url: '/pages/ai-identify/index' },
    { title: '数字制瓷', description: '选择器型、纹样与釉色', url: '/pages/craft/index' },
    { title: '闯关挑战', description: '在趣味关卡中解锁传统纹样', url: '/pages/challenge/index' },
    { title: 'AI问答', description: '向陶瓷文化助手提问', url: '/pages/ai-chat/index' },
    { title: '视频学习', description: '学习拉坯、绘瓷与烧制', url: '/pages/video-learning/index' },
    { title: '陶瓷资讯', description: '浏览文化、非遗与展览内容', url: '/pages/news/index' }
  ] },
  openEntry(event) { go(event.currentTarget.dataset.url) }
})
