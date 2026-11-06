const { styles } = require('../data/ai-create')

// The future generation API should consume this request, including its composed prompt.
// Local style thumbnails are display assets, not model image-reference inputs.
function buildGenerationRequest(prompt, styleId) {
  if (typeof prompt !== 'string' || !prompt.trim()) return null
  const userPrompt = prompt.trim().slice(0, 200)
  const style = styles.find((item) => item.id === styleId) || styles.find((item) => item.id === 'qinghua')
  return {
    version: 1,
    userPrompt,
    styleId: style.id,
    styleName: style.name,
    prompt: [
      '生成一张中国瓷器设计图，以瓷器为画面主体，呈现完整器型和清晰的瓷质釉面。',
      `创意描述：${userPrompt}`,
      `所选风格：${style.name}\n风格要求：${style.generationPrompt}`,
      '风格优先规则：保留创意描述中的器型、主题与构图；工艺、配色和釉面质感以所选风格为准。若描述中包含其他风格的工艺或配色，请用所选风格重新诠释该主题。'
    ].join('\n\n')
  }
}

module.exports = { buildGenerationRequest }
