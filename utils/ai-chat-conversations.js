const { sanitizeSession } = require('./ai-chat-history')
const ARCHIVE_KEY = 'aiChatConversationsV2'
const MAX_CONVERSATIONS = 12
const MAX_MESSAGES = 80

function safeId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '' }
function timestamp(value, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback }
function cleanText(value, limit) { return typeof value === 'string' ? value.slice(0, limit) : '' }

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return []
  const rounds = []; let user = null
  value.forEach((item, index) => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string') return
    const text = item.text.slice(0, item.role === 'user' ? 500 : 6000)
    if (!text.trim()) return
    const message = { role: item.role, text, id: safeId(item.id) || `message_${index}`, createdAt: timestamp(item.createdAt) }
    if (item.role === 'user') { user = message; return }
    if (!user) return
    if (Array.isArray(item.sources)) {
      const ids = new Set()
      const sources = item.sources.reduce((result, source) => {
        const id = source && safeId(source.id)
        if (id && !ids.has(id)) { ids.add(id); result.push({ id }) }
        return result
      }, [])
      if (sources.length) message.sources = sources
    }
    rounds.push(user, message); user = null
  })
  const messages = rounds.slice(-MAX_MESSAGES)
  const reserved = new Set(messages.map(message => message.id)); const used = new Set()
  messages.forEach((message, index) => {
    if (used.has(message.id)) {
      let suffix = 0; let id = `message_${index}`
      while (reserved.has(id) || used.has(id)) id = `message_${index}_${++suffix}`
      message.id = id
    }
    used.add(message.id)
  })
  return messages
}

function sanitizeConversation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !safeId(value.id)) return null
  const ceramicId = cleanText(value.ceramicId, 80)
  const messages = sanitizeMessages(value.messages)
  const title = cleanText(value.title, 60).trim() || (messages[0] ? messages[0].text.slice(0, 24).trim() : '') || '新的对话'
  const createdAt = timestamp(value.createdAt)
  return {
    id: value.id, ceramicId, title, createdAt, updatedAt: timestamp(value.updatedAt, createdAt), messages,
    input: cleanText(value.input, 500), active: sanitizeSession(value, ceramicId).active
  }
}

function sanitizeArchive(value) {
  const archive = { version: 2, conversations: [] }
  if (!value || value.version !== 2 || !Array.isArray(value.conversations)) return archive
  const unique = new Map()
  value.conversations.forEach(item => {
    const conversation = sanitizeConversation(item)
    if (!conversation) return
    const previous = unique.get(conversation.id)
    if (!previous || conversation.updatedAt > previous.updatedAt) unique.set(conversation.id, conversation)
  })
  archive.conversations = Array.from(unique.values()).sort((left, right) => (
    right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  )).slice(0, MAX_CONVERSATIONS)
  return archive
}

function createConversation(id, ceramicId = '', now = Date.now()) {
  return sanitizeConversation({ id, ceramicId, title: '新的对话', createdAt: now, updatedAt: now, messages: [], input: '', active: null })
}

function upsertConversation(archive, conversation) {
  const saved = sanitizeArchive(archive)
  const replacement = sanitizeConversation(conversation)
  if (!replacement) return saved
  return sanitizeArchive({ version: 2, conversations: [
    ...saved.conversations.filter(item => item.id !== replacement.id), replacement
  ] })
}

module.exports = { ARCHIVE_KEY, MAX_CONVERSATIONS, MAX_MESSAGES, sanitizeMessages, sanitizeArchive, upsertConversation, createConversation }
