function missing(cause) { return /DOCUMENT_NOT_FOUND|not exist|not found|-502005/i.test(`${cause?.code || ''} ${cause?.errMsg || ''} ${cause?.message || ''}`) }
function dataForWrite(value) { const { _id, ...data } = value; return data }
class CloudRepository {
  constructor(db) { this.db = db }
  async get(collection, id) {
    try { const result = await this.db.collection(collection).doc(id).get(); return result.data || null }
    catch (cause) { if (missing(cause)) return null; throw cause }
  }
  async set(collection, id, value) { await this.db.collection(collection).doc(id).set({ data: dataForWrite(value) }) }
  async list(collection, filter = {}, limit = 20, { descending = false } = {}) {
    const query = Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, Array.isArray(value) ? this.db.command.in(value) : value]))
    const result = await this.db.collection(collection).where(query).orderBy('createdAt', descending ? 'desc' : 'asc').limit(limit).get()
    return result.data || []
  }
  async listGenerationWorks(owner, cursor, limit = 21) {
    const command = this.db.command
    const scope = { owner, kind: 'generation', status: 'succeeded' }
    const query = cursor ? command.and([scope, command.or([
      { createdAt: command.lt(cursor.createdAt) },
      { createdAt: cursor.createdAt, id: command.lt(cursor.taskId) }
    ])]) : scope
    const result = await this.db.collection('ai_tasks').where(query)
      .orderBy('createdAt', 'desc').orderBy('id', 'desc').limit(limit).get()
    return result.data || []
  }
  async transaction(callback) {
    return this.db.runTransaction(async transaction => callback({
      async get(collection, id) {
        try { const result = await transaction.collection(collection).doc(id).get(); return result.data || null }
        catch (cause) { if (missing(cause)) return null; throw cause }
      },
      async set(collection, id, value) { await transaction.collection(collection).doc(id).set({ data: dataForWrite(value) }) }
    }))
  }
}
module.exports = { CloudRepository }
