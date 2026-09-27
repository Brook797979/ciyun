module.exports = {
  features: [
    { id: 'identify', title: 'AI识瓷', description: '拍照识别\n探索陶瓷之美', action: '识瓷', url: '/pages/ai-identify/index', image: '/assets/ceramics/home-feature-identify.jpg', tone: 'blue', size: 'medium' },
    { id: 'craft', title: '数字制瓷', description: '从泥土到瓷器\n体验传统制瓷工艺', action: '创作', url: '/pages/craft/index', image: '/assets/ceramics/home-feature-craft.jpg', tone: 'ivory', size: 'large' },
    { id: 'challenge', title: '瓷境闯关', description: '趣味挑战\n解锁纹样与知识', action: '挑战', url: '/pages/challenge/index', image: '/assets/ceramics/home-feature-challenge.jpg', tone: 'red', size: 'large' },
    { id: 'video', title: '视频课堂', description: '跟随匠人\n学习陶瓷工艺', action: '播放', url: '/pages/video-learning/index', image: '/assets/ceramics/home-feature-video.jpg', videoSrc: '', tone: 'blue', size: 'medium' }
  ],
  aiAssistant: { title: 'AI陶瓷助手', description: '关于陶瓷，你想了解什么？', action: '问问AI', url: '/pages/ai-chat/index', image: '/assets/banners/home-ai-assistant.jpg' },
  videos: [
    { id: 'throwing', title: '拉坯成型', description: '感受泥土的温度', duration: '06:28', image: '/assets/videos/home-video-throwing.jpg', src: '', url: '/pages/video-learning/index' },
    { id: 'painting', title: '青花绘制', description: '一笔一画，绘就千年', duration: '08:15', image: '/assets/videos/home-video-painting.jpg', src: '', url: '/pages/video-learning/index' },
    { id: 'firing', title: '传统烧瓷工艺', description: '窑火淬炼，成就瓷韵', duration: '07:42', image: '/assets/videos/home-video-firing.jpg', src: '', url: '/pages/video-learning/index' }
  ],
  news: [
    { id: 'news-001', category: '文化', title: '千年瓷韵：从海上丝绸之路看中国陶瓷', date: '2026.09.20', image: '/assets/banners/home-news-culture.jpg', url: '/pages/news/index?active=news-001' },
    { id: 'news-002', category: '展览', title: '“东方瓷韵”古代陶瓷特展启幕', date: '2026.09.15', image: '/assets/banners/home-news-exhibition.jpg', url: '/pages/news/index?active=news-002' },
    { id: 'news-003', category: '非遗', title: '传统制瓷工艺里的匠心传承', date: '2026.09.10', image: '/assets/banners/home-news-heritage.jpg', url: '/pages/news/index?active=news-003' }
  ]
}
