const MAX_QUESTION = 500
const MAX_ROUNDS = 4
function cleanText(value, limit) { return typeof value === 'string' ? value.slice(0, limit) : '' }
function sanitizeHistory(value, maxAnswer = 6000) {
  if (!Array.isArray(value)) return []
  const rounds = []; let user = null
  for (const item of value) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) continue
    if (item.role === 'user') user = { role: 'user', text: cleanText(item.text, MAX_QUESTION) }
    else if (item.role === 'assistant' && user) { rounds.push(user, { role: 'assistant', text: cleanText(item.text, maxAnswer) }); user = null }
  }
  return rounds.slice(-MAX_ROUNDS * 2)
}
function sessionKey(ceramicId) { return `aiChatSessionV1:${ceramicId || 'general'}` }
function sanitizeSession(value, ceramicId) {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  let active = null; const candidate = saved.active && saved.active.payload
  if (candidate && typeof candidate.question === 'string' && candidate.question.trim() && candidate.question.length <= MAX_QUESTION && typeof candidate.clientRequestId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(candidate.clientRequestId) && (candidate.ceramicId || '') === ceramicId) {
    active = { payload: { question: candidate.question, history: sanitizeHistory(candidate.history, 1500), clientRequestId: candidate.clientRequestId, ...(ceramicId ? { ceramicId } : {}) }, status: ['running', 'failed', 'unknown'].includes(saved.active.status) ? saved.active.status : 'running' }
  }
  return { messages: sanitizeHistory(saved.messages), input: cleanText(saved.input, MAX_QUESTION), active }
}
module.exports = { MAX_QUESTION, MAX_ROUNDS, sanitizeHistory, sanitizeSession, sessionKey }
