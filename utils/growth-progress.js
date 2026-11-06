const config = require('../data/growth')
const ceramics = require('../data/ceramics')
const levels = require('../data/challenges')
const challengeGames = require('../data/challenge-games')

const STORAGE_KEY = 'profileGrowthV1'
const VERSION = 2
const TYPES = ['work_created', 'identify_completed', 'chat_answered', 'challenge_completed', 'ceramic_viewed']
const ceramicIds = new Set(ceramics.map(item => item.id))
const levelIds = new Set(levels.map(item => item.id))
const badgeIds = new Set(config.badges.map(item => item.id))
const defaultTitles = {
  work_created: '保存了一件自己的瓷器作品', identify_completed: '完成了一次瓷器文化解读',
  chat_answered: '完成了一轮陶瓷知识问答', challenge_completed: '完成了一关瓷韵挑战', ceramic_viewed: '浏览了一件馆藏器物'
}

function growthError(code, message, cause) {
  const error = new Error(message)
  error.code = code
  if (cause) error.cause = cause
  return error
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function text(value, limit = 80) { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }
function journalTitle(type, value) {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!raw) return defaultTitles[type]
  const brief = raw.length > 48 ? `${raw.slice(0, 47)}…` : raw
  if (type === 'work_created') return `保存作品《${brief}》`
  if (type === 'identify_completed') return `完成识瓷解读《${brief}》`
  if (type === 'chat_answered') return `问瓷：${brief}`
  if (type === 'ceramic_viewed') return `赏瓷：${brief}`
  return `完成关卡《${brief}》`
}
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value }
function timestamp(value) {
  const time = typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN
  if (!Number.isFinite(time) || time <= 0) return null
  try { return /^\d{4}-\d{2}-\d{2}T/.test(new Date(time + 8 * 60 * 60 * 1000).toISOString()) ? time : null }
  catch (_) { return null }
}
function shanghaiDay(time) { return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) }
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
function eventKey(event) {
  return `${event.type}:${JSON.stringify(event.type === 'chat_answered' ? [event.conversationId, event.id] : [event.id])}`
}
function ownedWorkKind(value) {
  if (!object(value) || value.source === 'showcase' || value.mode === 'showcase') return ''
  if (value.creationType === 'digital') return 'digital'
  if (value.creationType === 'ai' && value.source === 'generated') return 'ai'
  return ''
}
function normalizeEvent(type, event) {
  if (!TYPES.includes(type) || !object(event) || !validId(event.id)) throw growthError('GROWTH_INVALID_EVENT', '成长记录不完整')
  if (event.source === 'showcase' || event.mode === 'showcase') return null
  const ledger = { type, id: event.id }
  if (type === 'work_created') {
    const kind = ownedWorkKind(event)
    if (!kind) return null
    ledger.creationType = kind
    if (kind === 'ai') ledger.source = 'generated'
  } else if (type === 'identify_completed') {
    if (event.resultStatus === 'not_ceramic') return null
    if (!['recognized', 'uncertain'].includes(event.resultStatus)) throw growthError('GROWTH_INVALID_EVENT', '识瓷记录尚未完成')
    ledger.resultStatus = event.resultStatus
  } else if (type === 'chat_answered') {
    if (!validId(event.conversationId)) throw growthError('GROWTH_INVALID_EVENT', '问答记录缺少对话编号')
    ledger.conversationId = event.conversationId
  } else if (type === 'challenge_completed' && !levelIds.has(event.id)) {
    throw growthError('GROWTH_INVALID_EVENT', '无效挑战关卡')
  } else if (type === 'ceramic_viewed' && !ceramicIds.has(event.id)) {
    throw growthError('GROWTH_INVALID_EVENT', '无效馆藏器物')
  }
  const title = type === 'challenge_completed'
    ? `完成第${levels.find(level => level.id === event.id).order}关 · ${challengeGames[event.id].title}`
    : journalTitle(type, event.title)
  return { ledger, key: eventKey(ledger), title, createdAt: timestamp(event.createdAt) }
}
function emptyStore() { return { version: VERSION, visits: [], events: [], unlockedBadgeIds: [], journal: [] } }
function sameFields(left, right) {
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => left[key] === right[key])
}
function validateStore(value) {
  try {
    if (!object(value) || ![1, VERSION].includes(value.version) || Object.keys(value).length !== 5) throw new Error()
    if (!Array.isArray(value.visits) || !Array.isArray(value.events) || !Array.isArray(value.unlockedBadgeIds) || !Array.isArray(value.journal)) throw new Error()
    if (!value.visits.every(validDay) || new Set(value.visits).size !== value.visits.length) throw new Error()
    if (!value.unlockedBadgeIds.every(id => badgeIds.has(id)) || new Set(value.unlockedBadgeIds).size !== value.unlockedBadgeIds.length) throw new Error()
    const keys = new Map()
    const events = value.events.map(event => {
      if (!object(event)) throw new Error()
      const result = normalizeEvent(event.type, event)
      if (!result || !sameFields(event, result.ledger) || keys.has(result.key)) throw new Error()
      keys.set(result.key, event.type)
      return { ...result.ledger }
    })
    if (value.journal.length > config.journalLimit) throw new Error()
    const journalIds = new Set()
    const journal = value.journal.map(item => {
      if (!object(item) || Object.keys(item).length !== 4 || journalIds.has(item.id)) throw new Error()
      if (item.iconType === 'badge_unlocked') {
        // A past award remains valid journal history after stricter rules relock it.
        if (typeof item.id !== 'string' || !item.id.startsWith('badge:') || !badgeIds.has(item.id.slice(6))) throw new Error()
      } else if (!keys.has(item.id) || keys.get(item.id) !== item.iconType) throw new Error()
      if (!text(item.title) || text(item.title) !== item.title || typeof item.createdAt !== 'number' || timestamp(item.createdAt) === null || timestamp(item.createdAt) !== item.createdAt) throw new Error()
      journalIds.add(item.id)
      return { id: item.id, title: item.title, createdAt: item.createdAt, iconType: item.iconType }
    })
    return { version: value.version, visits: value.visits.slice(), events, unlockedBadgeIds: value.unlockedBadgeIds.slice(), journal }
  } catch (cause) { throw growthError('GROWTH_INVALID_STORE', '本机成长记录格式异常，原记录已保留', cause) }
}
function statistics(store) {
  const stats = { ownWorks: 0, digitalWorks: 0, aiWorks: 0, identifications: 0, answers: 0, viewedCeramics: 0, completedLevels: 0 }
  let totalXp = store.visits.length * config.points.visit
  store.events.forEach(event => {
    totalXp += config.points[event.type]
    if (event.type === 'work_created') {
      stats.ownWorks++
      stats[event.creationType === 'digital' ? 'digitalWorks' : 'aiWorks']++
    } else if (event.type === 'identify_completed') stats.identifications++
    else if (event.type === 'chat_answered') stats.answers++
    else if (event.type === 'ceramic_viewed') stats.viewedCeramics++
    else if (event.type === 'challenge_completed') stats.completedLevels++
  })
  return { ...stats, totalXp, exploredDays: store.visits.length }
}
function badgeMetrics(badge, stats) {
  if (!badge.requirements) {
    const current = stats[badge.stat]
    return { current, target: badge.target, progressPercent: Math.min(100, current / badge.target * 100), qualifies: current >= badge.target }
  }
  const requirements = badge.requirements.map(({ stat, target }) => [stats[stat], target])
  return {
    current: requirements.filter(([current, target]) => current >= target).length,
    target: requirements.length,
    progressPercent: Math.floor(requirements.reduce((sum, [current, target]) => sum + Math.min(1, current / target), 0) / requirements.length * 1000) / 10,
    qualifies: requirements.every(([current, target]) => current >= target)
  }
}
function appendJournal(store, item, replace = false) {
  const existingIndex = store.journal.findIndex(existing => existing.id === item.id)
  if (existingIndex >= 0) {
    if (!replace) return
    store.journal.splice(existingIndex, 1)
  }
  store.journal.push(item)
  store.journal.sort((left, right) => right.createdAt - left.createdAt)
  store.journal = store.journal.slice(0, config.journalLimit)
}
function awardBadges(store, createdAt, previousStats) {
  const stats = statistics(store)
  const earned = config.badges.filter(badge => badgeMetrics(badge, stats).qualifies)
  earned.forEach(badge => {
    // Compare current-rule qualification before and after this event, not the old award list.
    if (badgeMetrics(badge, previousStats).qualifies || timestamp(createdAt) === null) return
    appendJournal(store, { id: `badge:${badge.id}`, title: `获得徽章「${badge.name}」`, createdAt, iconType: 'badge_unlocked' }, true)
  })
  store.unlockedBadgeIds = earned.map(badge => badge.id)
}
function appendEvent(store, type, event) {
  const normalized = normalizeEvent(type, event)
  if (!normalized) return
  const existing = store.events.some(item => eventKey(item) === normalized.key)
  // A real replay can restore a cleared journal, while XP stays unique per level.
  // Imports have no completion timestamp and cannot recreate obsolete entries.
  if (existing && (type !== 'challenge_completed' || normalized.createdAt === null || store.journal.some(item => item.id === normalized.key))) return
  if (!existing) store.events.push(normalized.ledger)
  if (normalized.createdAt !== null) {
    appendJournal(store, { id: normalized.key, title: normalized.title, createdAt: normalized.createdAt, iconType: type })
  }
  return normalized
}

