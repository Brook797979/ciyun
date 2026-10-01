const featured = {
  id: 'featured',
  title: '从泥土到瓷器——传统制瓷工艺',
  titleLines: ['从泥土到瓷器', '——传统制瓷工艺'],
  description: '一捧泥土，历经千锤百炼，成就东方之美。',
  duration: '12:36',
  cover: '/assets/videos/featured.jpg',
  src: '',
  url: '/pages/video-detail/index?id=featured'
}

const videos = [
  { id: 'throwing', title: '拉坯成型', description: '感受泥土的温度，见证器物的雏形。', duration: '08:28', cover: '/assets/videos/throwing.jpg', src: '', url: '/pages/video-detail/index?id=throwing' },
  { id: 'blue-white', title: '青花绘制', description: '一笔一画，绘就千年。', duration: '08:15', cover: '/assets/videos/blue-white.jpg', src: '', url: '/pages/video-detail/index?id=blue-white' },
  { id: 'glazing', title: '施釉工艺', description: '釉色流转，成就温润之美。', duration: '07:42', cover: '/assets/videos/glazing.jpg', src: '', url: '/pages/video-detail/index?id=glazing' },
  { id: 'firing', title: '窑火烧制', description: '烈火淬炼，成就永恒。', duration: '10:20', cover: '/assets/videos/firing.jpg', src: '', url: '/pages/video-detail/index?id=firing' },
  { id: 'pattern', title: '传统纹样绘制', description: '纹必有意，图必有源。', duration: '09:18', cover: '/assets/videos/pattern.jpg', src: '', url: '/pages/video-detail/index?id=pattern' },
  { id: 'artisan', title: '非遗匠人故事', description: '坚守一生，只为一件好瓷。', duration: '11:05', cover: '/assets/videos/artisan.jpg', src: '', url: '/pages/video-detail/index?id=artisan' }
]

module.exports = {
  featured,
  videos,
  allVideos: [featured, ...videos]
}
