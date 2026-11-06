const patterns = require('../data/patterns')
const glazes = require('../data/glazes')
const shapes = require('../data/shapes')
const { mediaUrl } = require('./static-media')

function getCraftPreview(shapeId, patternId, glazeId = 'glaze-white') {
  if (!shapes.some((shape) => shape.id === shapeId)) return ''
  const pattern = patterns.find((item) => item.id === patternId)
  const glaze = glazes.find((item) => item.id === glazeId)
  if (!pattern || !glaze) return ''
  if (glaze.id === 'glaze-white') return mediaUrl(pattern.previewImages[shapeId] || '')
  return mediaUrl(`/assets/craft/glazes-v1/${shapeId}/${pattern.id.slice(8)}-${glaze.id.slice(6)}.jpg`)
}

module.exports = { getCraftPreview }