function legacyChatIdentity(conversation, legacy) {
  const conversationId = `legacy-${conversation.ceramicId || 'general'}`
  const messageIds = new Set()
  const messages = conversation.messages
  // V1 imports have deterministic ids and no timestamps. The archive can trim
  // complete old rounds, so match the exact surviving V1 suffix at its start.
  const legacyStart = legacy.messages.findIndex((_, index) => index % 2 === 0 && messages[0] && messages[0].id === `message_${index}`)
  if (legacyStart >= 0 && legacy.messages.slice(legacyStart).every((item, offset) => {
    const index = legacyStart + offset; const saved = messages[offset]
    return saved && saved.id === `message_${index}` && saved.createdAt === 0 && saved.role === item.role && saved.text === item.text
  })) legacy.messages.forEach((_, index) => { if (index >= legacyStart && index % 2) messageIds.add(`message_${index}`) })
  const original = legacy.active && legacy.active.payload
  if (original) {
    const active = conversation.active && conversation.active.payload
    const sameRequest = active && active.clientRequestId === original.clientRequestId && active.question === original.question
      && JSON.stringify(active.history) === JSON.stringify(original.history)
    const answerIndex = messages.findIndex(item => item.role === 'assistant' && item.id === `${original.clientRequestId}-assistant`)
    const user = messages[answerIndex - 1]
    const savedAnswer = user && user.id === `${original.clientRequestId}-user` && user.text === original.question
    if (sameRequest || savedAnswer) messageIds.add(`${original.clientRequestId}-assistant`)
  }
  return { conversationId, messageIds }
}

