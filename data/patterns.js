const pattern = (id, name, category, description, sourceLevelId) => {
  const assetRoot = '/assets/craft/two-vessel-v2'
  return {
    id: `pattern-${id}`,
    name,
    category,
    description,
    image: `${assetRoot}/cards/${id}.png`,
    texture: `/assets/patterns/craft-${id}.svg`,
    unlocked: sourceLevelId === null,
    sourceLevelId,
    previewImages: {
      meiping: `${assetRoot}/meiping/${id}-preview.jpg`,
      yuhuchun: `${assetRoot}/yuhuchun/${id}-preview.jpg`,
      vase: `${assetRoot}/vase/${id}-preview.jpg`,
      bowl: `${assetRoot}/bowl/${id}-preview.jpg`,
      garlic: `${assetRoot}/garlic/${id}-preview.jpg`,
      'double-ear': `${assetRoot}/double-ear/${id}-preview.jpg`
    }
  }
}

module.exports = [
  pattern('lotus', '青花莲纹', '花卉纹样', '出淤泥而不染', null),
  pattern('cloud', '祥云纹', '吉祥纹样', '祥瑞流转福泽绵长', null),
  pattern('flower-bird', '花鸟纹', '花鸟纹样', '花开富贵生机盎然', 'level-005'),
  pattern('landscape', '山水纹', '山水纹样', '山水清远意境悠长', 'level-011'),
  pattern('scroll-lotus', '缠枝莲纹', '缠枝纹样', '枝叶相连生生不息', 'level-002'),
  pattern('beast', '瑞兽纹', '瑞兽纹样', '瑞兽守护吉庆安康', 'level-008')
]
