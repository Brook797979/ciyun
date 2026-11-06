const STORAGE_KEY = 'aiIdentifyHistoryV1'
const LIMIT = 100
const text = value => typeof value === 'string' ? value.trim() : ''
const isObject = value => value && typeof value === 'object' && !Array.isArray(value)
const resultStrings = ['name', 'shape', 'category', 'glazeDescription', 'technique', 'cultureIntro', 'relatedCeramicId']
const resultArrays = ['tags', 'patterns', 'observations']

function historyError(code, message) { return Object.assign(new Error(message), { code }) }
function normalize(value, fallbackTime = 0) {
  if (!isObject(value) || value.source === 'showcase' || value.mode === 'showcase') return null
  const requestId = text(value.requestId); const assetId = text(value.assetId); const result = value.result
  if (!requestId || !assetId || !isObject(result) || result.source === 'showcase' || !['recognized', 'uncertain', 'not_ceramic'].includes(result.status)) return null
  if (resultStrings.some(key => result[key] !== undefined && typeof result[key] !== 'string')) return null
  if (resultArrays.some(key => result[key] !== undefined && (!Array.isArray(result[key]) || result[key].some(item => typeof item !== 'string')))) return null
  const createdAt = value.createdAt === undefined ? fallbackTime : typeof value.createdAt === 'number' ? value.createdAt : typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : NaN
  if (!Number.isFinite(createdAt) || createdAt < 0 || Number.isNaN(new Date(createdAt).getTime())) return null
  let id
  try { const encodedRequestId = encodeURIComponent(requestId); id = text(value.id) || `identify-${encodedRequestId}`; encodeURIComponent(id) }
  catch (_) { return null }
  const normalizedResult = { status: result.status }
  resultStrings.concat(resultArrays).forEach(key => { if (result[key] !== undefined) normalizedResult[key] = Array.isArray(result[key]) ? result[key].slice() : result[key] })
  const record = { id, requestId, assetId, result: normalizedResult, createdAt }
  if (text(value.fileId)) record.fileId = text(value.fileId)
  // Private preview URLs and picker paths expire; assetId is the durable photo reference.
  return record
}

function createIdentifyHistory(platform) {
  function list() {
    let stored
    try {
      if (!platform || typeof platform.getStorageSync !== 'function') throw new Error('Storage unavailable')
      stored = platform.getStorageSync(STORAGE_KEY)
    } catch (_) { throw historyError('HISTORY_READ_FAILED', '本地识瓷记录读取失败，请重试。') }
    if (typeof stored === 'string') {
      try { stored = JSON.parse(stored) } catch (_) { return [] }
    }
    if (!Array.isArray(stored)) return []
    const seenRequests = new Set(); const seenIds = new Set()
    return stored.map(value => normalize(value)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt).filter(record => {
      if (seenRequests.has(record.requestId) || seenIds.has(record.id)) return false
      seenRequests.add(record.requestId); seenIds.add(record.id); return true
    }).slice(0, LIMIT)
  }
  function get(id) { return list().find(record => record.id === id) || null }
  function save(value) {
    const record = normalize(value, Date.now())
    if (!record) throw historyError('HISTORY_INVALID_RECORD', '识瓷记录不完整，展示案例不能保存为识瓷历史。')
    const records = list(); const previous = records.find(item => item.requestId === record.requestId)
    if (previous) { record.id = previous.id; record.createdAt = previous.createdAt }
    else if (records.some(item => item.id === record.id)) {
      const occupied = new Set(records.map(item => item.id)); const base = `identify-${encodeURIComponent(record.requestId)}`; let suffix = 1
      record.id = base
      while (occupied.has(record.id)) record.id = `${base}-${suffix++}`
    }
    const next = [record, ...records.filter(item => item.requestId !== record.requestId)].sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMIT)
    try {
      if (typeof platform.setStorageSync !== 'function') throw new Error('Storage unavailable')
      platform.setStorageSync(STORAGE_KEY, next)
    } catch (_) { throw historyError('HISTORY_WRITE_FAILED', '本地识瓷记录保存失败，请释放存储空间后重试。') }
    try {
      if (['recognized', 'uncertain'].includes(record.result.status)) {
        require('./growth-progress').createGrowthProgress(platform).recordGrowthEvent('identify_completed', {
          id: record.requestId, title: record.result.name, createdAt: record.createdAt, resultStatus: record.result.status
        })
      }
    } catch (_) { /* Keep the successfully saved recognition result usable. */ }
    return normalize(record)
  }
  function remove(id) {
    if (!text(id)) return false
    const records = list(); const next = records.filter(record => record.id !== id)
    if (next.length === records.length) return false
    try {
      if (typeof platform.setStorageSync !== 'function') throw new Error('Storage unavailable')
      platform.setStorageSync(STORAGE_KEY, next)
    } catch (_) { throw historyError('HISTORY_DELETE_FAILED', '本地识瓷记录删除失败，请重试。') }
    return true
  }
  return { list, get, save, remove }
}

module.exports = { createIdentifyHistory, STORAGE_KEY }
