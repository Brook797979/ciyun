const { getWorks, removeWork } = require('./craft-works')
const deleted = new Map()
let revision = 0
const privateAI = work => work.creationType !== 'digital' && work.source !== 'showcase'

async function loadWorkCollection(service) {
  const started = revision
  const works = new Map()
  let cursor
  do {
    const page = await service.callAI('generation.listWorks', cursor ? { cursor } : {})
    for (const task of page.tasks) {
      if (task.status !== 'succeeded' || !task.result || !task.result.assetId) continue
      const input = task.input || {}
      const result = task.result
      const theme = (input.userPrompt || '').match(/以(.{1,12}?)为主题/)
      works.set(`ai-${task.taskId}`, {
        ...input, input: { ...input }, id: `ai-${task.taskId}`,
        name: `${input.styleName || '瓷韵'} · ${theme ? theme[1] : '创作'}`,
        creationType: 'ai', source: 'generated', taskId: task.taskId,
        assetId: result.assetId, fileId: result.fileId,
        image: result.fileId || `asset:${result.assetId}`,
        createdAt: new Date(task.createdAt).toISOString()
      })
    }
    cursor = page.nextCursor
  } while (cursor)
  for (const work of getWorks()) {
    const ownedTask = privateAI(work) && work.taskId
    const key = ownedTask ? `ai-${work.taskId}` : work.id
    if (ownedTask && !works.has(key)) continue
    works.set(key, { ...works.get(key), ...work })
  }
  return [...works.values()]
    .filter(work => !privateAI(work) || (deleted.get(work.taskId) || 0) <= started)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

async function deleteWorkRecord(work, service) {
  if (!work) return false
  const taskId = privateAI(work) && (work.taskId || (typeof work.id === 'string' && work.id.startsWith('ai-') ? work.id.slice(3) : ''))
  if (!taskId) return removeWork(work.id)
  await service.callAI('generation.deleteWork', { taskId })
  deleted.set(taskId, ++revision)
  removeWork(work.id)
  return true
}

module.exports = { loadWorkCollection, deleteWorkRecord }
