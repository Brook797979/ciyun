const crypto = require('node:crypto')
const { createService } = require('./index')
const { createModels } = require('./providers')
const { createStorage } = require('./storage')
const { CloudRepository } = require('./cloud-repository')
const { error, safeError } = require('./errors')
function createRuntime({ cloud, env = process.env, fetchImpl = globalThis.fetch, service } = {}) {
  const backend = service || createService({ repo: new CloudRepository(cloud.database()), storage: createStorage({ cloud, env, fetchImpl }), models: createModels({ env, fetchImpl }) })
  return {
    async api(event) { return backend.handle(event, cloud.getWXContext()) },
    async worker(event) {
      const requestId = crypto.randomUUID()
      try {
        const identity = cloud.getWXContext() || {}
        // Primary security boundary: deploy this function with invoke:false and no HTTP entry.
        // Type is shape validation only. It is not evidence of a trusted caller.
        if (identity.OPENID || event?.Type !== 'Timer' || (env.TRIGGER_SRC && env.TRIGGER_SRC !== 'timer')) throw error('UNAUTHENTICATED')
        return { ok: true, data: await backend.workOne(), requestId }
      } catch (cause) { return { ok: false, error: safeError(cause), requestId } }
    }
  }
}
module.exports = { createRuntime }
