const storage = require('./storage')

const WORKS_STORAGE_KEY = 'craftWorks'
let idSequence = 0

function isWork(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ['id', 'name', 'image'].every((key) => typeof value[key] === 'string' && value[key].trim())
}

function createWorkId() {
  idSequence += 1
  return `work-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getWorks() {
  const works = storage.get(WORKS_STORAGE_KEY, [])
  if (!Array.isArray(works)) return []
  return works
    .filter(isWork)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
}

function saveWork(work) {
  if (!isWork(work)) throw new Error('作品信息不完整')
  // Read before writing so an unavailable or damaged collection is never replaced.
  const works = storage.get(WORKS_STORAGE_KEY, [])
  if (!Array.isArray(works)) throw new Error('作品记录暂时无法读取')

  const previous = works.find((item) => item && item.id === work.id)
  const now = new Date().toISOString()
  const saved = {
    ...previous,
    ...work,
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: now
  }
  const nextWorks = works.filter((item) => !item || item.id !== saved.id)
  nextWorks.push(saved)
  storage.set(WORKS_STORAGE_KEY, nextWorks)
  try {
    if (saved.source !== 'showcase' && saved.mode !== 'showcase' && (saved.creationType === 'digital' || (saved.creationType === 'ai' && saved.source === 'generated'))) {
      require('./growth-progress').createGrowthProgress(wx).recordGrowthEvent('work_created', {
        id: saved.id, title: saved.name, createdAt: saved.createdAt, creationType: saved.creationType, source: saved.source
      })
    }
  } catch (_) { /* Growth storage must not undo a saved work. */ }
  return saved
}

function removeWork(id) {
  if (typeof id !== 'string' || !id.trim()) return false
  const works = storage.get(WORKS_STORAGE_KEY, [])
  if (!Array.isArray(works)) throw new Error('作品记录暂时无法读取')
  if (!works.some((item) => item && item.id === id)) return false
  storage.set(WORKS_STORAGE_KEY, works.filter((item) => !item || item.id !== id))
  return true
}

module.exports = { createWorkId, getWorks, saveWork, removeWork }
