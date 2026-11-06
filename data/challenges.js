const catalogs = {
  shape: require('./shapes'),
  pattern: require('./patterns'),
  glaze: require('./glazes')
}
const kindLabels = { shape: '器型', pattern: '纹样', glaze: '釉色' }

const definitions = [
  ['溪畔初逢', 'shape', 'bowl'],
  ['莲枝入画', 'pattern', 'pattern-scroll-lotus'],
  ['豆青映水', 'glaze', 'glaze-bean'],
  ['瓶中春色', 'shape', 'vase'],
  ['花鸟相和', 'pattern', 'pattern-flower-bird'],
  ['米釉凝光', 'glaze', 'glaze-rice'],
  ['蒜口含香', 'shape', 'garlic'],
  ['瑞兽呈祥', 'pattern', 'pattern-beast'],
  ['霁蓝入夜', 'glaze', 'glaze-cobalt'],
  ['双耳听风', 'shape', 'double-ear'],
  ['山水入瓷', 'pattern', 'pattern-landscape'],
  ['胭脂初成', 'glaze', 'glaze-rouge']
]

// Static level definitions; completion and availability come from saved progress.
module.exports = definitions.map(([name, type, rewardId], index) => {
  const item = catalogs[type].find(({ id }) => id === rewardId)
  const difficulty = Math.floor(index / 4) + 1
  const reward = {
    type,
    id: item.id,
    name: item.name,
    image: item.image,
    kindLabel: kindLabels[type]
  }
  if (item.color) reward.color = item.color

  return {
    id: `level-${String(index + 1).padStart(3, '0')}`,
    order: index + 1,
    name,
    chapterId: `chapter-${difficulty}`,
    difficulty,
    difficultyStars: [1, 2, 3].map((star) => star <= difficulty),
    reward,
    rewardLabel: `${reward.kindLabel} · ${reward.name}`
  }
})
