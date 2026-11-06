const levels = require('./challenges')
const chapterBadges = require('./chapter-badges')

const chapters = [
  {
    id: 'chapter-1',
    number: 1,
    name: '溪畔识瓷',
    subtitle: '循溪而行 · 初见瓷韵',
    description: '在溪水与竹影之间，遇见器型、纹样和釉色的初始之美。',
    background: '/assets/challenge/chapter-1.jpg'
  },
  {
    id: 'chapter-2',
    number: 2,
    name: '青花作坊',
    subtitle: '入坊观瓷 · 一笔青花',
    description: '走进青花作坊，在花鸟与瑞兽之间，细赏瓷上的万千意趣。',
    background: '/assets/challenge/chapter-2.jpg'
  },
  {
    id: 'chapter-3',
    number: 3,
    name: '窑火成器',
    subtitle: '窑火映瓷 · 淬炼成章',
    description: '沿窑火的微光前行，让山水与釉色在瓷器上相逢。',
    background: '/assets/challenge/chapter-3.jpg'
  }
].map((chapter, index, allChapters) => ({
  ...chapter,
  nextChapterId: allChapters[index + 1] ? allChapters[index + 1].id : '',
  nextChapterName: allChapters[index + 1] ? allChapters[index + 1].name : '',
  levels: levels.filter(({ chapterId }) => chapterId === chapter.id)
}))

const badges = chapterBadges.map((badge) => ({
  ...badge,
  name: badge.title,
  description: `完成「${badge.chapterName}」全部关卡后解锁。`,
  image: badge.badgeImageUnlocked
}))

module.exports = {
  chapters,
  totalCount: levels.length,
  badges
}
