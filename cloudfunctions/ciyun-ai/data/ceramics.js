const detailVideoCover = '/assets/videos/glazing.jpg'
const museumCloudRoot = 'cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/'

function realMuseumVideo(number) {
  return {
    cover: `/assets/videos/museum-covers-20261020/ceramic-${number}.jpg`,
    src: `${museumCloudRoot}videos/ceramic-detail/ceramic-${number}.mp4`
  }
}

function createDetailVideo(id, title, description, duration, media = {}) {
  return {
    id: `ceramic-video-${id}`,
    title,
    description,
    duration,
    cover: media.cover || detailVideoCover,
    src: media.src || '',
    // Each ceramic has its own upload destination and replaceable local cover.
    cloudPath: `videos/ceramic-detail/ceramic-${id}.mp4`,
    coverResourcePath: `/assets/videos/museum-covers-20261020/ceramic-${id}.jpg`,
    resourcePath: `/assets/videos/ceramic-detail-${id}.mp4`
  }
}

module.exports = [
  {
    id: 'ceramic-001',
    name: '青花缠枝莲纹梅瓶',
    dynasty: '明代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-001.jpg',
    keywords: ['青花', '梅瓶', '缠枝莲', '釉下彩'],
    shape: '梅瓶',
    type: '梅瓶',
    category: '青花瓷',
    tags: ['青花', '缠枝莲纹', '明代'],
    pattern: '缠枝莲纹',
    craft: '青花釉下彩',
    intro: '白地青花层次清晰，缠枝莲纹随器身舒展，呈现端庄饱满的装饰节奏。',
    description: '此梅瓶造型秀美，线条流畅，通体以青花绘缠枝莲纹。枝叶舒展，花姿典雅，青白相映，意境清雅，是明代青花瓷中兼具艺术价值与时代风格的典型器物。',
    video: createDetailVideo('001', '广庆祥拍卖丨清道光 青花缠枝莲纹赏瓶', '观察清道光青花赏瓶的器形与缠枝莲纹，作为青花装饰的相关参考影像。', '01:14', realMuseumVideo('001'))
  },
  {
    id: 'ceramic-002',
    name: '汝窑天青釉莲瓣碗',
    dynasty: '宋代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-002.jpg',
    keywords: ['汝窑', '天青釉', '莲瓣碗', '开片'],
    shape: '莲瓣碗',
    type: '莲瓣碗',
    category: '青瓷',
    tags: ['汝窑', '天青釉', '宋代'],
    pattern: '莲瓣',
    craft: '天青釉',
    intro: '器形取莲瓣舒展之意，釉色温润含蓄，细密开片增添自然雅趣。',
    description: '此碗以莲瓣为形，口沿舒展，腹壁柔和。通体施天青釉，釉色含蓄温润，细密开片若冰裂自然生长，集中体现宋代汝窑崇尚素雅、宁静与内敛的审美追求。',
    video: createDetailVideo('002', '北宋 汝窯 蓮花式溫碗', '从莲花式器形与天青釉色，走近汝窑温碗的形态、釉面细节与文化意趣。', '24:34', realMuseumVideo('002'))
  },
  {
    id: 'ceramic-003',
    name: '粉彩花鸟纹瓶',
    dynasty: '清代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-003.jpg',
    keywords: ['粉彩', '花鸟', '牡丹', '赏瓶'],
    shape: '赏瓶',
    type: '赏瓶',
    category: '粉彩瓷',
    tags: ['粉彩', '花鸟纹', '清代'],
    pattern: '花鸟纹',
    craft: '粉彩',
    intro: '粉彩设色柔和明丽，花卉与禽鸟错落相映，展现清代瓷绘的细腻气韵。',
    description: '此瓶器形端庄，粉彩设色柔和明丽，牡丹与禽鸟错落相映。画面层次细腻，色彩清润而不失华美，呈现清代彩瓷在勾线、填色与题材经营上的成熟技艺。',
    video: createDetailVideo('003', '雍正粉彩花鸟纹抱月瓶｜大英博物馆收藏', '以大英博物馆收藏的抱月瓶为相关参考，观察粉彩花鸟的构图、设色与器形。', '01:09', realMuseumVideo('003'))
  },
  {
    id: 'ceramic-004',
    name: '哥窑开片纹炉',
    dynasty: '宋代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-004.jpg',
    keywords: ['哥窑', '开片', '香炉', '双耳炉'],
    shape: '双耳炉',
    type: '双耳炉',
    category: '开片釉瓷',
    tags: ['哥窑', '开片纹', '宋代'],
    pattern: '开片纹',
    craft: '开片釉',
    intro: '双耳与圆腹造型古雅，釉面开片纵横交织，在温润釉光中形成自然纹理。',
    description: '此炉双耳对称、圆腹饱满，比例稳健而古雅。温润釉面布满纵横交织的开片纹，纹路疏密相间、自然天成，在含蓄的色泽中展现哥窑以缺为美、化裂为纹的独特意趣。',
    video: createDetailVideo('004', '【央视纪录】哥窑谜案（2011.04.27）', '跟随纪录影像认识哥窑的历史、器形与开片纹理，感受宋瓷的含蓄之美。', '25:48', realMuseumVideo('004'))
  },
  {
    id: 'ceramic-005',
    name: '青花莲纹大盘',
    dynasty: '元代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-005.jpg',
    keywords: ['青花', '莲纹', '大盘', '团花'],
    shape: '大盘',
    type: '大盘',
    category: '青花瓷',
    tags: ['青花', '莲花纹', '元代'],
    pattern: '莲花纹',
    craft: '青花釉下彩',
    intro: '盘心莲花与多层边饰由内向外展开，构图繁而有序，青花发色浓郁。',
    description: '此盘形制开阔，盘心以莲花团纹为视觉中心，多层边饰由内向外舒展。纹样繁密却井然有序，青花发色浓郁明快，体现元代大型青花器雄浑而富节奏的装饰特点。',
    video: createDetailVideo('005', '元青花 莲池鱼藻纹大盘 湖南博物院', '以湖南博物院莲池鱼藻纹大盘为同类器物参考，了解元青花大盘的纹样布局与器形。', '00:33', realMuseumVideo('005'))
  },
  {
    id: 'ceramic-006',
    name: '白釉长颈瓶',
    dynasty: '唐代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-006.jpg',
    keywords: ['白釉', '长颈瓶', '素瓷', '唐代'],
    shape: '长颈瓶',
    type: '长颈瓶',
    category: '白瓷',
    tags: ['白釉', '素面', '唐代'],
    pattern: '素面',
    craft: '白釉',
    intro: '长颈与圆腹衔接流畅，以纯净白釉突出器物轮廓，气质简洁舒展。',
    description: '此瓶长颈挺拔、圆腹饱满，轮廓转折简洁流畅。通体施纯净白釉，以素面突出器物自身的比例与线条，呈现唐代白瓷明净、大方而舒展的时代气质。',
    video: createDetailVideo('006', '白釉长颈瓶', '观察白釉长颈瓶的口沿、颈肩与腹足比例，体会素瓷器形及釉面的温润质感。', '02:22', realMuseumVideo('006'))
  },
  {
    id: 'ceramic-007',
    name: '三彩凤首壶',
    dynasty: '唐代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-007.jpg',
    keywords: ['唐三彩', '凤首壶', '黄绿釉', '胡风'],
    shape: '凤首壶',
    type: '凤首壶',
    category: '唐三彩',
    tags: ['唐三彩', '凤首', '唐代'],
    pattern: '凤鸟纹',
    craft: '低温铅釉',
    intro: '凤首流与曲柄相互呼应，黄、绿、白三色釉交融，造型充满盛唐气象。',
    description: '此壶以凤首为流，曲柄与修长器身彼此呼应，造型兼具异域气息与东方想象。黄、绿、白三色釉自然交融，生动呈现盛唐开放包容、华美昂扬的审美风貌。',
    video: createDetailVideo('007', '【中原藏珍】异国情调｜唐三彩｜壶口像凤首', '从凤首、曲柄与三彩釉色，观察唐代凤首壶的造型，以及器物背后的文化交流。', '03:41', realMuseumVideo('007'))
  },
  {
    id: 'ceramic-008',
    name: '龙泉窑青釉双耳炉',
    dynasty: '宋代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-008.jpg',
    keywords: ['龙泉窑', '青瓷', '双耳炉', '青釉'],
    shape: '双耳炉',
    type: '双耳炉',
    category: '青瓷',
    tags: ['龙泉窑', '青釉', '宋代'],
    pattern: '素面',
    craft: '龙泉青釉',
    intro: '青釉色泽如玉，双耳与三足比例稳健，以简净器形表现宋瓷的含蓄之美。',
    description: '此炉双耳对称、三足稳健，器形简净而富古意。龙泉青釉层次丰厚，色泽温润如玉，在克制的装饰与端正比例中，体现宋瓷追求自然、含蓄与平和的审美精神。',
    video: createDetailVideo('008', '龙泉青瓷弟窑粉青釉双耳炉', '观察龙泉青瓷双耳炉的器形、粉青釉色与细部，感受青瓷温润如玉的质感。', '00:25', realMuseumVideo('008'))
  },
  {
    id: 'ceramic-009',
    name: '青花云龙纹罐',
    dynasty: '元代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-009.jpg',
    keywords: ['青花', '云龙纹', '大罐', '龙纹'],
    shape: '大罐',
    type: '大罐',
    category: '青花瓷',
    tags: ['青花', '云龙纹', '元代'],
    pattern: '云龙纹',
    craft: '青花釉下彩',
    intro: '苍龙穿行于云气之间，饱满器身与强烈青白对比营造出雄健的视觉气势。',
    description: '此罐器身饱满，苍龙穿行于翻卷云气之间，构图充满动势。浓郁青花与洁白胎釉形成鲜明对比，展现元代青花大器雄健豪迈、层次丰富的艺术风格。',
    video: createDetailVideo('009', '稀世之宝！元青花云龙纹罐，国家博物馆典藏珍宝', '通过国家博物馆相关影像观察云龙纹与器形，体会元青花大罐的纹饰力量与节奏。', '01:05', realMuseumVideo('009'))
  },
  {
    id: 'ceramic-010',
    name: '斗彩鸡缸杯',
    dynasty: '清代',
    image: '/assets/ceramics/museum-white-20261020/ceramic-010.jpg',
    keywords: ['斗彩', '鸡缸杯', '花鸟', '杯'],
    shape: '杯',
    type: '鸡缸杯',
    category: '斗彩瓷',
    tags: ['斗彩', '鸡纹', '清代'],
    pattern: '鸡纹',
    craft: '斗彩',
    intro: '庭院花石与鸡群相映成趣，釉下青花和釉上彩共同构成清雅细腻的画面。',
    description: '此杯小巧精致，庭院花石与鸡群相映成趣，生活气息盎然。釉下青花先勾轮廓，釉上彩再填色设色，两次彩绘相互衔接，形成清雅细腻而富层次的画面。',
    video: createDetailVideo('010', '一个杯价值2亿元，这个连乾隆都爱的瓷器，到底什么来头？', '从鸡缸杯的器形与斗彩纹饰，走近这类小巧器物的艺术特点和历史故事。', '02:36', realMuseumVideo('010'))
  }
]
