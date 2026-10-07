const carouselVideos = [
  {
    id: 'carousel-ceramic-life',
    title: '《只瓷一生》非遗纪录片｜景德镇手工制瓷技艺纪录片',
    description: '走近景德镇手工制瓷技艺，感受一器一物背后的时间与匠心。',
    duration: '09:22',
    cover: '/assets/videos/carousel-ceramic-life.jpg',
    cloudPath: 'videos/carousel/ceramic-life.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/carousel/ceramic-life.mp4"
  },
  {
    id: 'carousel-longquan-celadon',
    title: '龙泉青瓷｜内藏雕花·中式瓷韵的极致美学',
    description: '从釉色与雕花中，观看龙泉青瓷含蓄温润的东方美学。',
    duration: '09:24',
    cover: '/assets/videos/carousel-longquan-celadon.jpg',
    cloudPath: 'videos/carousel/longquan-celadon.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/carousel/longquan-celadon.mp4"
  },
  {
    id: 'carousel-kiln-millennium',
    title: '微电影《窑火千年 瓷骋天下》',
    description: '窑火不息，瓷路绵延，在影像中感受千年陶瓷文明。',
    duration: '05:34',
    cover: '/assets/videos/carousel-kiln-millennium.jpg',
    cloudPath: 'videos/carousel/kiln-millennium.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/carousel/kiln-millennium.mp4"
  },
  {
    id: 'carousel-ceramic-history',
    title: '一次看完，中国陶瓷发展史！',
    description: '沿时间脉络了解中国陶瓷的器型、釉色与工艺演变。',
    duration: '27:31',
    cover: '/assets/videos/carousel-ceramic-history.jpg',
    cloudPath: 'videos/carousel/ceramic-history.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/carousel/ceramic-history.mp4"
  }
]

const videos = [
  {
    id: 'selected-ru-porcelain',
    title: '【非遗汝瓷】全世界只有中国会做，裂纹声如风铃般清脆！',
    description: '聆听开片之声，了解汝瓷烧制中的独特技艺。',
    duration: '04:03',
    cover: '/assets/videos/selected-ru-porcelain.jpg',
    cloudPath: 'videos/selected/ru-porcelain.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/ru-porcelain.mp4"
  },
  {
    id: 'selected-three-step-vase',
    title: '3步完成一个精美花瓶！',
    description: '跟随简洁步骤，完成一只富有手作温度的陶艺花瓶。',
    duration: '02:26',
    cover: '/assets/videos/selected-three-step-vase.jpg',
    cloudPath: 'videos/selected/three-step-vase.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/three-step-vase.mp4"
  },
  {
    id: 'selected-cactus-making',
    title: '超简单，一学就会的仙人掌制作展示！',
    description: '用轻松直观的方式，制作一件可爱的陶艺仙人掌。',
    duration: '02:38',
    cover: '/assets/videos/selected-cactus-making.jpg',
    cloudPath: 'videos/selected/cactus-making.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/cactus-making.mp4"
  },
  {
    id: 'selected-bowl-making',
    title: '陶碗制作全过程',
    description: '从泥料塑形到器壁修整，完整观看一只陶碗的诞生。',
    duration: '05:08',
    cover: '/assets/videos/selected-bowl-making.jpg',
    cloudPath: 'videos/selected/bowl-making.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/bowl-making.mp4"
  },
  {
    id: 'selected-throwing-basics',
    title: '陶艺入门拉坯教程',
    description: '从定中心开始，掌握拉坯成型的基础手势与节奏。',
    duration: '03:29',
    cover: '/assets/videos/selected-throwing-basics.jpg',
    cloudPath: 'videos/selected/throwing-basics.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/throwing-basics.mp4"
  },
  {
    id: 'selected-white-vase',
    title: '治愈系手工陶艺，做一个纯白简约风高腰花瓶',
    description: '在缓慢塑形中，完成一只纯白简约的高腰花瓶。',
    duration: '13:58',
    cover: '/assets/videos/selected-white-vase.jpg',
    cloudPath: 'videos/selected/white-vase.mp4',
    src: "cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/videos/selected/white-vase.mp4"
  }
]

module.exports = {
  carouselVideos,
  featured: carouselVideos[0],
  videos,
  allVideos: [...carouselVideos, ...videos]
}
