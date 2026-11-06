// A deterministic repository used by business tests. Production uses CloudRepository.
class MemoryRepository {
  constructor() { this.tables = { ai_tasks: new Map(), assets: new Map() }; this.queue = Promise.resolve() }
  async get(collection, id) { return structuredClone(this.tables[collection].get(id) || null) }
  async set(collection, id, value) { this.tables[collection].set(id, structuredClone(value)) }
  async list(collection, filter = {}, limit = 20, { descending = false } = {}) {
    return [...this.tables[collection].values()].filter(row => Object.entries(filter).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
      .sort((a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) * (descending ? -1 : 1)).slice(0, limit).map(row => structuredClone(row))
  }
  async listGenerationWorks(owner, cursor, limit = 21) {
    return [...this.tables.ai_tasks.values()]
      .filter(task => task.owner === owner && task.kind === 'generation' && task.status === 'succeeded' &&
        (!cursor || task.createdAt < cursor.createdAt || (task.createdAt === cursor.createdAt && task.id < cursor.taskId)))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1))
      .slice(0, limit).map(task => structuredClone(task))
  }
  async transaction(callback) {
    const previous = this.queue
    let release
    this.queue = new Promise(resolve => { release = resolve })
    await previous
    const snapshot = structuredClone(this.tables)
    try { return await callback({ get: this.get.bind(this), set: this.set.bind(this) }) }
    catch (cause) { this.tables = snapshot; throw cause }
    finally { release() }
  }
}
module.exports = { MemoryRepository }