function createGrowthProgress(platform, { clock = Date.now } = {}) {
  function readStore() {
    let value
    try { value = platform.getStorageSync(STORAGE_KEY) }
    catch (cause) { throw growthError('GROWTH_READ_FAILED', '本机成长记录读取失败', cause) }
    if (value === '' || value === undefined) return emptyStore()
    const store = validateStore(value)
    if (store.version === 1) {
      // Clear pre-redesign challenge activity once, preserving the earned ledger
      // and every other journal item. Version and cleanup commit atomically.
      store.version = VERSION
      store.journal = store.journal.filter(item => item.iconType !== 'challenge_completed')
      try { platform.setStorageSync(STORAGE_KEY, store) }
      catch (cause) { throw growthError('GROWTH_WRITE_FAILED', '本机成长记录保存失败', cause) }
    }
    return store
  }
  function readOwnedWorks() {
    let works
    try { works = platform.getStorageSync('craftWorks') }
    catch (cause) { throw growthError('GROWTH_SOURCE_READ_FAILED', '本机作品记录读取失败', cause) }
    if (works === '' || works === undefined) return []
    if (!Array.isArray(works)) throw growthError('GROWTH_SOURCE_READ_FAILED', '本机作品集合格式异常')
    const seen = new Set()
    return works.filter(work => {
      if (!object(work) || !validId(work.id) || !text(work.name) || !text(work.image, 4096) || !ownedWorkKind(work) || seen.has(work.id)) return false
      seen.add(work.id); return true
    })
  }
  function stateFor(store, migrationWarnings = []) {
    const currentWorks = readOwnedWorks()
    const stats = statistics(store)
    const currentLevel = config.levels.filter(level => level.minXp <= stats.totalXp).slice(-1)[0]
    const nextLevel = config.levels.find(level => level.minXp > stats.totalXp)
    const badges = config.badges.map(badge => {
      const metrics = badgeMetrics(badge, stats)
      return { id: badge.id, name: badge.name, condition: badge.condition, image: badge.image, current: metrics.current, target: metrics.target, progressPercent: metrics.progressPercent, unlocked: metrics.qualifies }
    })
    return {
      identity: {
        level: currentLevel.level, title: currentLevel.title, totalXp: stats.totalXp,
        currentLevelXp: currentLevel.minXp, nextLevelXp: nextLevel ? nextLevel.minXp : null,
        progressPercent: nextLevel ? (stats.totalXp - currentLevel.minXp) / (nextLevel.minXp - currentLevel.minXp) * 100 : 100,
        exploredDays: store.visits.length, image: config.identityImage
      },
      footprints: { completedLevels: stats.completedLevels, ownWorks: currentWorks.length, unlockedBadges: badges.filter(badge => badge.unlocked).length },
      stats,
      badges,
      journal: store.journal.slice().sort((left, right) => right.createdAt - left.createdAt).slice(0, config.journalDisplayLimit).map(item => ({ ...item, dateLabel: shanghaiDay(item.createdAt).replace(/-/g, '.') })),
      migrationWarnings: migrationWarnings.slice()
    }
  }
  function persist(store, previous, badgeCreatedAt = null) {
    awardBadges(store, badgeCreatedAt, statistics(JSON.parse(previous)))
    if (JSON.stringify(store) === previous) return
    try { platform.setStorageSync(STORAGE_KEY, store) }
    catch (cause) { throw growthError('GROWTH_WRITE_FAILED', '本机成长记录保存失败', cause) }
  }
  function legacyIdentity(conversation) {
    const { sanitizeSession, sessionKey } = require('./ai-chat-history')
    return legacyChatIdentity(conversation, sanitizeSession(platform.getStorageSync(sessionKey(conversation.ceramicId)), conversation.ceramicId))
  }
  function canonicalChatEvent(event) {
    if (!object(event) || !validId(event.id) || !validId(event.conversationId)) return event
    const { sanitizeArchive, ARCHIVE_KEY } = require('./ai-chat-conversations')
    try {
      const value = platform.getStorageSync(ARCHIVE_KEY)
      if (value === '' || value === undefined) return event
      if (!object(value) || value.version !== 2 || !Array.isArray(value.conversations)) throw new Error('Invalid chat archive')
      const conversation = sanitizeArchive(value).conversations.find(item => item.id === event.conversationId)
      if (!conversation) return event
      const identity = legacyIdentity(conversation)
      return identity.messageIds.has(event.id) ? { ...event, conversationId: identity.conversationId } : event
    } catch (cause) { throw growthError('GROWTH_SOURCE_READ_FAILED', '本机问答记录读取失败', cause) }
  }
  function recordGrowthEvent(type, event) {
    const store = readStore(); const previous = JSON.stringify(store)
    const added = appendEvent(store, type, type === 'chat_answered' ? canonicalChatEvent(event) : event)
    persist(store, previous, added ? added.createdAt : null)
    return stateFor(store)
  }
  function recordVisit() {
    const store = readStore(); const previous = JSON.stringify(store); const time = timestamp(clock())
    if (time === null) throw growthError('GROWTH_INVALID_EVENT', '访问时间无效')
    const day = shanghaiDay(time)
    const isNewDay = !store.visits.includes(day)
    if (isNewDay) { store.visits.push(day); store.visits.sort() }
    persist(store, previous, isNewDay ? time : null)
    return stateFor(store)
  }
  function migrateExistingRecords() {
    const store = readStore(); const previous = JSON.stringify(store); const migrationWarnings = []
    function source(name, migrate) { try { migrate() } catch (_) { migrationWarnings.push(name) } }
    function importEvent(type, event) { try { appendEvent(store, type, event) } catch (_) {} }
    source('works', () => {
      readOwnedWorks().forEach(work => importEvent('work_created', { ...work, title: work.name }))
    })
    source('identify', () => {
      // These helpers may themselves import this module for live hooks.
      const { createIdentifyHistory } = require('./ai-identify-history')
      createIdentifyHistory(platform).list().forEach(record => importEvent('identify_completed', {
        id: record.requestId, resultStatus: record.result.status, createdAt: record.createdAt, title: record.result.name
      }))
    })
    source('chat', () => {
      const { sanitizeArchive, ARCHIVE_KEY } = require('./ai-chat-conversations')
      const value = platform.getStorageSync(ARCHIVE_KEY)
      if (value === '' || value === undefined) return
      if (!object(value) || value.version !== 2 || !Array.isArray(value.conversations)) throw new Error('Invalid chat archive')
      sanitizeArchive(value).conversations.forEach(conversation => {
        const identity = legacyIdentity(conversation)
        for (let index = 1; index < conversation.messages.length; index += 2) {
          const message = conversation.messages[index]
          importEvent('chat_answered', { id: message.id, conversationId: identity.messageIds.has(message.id) ? identity.conversationId : conversation.id, createdAt: message.createdAt, title: conversation.messages[index - 1].text })
        }
      })
    })
    source('challenge', () => {
      const value = platform.getStorageSync('challengeProgress')
      if (value === '' || value === undefined) return
      if (!object(value) || !Array.isArray(value.completedLevelIds)) throw new Error('Invalid challenge progress')
      value.completedLevelIds.forEach(id => { if (levelIds.has(id)) importEvent('challenge_completed', { id }) })
    })
    persist(store, previous)
    try { return stateFor(store, migrationWarnings) }
    catch (cause) { cause.migrationWarnings = migrationWarnings.slice(); throw cause }
  }
  return { recordVisit, recordGrowthEvent, migrateExistingRecords, getProfileState: () => stateFor(readStore()) }
}

module.exports = { createGrowthProgress, STORAGE_KEY }
