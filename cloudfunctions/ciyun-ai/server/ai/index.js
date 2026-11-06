const crypto = require('node:crypto')
const { error, safeError } = require('./errors')
const v = require('./validation')
const { MemoryRepository } = require('./memory-repository')
const styles = require('../../data/ai-create').styles
const ceramics = require('../../data/ceramics')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const terminal = status => ['succeeded', 'failed', 'unknown'].includes(status)
const DIRECT_LEASE_MS = 60000
const GENERATION_LEASE_MS = 240000

function createService({ repo, storage, models, clock = Date.now, randomId = () => crypto.randomUUID(), catalog = { styles, ceramics }, cases = [] }) {
  const token = () => hash(randomId())
  const owned = async (collection, resourceId, owner) => {
    const record = await repo.get(collection, resourceId)
    if (!record || record.owner !== owner) throw error('NOT_FOUND')
    return record
  }
  const publicTask = task => {
    const result = { taskId: task.id, status: task.status, input: task.input, createdAt: task.createdAt, updatedAt: task.updatedAt }
    if (task.result) result.result = task.result
    if (task.error) result.error = task.error
    return result
  }
  const publicDirect = task => {
    if (task.status === 'failed') { const cause = error(task.error.code, task.error.retryable); throw cause }
    const result = { requestId: task.id, status: task.status }
    if (task.result) Object.assign(result, task.kind === 'identify' ? { result: task.result } : task.result)
    if (task.error) result.error = task.error
    return result
  }
  function requestIdentity(kind, owner, input, clientRequestId) {
    return { taskId: hash(`${owner}\0${kind}\0${v.id(clientRequestId)}`), inputHash: hash(JSON.stringify(input)) }
  }
  async function release(tx, task) {
    const controlId = `owner_${task.owner}`
    const control = await tx.get('ai_tasks', controlId)
    if (control?.activeTaskId === task.id) await tx.set('ai_tasks', controlId, { ...control, activeTaskId: null, updatedAt: clock() })
  }
  async function markUnknown(tx, task) {
    const changed = { ...task, status: 'unknown', leaseToken: null, leaseExpiresAt: 0, updatedAt: clock(), error: safeError(error('RESULT_UNKNOWN')) }
    await tx.set('ai_tasks', task.id, changed)
    if (task.kind === 'generation') await release(tx, changed)
    return changed
  }
  async function finalize(taskId, leaseToken, change) {
    return repo.transaction(async tx => {
      const current = await tx.get('ai_tasks', taskId)
      if (!current || current.leaseToken !== leaseToken || terminal(current.status)) return current
      if (current.leaseExpiresAt <= clock() && current.status !== 'storing') return markUnknown(tx, current)
      const changed = { ...current, ...change, updatedAt: clock() }
      if (terminal(changed.status)) { changed.leaseToken = null; changed.leaseExpiresAt = 0 }
      await tx.set('ai_tasks', taskId, changed)
      if (current.kind === 'generation' && terminal(changed.status)) await release(tx, changed)
      return changed
    })
  }
  async function persistAfterModel(task, leaseToken, save) {
    // A dispatched model call must never be repeated because its outcome could not
    // be saved. Retry only this deterministic write, including a lost commit response.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const saved = await save(); if (saved) return saved } catch {}
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await finalize(task.id, leaseToken, { status: 'unknown', error: safeError(error('RESULT_UNKNOWN')) })
        if (saved) return saved
      } catch {}
    }
    // With a fully unavailable database the durable running lease remains. Its
    // next successful recovery becomes unknown, never another model dispatch.
    return { ...task, status: 'unknown', result: undefined, error: safeError(error('RESULT_UNKNOWN')) }
  }
  async function createGeneration(payload, identity, owner) {
    const styleId = v.id(payload.styleId)
    const style = catalog.styles.find(item => item.id === styleId)
    if (!style) throw error('INVALID_INPUT')
    const input = { userPrompt: v.text(payload.userPrompt, 200), styleId, styleName: style.name }
    const { taskId, inputHash } = requestIdentity('generation', owner, input, payload.clientRequestId)
    if (!(await repo.get('ai_tasks', taskId))) models.assertConfigured('generation')
    const task = await repo.transaction(async tx => {
      const prior = await tx.get('ai_tasks', taskId)
      if (prior) { if (prior.inputHash !== inputHash) throw error('IDEMPOTENCY_CONFLICT'); return prior }
      const controlId = `owner_${owner}`
      const control = await tx.get('ai_tasks', controlId)
      if (control?.activeTaskId) {
        const active = await tx.get('ai_tasks', control.activeTaskId)
        if (active && !terminal(active.status)) {
          if (active.status === 'running' && active.leaseExpiresAt <= clock()) await markUnknown(tx, active)
          else throw error('GENERATION_IN_PROGRESS', true)
        }
      }
      const created = { id: taskId, kind: 'generation', owner, _openid: identity.OPENID, appid: identity.APPID, input, inputHash, status: 'queued', createdAt: clock(), updatedAt: clock(), leaseExpiresAt: 0, leaseToken: null }
      await tx.set('ai_tasks', taskId, created)
      await tx.set('ai_tasks', controlId, { id: controlId, kind: 'control', owner, activeTaskId: taskId, updatedAt: clock() })
      return created
    })
    return publicTask(task)
  }
  async function direct(kind, payload, identity, owner) {
    let input
    let asset
    if (kind === 'identify') {
      const assetId = v.id(payload.assetId)
      asset = await owned('assets', assetId, owner)
      if (asset.status !== 'ready' || asset.purpose !== 'identify') throw error('INVALID_ASSET')
      input = { assetId }
    } else {
      input = { question: v.text(payload.question, 500), history: [] }
      if (payload.ceramicId) {
        input.ceramicId = v.id(payload.ceramicId)
        if (!catalog.ceramics.some(item => item.id === input.ceramicId)) throw error('INVALID_INPUT')
      }
      if (payload.history !== undefined) {
        if (!Array.isArray(payload.history) || payload.history.length > 8) throw error('INVALID_INPUT')
        input.history = payload.history.map(item => {
          if (!v.object(item) || !['user', 'assistant'].includes(item.role)) throw error('INVALID_INPUT')
          return { role: item.role, text: v.text(item.text, 1500) }
        })
      }
    }
    const { taskId, inputHash } = requestIdentity(kind, owner, input, payload.clientRequestId)
    if (!(await repo.get('ai_tasks', taskId))) models.assertConfigured(kind)
    const leaseToken = token()
    const claim = await repo.transaction(async tx => {
      const prior = await tx.get('ai_tasks', taskId)
      if (prior) {
        if (prior.inputHash !== inputHash) throw error('IDEMPOTENCY_CONFLICT')
        if (prior.status === 'running' && prior.leaseExpiresAt <= clock()) return { task: prior, execute: false, expired: true }
        return { task: prior, execute: false }
      }
      const task = { id: taskId, kind, owner, _openid: identity.OPENID, appid: identity.APPID, input, inputHash, status: 'running', leaseToken, leaseExpiresAt: clock() + DIRECT_LEASE_MS, createdAt: clock(), updatedAt: clock() }
      await tx.set('ai_tasks', taskId, task)
      return { task, execute: true }
    })
    if (claim.expired) return publicDirect(await persistAfterModel(claim.task, claim.task.leaseToken, () => finalize(taskId, claim.task.leaseToken, { status: 'unknown', error: safeError(error('RESULT_UNKNOWN')) })))
    if (!claim.execute) return publicDirect(claim.task)
    let result
    try {
      if (kind === 'identify') {
        const signed = await storage.sign([asset.fileId])
        if (!signed[0]?.url) throw error('STORAGE_ERROR', true)
        result = v.validateIdentify(await models.identify({ url: signed[0].url, catalog: catalog.ceramics }), catalog.ceramics)
      } else result = v.validateChat(await models.chat({ ...input, catalog: catalog.ceramics }), catalog.ceramics)
    } catch (cause) {
      const ambiguous = cause.ambiguous || ['MODEL_TIMEOUT', 'AbortError', 'TimeoutError'].includes(cause.code || cause.name)
      const change = { status: ambiguous ? 'unknown' : 'failed', error: safeError(ambiguous ? error('RESULT_UNKNOWN') : cause) }
      const saved = await persistAfterModel(claim.task, leaseToken, () => finalize(taskId, leaseToken, change))
      return publicDirect(saved)
    }
    return publicDirect(await persistAfterModel(claim.task, leaseToken, () => finalize(taskId, leaseToken, { status: 'succeeded', result })))
  }
  async function prepareUpload(payload, identity, owner) {
    if (payload.purpose !== 'identify') throw error('INVALID_INPUT')
    const suffix = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[payload.mimeType || 'image/jpeg']
    if (!suffix) throw error('INVALID_INPUT')
    const assetId = token()
    const cloudPath = `ciyun/uploads/${owner}/${assetId}.${suffix}`
    await repo.set('assets', assetId, { id: assetId, owner, _openid: identity.OPENID, appid: identity.APPID, cloudPath, purpose: 'identify', status: 'pending', createdAt: clock(), expiresAt: clock() + 3600000 })
    return { assetId, cloudPath }
  }
  async function confirmUpload(payload, owner) {
    const assetId = v.id(payload.assetId)
    const asset = await owned('assets', assetId, owner)
    const fileId = v.text(payload.fileId, 600)
    if (asset.purpose !== 'identify' || !storage.validateFileId(fileId, asset.cloudPath) || (payload.purpose && payload.purpose !== asset.purpose)) throw error('INVALID_ASSET')
    if (asset.status === 'ready') { if (asset.sourceFileId !== fileId) throw error('INVALID_ASSET'); return { assetId, fileId: asset.fileId } }
    if (asset.expiresAt <= clock()) throw error('INVALID_ASSET')
    const bytes = await storage.download(fileId)
    const format = v.imageType(bytes)
    // Hash-address the validated bytes. Concurrent confirmations of changed input
    // cannot overwrite one another's immutable, server-only copy.
    const contentHash = hash(bytes)
    const verifiedCloudPath = `ai/verified/${owner}/${assetId}-${contentHash}.${format}`
    const verifiedFileId = await storage.saveVerified(bytes, verifiedCloudPath)
    const confirmed = await repo.transaction(async tx => {
      const current = await tx.get('assets', assetId)
      if (!current || current.owner !== owner) throw error('NOT_FOUND')
      if (current.status === 'ready') {
        if (current.sourceFileId !== fileId) throw error('INVALID_ASSET')
        return current
      }
      const ready = { ...current, status: 'ready', sourceFileId: fileId, fileId: verifiedFileId, verifiedCloudPath, contentHash, format, size: bytes.length, updatedAt: clock() }
      await tx.set('assets', assetId, ready)
      return ready
    })
    return { assetId, fileId: confirmed.fileId }
  }
  async function resolveAssets(payload, owner) {
    const requested = v.ids(payload.assetIds)
    const assets = await Promise.all(requested.map(assetId => owned('assets', assetId, owner)))
    if (assets.some(asset => asset.status !== 'ready')) throw error('INVALID_ASSET')
    const signed = assets.length ? await storage.sign(assets.map(asset => asset.fileId)) : []
    return { assets: assets.map((asset, index) => {
      const link = signed[index]
      if (!link?.url || link.fileId !== asset.fileId) throw error('STORAGE_ERROR', true)
      return { assetId: asset.id, fileId: asset.fileId, url: link.url, expiresAt: link.expiresAt }
    }) }
  }
  async function listWorks(payload, owner) {
    let cursor
    if (payload.cursor !== undefined) {
      const supplied = payload.cursor
      if (!v.object(supplied) || !Number.isSafeInteger(supplied.createdAt) || supplied.createdAt < 0) throw error('INVALID_INPUT')
      const taskId = v.id(supplied.taskId)
      if (taskId !== supplied.taskId) throw error('INVALID_INPUT')
      cursor = { createdAt: supplied.createdAt, taskId }
    }
    // Fetch one lookahead row. Visibility is applied after choosing the raw page,
    // so a fully removed or legacy page still supplies its continuation cursor.
    const rows = await repo.listGenerationWorks(owner, cursor, 21)
    const page = rows.slice(0, 20)
    const tasks = page.filter(task => task.workDeleted !== true && v.object(task.result) &&
      typeof task.result.assetId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(task.result.assetId)).map(publicTask)
    const last = page[page.length - 1]
    const nextCursor = rows.length > 20 ? { createdAt: last.createdAt, taskId: last.id } : null
    return { tasks, nextCursor }
  }
  async function deleteWork(payload, owner) {
    const taskId = v.id(payload.taskId)
    return repo.transaction(async tx => {
      const task = await tx.get('ai_tasks', taskId)
      if (!task || task.owner !== owner || task.kind !== 'generation' || task.status !== 'succeeded') throw error('NOT_FOUND')
      if (task.workDeleted !== true) await tx.set('ai_tasks', taskId, { ...task, workDeleted: true, workDeletedAt: clock() })
      return { deleted: true }
    })
  }
  async function handle(event, identity = {}) {
    const requestId = token()
    try {
      if (!identity.OPENID || !identity.APPID) throw error('UNAUTHENTICATED')
      if (!v.object(event) || event.version !== 1 || typeof event.action !== 'string' || !v.object(event.payload)) throw error('INVALID_REQUEST')
      const owner = hash(`${identity.APPID}\0${identity.OPENID}`)
      const payload = event.payload
      let data
      switch (event.action) {
        case 'assets.prepareUpload': data = await prepareUpload(payload, identity, owner); break
        case 'assets.confirmUpload': data = await confirmUpload(payload, owner); break
        case 'assets.resolve': data = await resolveAssets(payload, owner); break
        case 'cases.resolve': {
          const requested = v.ids(payload.caseIds)
          const registered = requested.map(caseId => cases.find(item => item.id === caseId)).filter(Boolean)
          const signed = registered.length ? await storage.sign(registered.map(item => item.fileId)) : []
          data = { assets: registered.map((item, index) => ({ assetId: item.id, fileId: item.fileId, url: signed[index].url, expiresAt: signed[index].expiresAt })) }
          break
        }
        case 'generation.create': data = await createGeneration(payload, identity, owner); break
        case 'generation.get': data = publicTask(await owned('ai_tasks', v.id(payload.taskId), owner)); if (!data.input?.styleId) throw error('NOT_FOUND'); break
        case 'generation.findRecent': data = { tasks: (await repo.list('ai_tasks', { owner, kind: 'generation' }, 20, { descending: true })).map(publicTask) }; break
        case 'generation.listWorks': data = await listWorks(payload, owner); break
        case 'generation.deleteWork': data = await deleteWork(payload, owner); break
        case 'identify.analyze': data = await direct('identify', payload, identity, owner); break
        case 'chat.answer': data = await direct('chat', payload, identity, owner); break
        default: throw error('INVALID_ACTION')
      }
      return { ok: true, data, requestId }
    } catch (cause) { return { ok: false, error: safeError(cause), requestId } }
  }
  async function workOne() {
    const candidates = await repo.list('ai_tasks', { kind: 'generation', status: ['queued', 'running', 'storing'] }, 50)
    for (const candidate of candidates) {
      const leaseToken = token()
      const claim = await repo.transaction(async tx => {
        const task = await tx.get('ai_tasks', candidate.id)
        if (!task || task.kind !== 'generation' || terminal(task.status)) return null
        if (task.status === 'running') {
          if (task.leaseExpiresAt <= clock()) return { task, expired: true }
          return null
        }
        if (task.status === 'storing' && task.leaseExpiresAt > clock()) return null
        const claimed = { ...task, status: task.status === 'storing' ? 'storing' : 'running', leaseToken, leaseExpiresAt: clock() + GENERATION_LEASE_MS, updatedAt: clock() }
        await tx.set('ai_tasks', task.id, claimed)
        return { task: claimed }
      })
      if (!claim) continue
      if (claim.expired) {
        const expired = claim.task
        const saved = await persistAfterModel(expired, expired.leaseToken, () => finalize(expired.id, expired.leaseToken, { status: 'unknown', error: safeError(error('RESULT_UNKNOWN')) }))
        return { taskId: saved.id, status: saved.status }
      }
      let task = claim.task
      if (task.status === 'running') {
        let generated
        try {
          models.assertConfigured('generation')
          const style = catalog.styles.find(item => item.id === task.input.styleId)
          task = await finalize(task.id, leaseToken, { requestDispatchedAt: clock() })
          if (task.status !== 'running' || task.leaseToken !== leaseToken) return { taskId: task.id, status: task.status }
          generated = await models.generate({ userPrompt: task.input.userPrompt, style })
          if (!generated || typeof generated.url !== 'string' || !generated.url) throw error('MODEL_INVALID_RESPONSE', true)
        } catch (cause) {
          const ambiguous = cause.ambiguous || ['MODEL_TIMEOUT', 'AbortError', 'TimeoutError'].includes(cause.code || cause.name)
          const change = { status: ambiguous ? 'unknown' : 'failed', error: safeError(ambiguous ? error('RESULT_UNKNOWN') : cause) }
          task = await persistAfterModel(task, leaseToken, () => finalize(task.id, leaseToken, change))
          return { taskId: task.id, status: task.status }
        }
        // Persist the supplier URL before any download. Persistence failures are
        // separate from supplier failures and cannot become an ordinary failed task.
        const providerResult = {
          status: 'storing', providerUrl: generated.url, storageAttempts: 0, receivedAt: clock(),
          ...(generated.requestId ? { providerRequestId: generated.requestId } : {}),
          ...(Number.isFinite(generated.expiresAt) ? { providerUrlExpiresAt: generated.expiresAt } : {})
        }
        task = await persistAfterModel(task, leaseToken, () => finalize(task.id, leaseToken, providerResult))
        if (task.status !== 'storing' || task.leaseToken !== leaseToken) return { taskId: task.id, status: task.status }
      }
      const assetId = hash(`${task.id}\0result`)
      const cloudPath = `ciyun/generated/${task.owner}/${task.id}.png`
      let fileId
      try {
        fileId = await storage.importImage(task.providerUrl, cloudPath)
      } catch (cause) {
        const attempts = (task.storageAttempts || 0) + 1
        const saved = await finalize(task.id, leaseToken, { status: attempts >= 3 ? 'failed' : 'storing', storageAttempts: attempts, leaseExpiresAt: clock() + 10000, error: safeError(error('STORAGE_ERROR', true)) })
        return { taskId: saved.id, status: saved.status }
      }
      const saved = await persistAfterModel(task, leaseToken, () => repo.transaction(async tx => {
          const current = await tx.get('ai_tasks', task.id)
          if (!current || current.leaseToken !== leaseToken || current.status !== 'storing') return current
          if (current.leaseExpiresAt <= clock()) {
            await tx.set('ai_tasks', current.id, { ...current, leaseToken: null, leaseExpiresAt: 0 })
            return current
          }
          await tx.set('assets', assetId, { id: assetId, owner: current.owner, _openid: current._openid, appid: current.appid, status: 'ready', purpose: 'generation', fileId, cloudPath, createdAt: clock() })
          const changed = { ...current, status: 'succeeded', result: { assetId, fileId }, leaseToken: null, leaseExpiresAt: 0, error: null, updatedAt: clock() }
          await tx.set('ai_tasks', current.id, changed)
          await release(tx, changed)
          return changed
      }))
      return { taskId: saved.id, status: saved.status }
    }
    return { status: 'idle' }
  }
  return { handle, workOne }
}
module.exports = { createService, MemoryRepository, DIRECT_LEASE_MS, GENERATION_LEASE_MS }
