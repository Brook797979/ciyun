const { error } = require('./errors')
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function text(value, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw error('INVALID_INPUT')
  return value.trim()
}
function id(value) { const result = text(value, 128); if (!/^[A-Za-z0-9_-]+$/.test(result)) throw error('INVALID_INPUT'); return result }
function ids(value, maximum = 20) { if (!Array.isArray(value) || value.length > maximum) throw error('INVALID_INPUT'); return [...new Set(value.map(id))] }
function imageType(bytes, maxBytes = 5 * 1024 * 1024) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes || bytes.length < 12) throw error('INVALID_IMAGE')
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  throw error('INVALID_IMAGE')
}
function validateIdentify(value, ceramics) {
  try {
    if (!object(value) || !['recognized', 'uncertain', 'not_ceramic'].includes(value.status)) throw new Error()
    const result = { status: value.status }
    if ('name' in value) result.name = text(value.name, 120, 0)
    if ('tags' in value) {
      if (!Array.isArray(value.tags) || value.tags.length > 6) throw new Error()
      result.tags = value.tags.map(item => text(item, 40, 0))
    }
    for (const key of ['shape', 'category', 'glazeDescription', 'technique', 'cultureIntro']) result[key] = text(value[key], 1800, 0)
    for (const key of ['patterns', 'observations']) {
      if (!Array.isArray(value[key]) || value[key].length > 12) throw new Error()
      result[key] = value[key].map(item => text(item, 400))
    }
    if (value.relatedCeramicId) {
      if (!ceramics.some(item => item.id === value.relatedCeramicId)) throw new Error()
      result.relatedCeramicId = value.relatedCeramicId
    }
    return result
  } catch { throw error('MODEL_INVALID_RESPONSE', true) }
}
function validateChat(value, ceramics) {
  try {
    if (!object(value)) throw new Error()
    const answer = text(value.answer, 6000)
    const sources = []
    const seen = new Set()
    for (const sourceId of Array.isArray(value.sourceIds) ? value.sourceIds : []) {
      if (typeof sourceId !== 'string' || seen.has(sourceId)) continue
      const ceramic = ceramics.find(item => item.id === sourceId)
      if (!ceramic) continue
      seen.add(sourceId)
      sources.push({ id: ceramic.id, name: ceramic.name })
      if (sources.length === 8) break
    }
    return { answer, sources }
  } catch { throw error('MODEL_INVALID_RESPONSE', true) }
}
module.exports = { object, text, id, ids, imageType, validateIdentify, validateChat }
