const clean = value => typeof value === 'string' ? value.trim() : ''
const list = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()).slice(0, 12) : []
const cultureCaveat = /(?:仅凭|仅根据|只能|仅能|仅可|只可|只根据|只凭)[^。！？；]{0,30}(?:图|照片|可见|观察|描述)|(?:本图|图片|照片|当前视角)[^。！？；]{0,40}(?:局限|不足|限制|仅|只能)|(?:无法|难以|不能|不足以|尚不能)[^。！？；]{0,20}(?:判断|确定|确认|鉴定|推断)|(?:年代|窑口|真伪|产地|来源|制作背景)[^。！？；]{0,45}(?:需要?(?:结合|通过|进一步|更多|实物|专业)|尚待|有待|无法|不能|难以|不详|不明)/
const catalogComparison = /(?:参考|参照|对照|对比)[^。！？；]{0,12}(?:馆藏|资料)|ceramic-[\w-]+/i
function cultureFallback(result) {
  const category = /疑似|可能|不明|不清|无法|不能|难以/.test(result.category) ? '' : result.category
  if (/青花/.test(category)) return '青花瓷以蓝白相映形成清雅的装饰风格，绘饰的线条与浓淡变化让纹样富于层次。瓶、罐、碗、盘等器型各具姿态，与装饰相互呼应，体现陶瓷艺术对造型与画意的融合。'
  if (/青瓷/.test(category)) return '青瓷以温润的釉色与含蓄的光泽展现陶瓷之美。器型的曲线、釉面的质感与装饰相互映衬，体现传统陶瓷对自然意趣和简雅格调的追求。'
  return '陶瓷的造型、釉色与装饰共同构成其艺术语言。器型的比例与曲线、釉面的色泽与质感、纹饰的布局与节奏相互呼应，呈现传统陶瓷丰富的审美趣味。'
}
function cultureIntroduction(result) {
  if (!result.cultureIntro) return ''
  if (!cultureCaveat.test(result.cultureIntro) && !catalogComparison.test(result.cultureIntro)) return result.cultureIntro
  // Older sessions and cached responses may still contain the previous prompt's appraisal notes.
  const introduction = (result.cultureIntro.match(/[^。！？；\n]+[。！？；]?/g) || []).map(sentence => {
    const problems = [sentence.search(catalogComparison), sentence.search(cultureCaveat)].filter(index => index >= 0)
    if (!problems.length) return sentence
    const firstProblem = Math.min(...problems)
    const beforeProblem = sentence.slice(0, firstProblem)
    const contrast = beforeProblem.search(/(?:[，,]\s*)?(?:但|不过|然而)/)
    const boundary = contrast >= 0 ? contrast : Math.max(beforeProblem.lastIndexOf('，'), beforeProblem.lastIndexOf(','))
    const prefix = boundary > 0 ? sentence.slice(0, boundary).trim() : ''
    return prefix && !cultureCaveat.test(prefix) && !catalogComparison.test(prefix) ? prefix.replace(/[，,：:]+$/, '') + '。' : ''
  }).join('').trim()
  return introduction || (result.status === 'not_ceramic' ? '' : cultureFallback(result))
}
function normalizeResult(value) {
  if (!value || !['recognized', 'uncertain', 'not_ceramic'].includes(value.status)) throw Object.assign(new Error('识瓷结果暂未完整返回，请重新查询。'), { code: 'INVALID_RESPONSE' })
  const result = { status: value.status }
  for (const key of ['name', 'shape', 'category', 'glazeDescription', 'technique', 'cultureIntro', 'relatedCeramicId']) result[key] = clean(value[key])
  for (const key of ['tags', 'patterns', 'observations']) result[key] = list(value[key])
  if (result.status !== 'not_ceramic' && (!result.observations.length || !result.cultureIntro)) throw Object.assign(new Error('识瓷结果暂未完整返回，请重新查询。'), { code: 'INVALID_RESPONSE' })
  result.cultureIntro = cultureIntroduction(result)
  return result
}
function createResultView(value, ceramics = []) {
  const result = normalizeResult(value)
  const fallback = [result.category, result.patterns[0], result.shape].filter(Boolean).join(' · ')
  const resultName = result.name || (result.status === 'not_ceramic' ? '未发现可辨识的陶瓷' : fallback || '器物观察结果')
  const resultTags = [...new Set(result.tags.length ? result.tags : [result.category, ...result.patterns, result.shape].filter(Boolean))].slice(0, 4)
  return {
    result, resultName, resultTags,
    resultTitle: result.status === 'uncertain' ? '图片线索尚不充分' : resultName,
    featureCards: [
      { name: '器型', value: result.shape || '器型细节不清晰', mark: '形' },
      { name: '纹饰', value: result.patterns.join('、') || '未见清晰纹饰', mark: '纹' },
      { name: '釉色', value: result.glazeDescription || '釉面细节不清晰', mark: '釉' },
      { name: '工艺', value: result.technique || '工艺线索不充分', mark: '艺' }
    ],
    relatedCeramic: result.status === 'recognized' ? ceramics.find(item => item.id === result.relatedCeramicId) || null : null
  }
}
module.exports = { normalizeResult, createResultView }
