const assert = require('node:assert/strict')
const test = require('node:test')
const { createResultView } = require('../utils/identify-result')

const result = { status: 'recognized', shape: '敞口长颈圆腹瓶', category: '青花瓷', patterns: ['缠枝花卉纹', '蕉叶纹'], glazeDescription: '白地青花', technique: '釉下彩', observations: ['颈部可见蕉叶纹'] }
const view = cultureIntro => createResultView({ ...result, cultureIntro }).result.cultureIntro

test('old screenshot introduction keeps the ceramic description and removes caveats and catalog comparison', () => {
  const description = '此器型为敞口长颈圆腹瓶，通体以青花描绘缠枝花卉纹，颈部饰蕉叶纹。'
  assert.equal(view(description + '由于仅凭可见图片观察，无法确定其具体年代、窑口与制作背景，仅能从器形、纹饰与釉色特征进行描述。参考馆藏资料中“青花缠枝莲纹梅瓶”（ceramic-001）具有类似的青花缠枝纹饰与白地青花风格，可供对比观察。'), description)
})

test('a mixed cultural sentence retains its explanation before an appraisal qualification', () => {
  assert.equal(view('此瓶以荷塘月色为饰，青花浓淡表现月夜清韵。荷纹在传统瓷绘中常见，但具体年代、窑口及真伪需结合胎釉、款识等更多信息鉴定。本图仅能观察当前视角外观，细部如款识、胎质等存在局限。'), '此瓶以荷塘月色为饰，青花浓淡表现月夜清韵。荷纹在传统瓷绘中常见。')
})

test('old appraisal phrasing with a need for physical inspection is removed', () => {
  for (const caveat of ['具体年代和窑口需要结合实物进一步判断。', '年代及产地仍需实物鉴定。']) {
    assert.equal(view('缠枝莲纹寓意生生不息。' + caveat), '缠枝莲纹寓意生生不息。')
  }
})

test('culture sharing a sentence with a catalog comparison is retained', () => {
  assert.equal(view('缠枝莲纹寓意生生不息，可参考馆藏资料中的同类器物。'), '缠枝莲纹寓意生生不息。')
})

test('ordinary culture text mentioning history, provenance, negative phrasing and museums remains intact', () => {
  const culture = '青花瓷以釉下绘饰形成蓝白相映的装饰效果。器型不只满足使用，也承载陈设审美；缠枝纹寓意生生不息。各地窑口形成不同的审美传统，博物馆中可见丰富的相关作品。'
  assert.equal(view(culture), culture)
  assert.equal(view('青瓷釉色与窑内气氛有关。莲纹不只装饰，也承载祝愿。'), '青瓷釉色与窑内气氛有关。莲纹不只装饰，也承载祝愿。')
})

test('formatting the displayed introduction repeatedly leaves it unchanged', () => {
  const first = view('荷纹在传统瓷绘中常见，但具体年代仅凭图片无法确定。')
  assert.equal(first, '荷纹在传统瓷绘中常见。')
  assert.equal(view(first), first)
  const fallback = view('仅凭图片无法确定年代。')
  assert.equal(view(fallback), fallback)
})

test('a caveat-only old record receives culture based on its identified features without invented provenance', () => {
  const culture = view('仅根据可见特征进行文化观察。无法确定年代与产地，真伪需进一步鉴定。')
  assert.match(culture, /青花/)
  assert.match(culture, /瓶/)
  assert.doesNotMatch(culture, /无法|仅|鉴定|年代|产地|明代|景德镇|ceramic-/)
})

test('non-ceramic empty culture and invalid incomplete responses retain their existing behavior', () => {
  assert.equal(createResultView({ status: 'not_ceramic', cultureIntro: '', observations: [] }).result.cultureIntro, '')
  assert.throws(() => createResultView({ ...result, cultureIntro: '' }), { code: 'INVALID_RESPONSE' })
})
