const symbols = [
  ['lotus', '莲纹'], ['cloud', '祥云'], ['leaf', '枝叶'],
  ['wave', '水波'], ['flower', '花卉'], ['bird', '飞鸟'],
  ['fish', '游鱼'], ['bamboo', '翠竹'], ['butterfly', '蝴蝶'], ['coin', '古钱']
].map(([id, name]) => ({ id, name, image: `/games/assets/motifs/${id}.png` }))

// The level registry does not import this catalog, so compatibility stays acyclic.
const levels = require('./levels')
const modes = ['level-001', 'level-002', 'level-003', 'level-004'].map(id => levels[id])

module.exports = { symbols, modes }
