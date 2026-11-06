const { styles } = require('./ai-create')
const ceramics = require('./ceramics')

// Curated display records are never substituted for a live provider response.
const generationCases = styles.map(style => ({
  id: `lotus-${style.id}`,
  name: `月下莲影 · ${style.name}`,
  styleId: style.id,
  styleName: style.name,
  prompt: '设计一件完整的玉壶春瓶，以月夜莲池为主题。器身融入盛开的莲花、舒展荷叶和一轮明月，保留疏朗留白，呈现东方陶瓷的温润质感。',
  image: `/assets/ai-showcase/lotus-${style.id}.jpg`,
  createdAt: '2026-10-14',
  source: 'showcase',
  provenance: '内置imagegen生成的月夜莲纹系列，非本次实时Seedream结果'
}))

const identificationCases = ['ceramic-001', 'ceramic-003', 'ceramic-002'].map(id => {
  const item = ceramics.find(value => value.id === id)
  return {
    id: `identify-${id}`,
    name: item.name,
    image: item.image,
    createdAt: '2026-10-14',
    source: 'showcase',
    result: {
      status: 'recognized',
      shape: item.shape,
      category: item.category,
      patterns: [item.pattern],
      glazeDescription: item.category === '青花瓷' ? '瓷白底釉与钴蓝纹饰相映' : item.category === '粉彩瓷' ? '白釉底上呈现柔和多彩设色' : '青绿色釉面温润，色阶含蓄',
      technique: item.craft,
      observations: [item.intro],
      cultureIntro: item.description,
      relatedCeramicId: item.id
    }
  }
})

const chatCases = [{
  id: 'lotus-culture',
  question: '瓷器上的莲纹有什么寓意？',
  answer: '莲纹常借莲花清雅、出淤泥而不染的形象表达高洁，也与佛教艺术有关。缠枝莲让花朵、枝叶连续回旋，形成富有节奏的装饰。欣赏时，可以观察花瓣的层次和枝叶如何顺着器型舒展；创作时，也可以用留白把这种清雅气质融入自己的设计。',
  ceramicId: 'ceramic-001',
  createdAt: '2026-10-14',
  source: 'showcase'
}]

function findGenerationCase(id) {
  return generationCases.find(item => item.id === id) || null
}

module.exports = { generationCases, identificationCases, chatCases, findGenerationCase }
