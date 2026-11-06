const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function client(platform) {
  const file = path.resolve(__dirname, '../utils/cloud-service.js')
  assert.ok(fs.existsSync(file), 'A real cloud service client is required')
  return require(file).createCloudService(platform)
}

test('AI client sends the versioned cloud function contract with a recognition-safe timeout', async () => {
  let options
  const service = client({ cloud: { callFunction(value) { options = value; return Promise.resolve({ result: { ok: true, data: { taskId: 'task-1' }, requestId: 'server-1' } }) } } })
  assert.deepEqual(await service.callAI('generation.create', { clientRequestId: 'request-1', userPrompt: '竹影', styleId: 'qinghua' }), { taskId: 'task-1' })
  assert.equal(options.name, 'ciyun-ai')
  assert.deepEqual(options.data, { version: 1, action: 'generation.create', payload: { clientRequestId: 'request-1', userPrompt: '竹影', styleId: 'qinghua' } })
  assert.ok(options.config.timeout >= 60000)
})

test('cloud callbacks and server errors become sanitized typed client errors', async () => {
  const service = client({ cloud: { callFunction(options) { options.success({ result: { ok: false, error: { code: 'ASSET_FORBIDDEN', message: 'Bearer secret-private-file', retryable: false } } }) } } })
  await assert.rejects(service.callAI('assets.resolve', { assetIds: ['private'] }), (error) => error.code === 'ASSET_FORBIDDEN' && error.retryable === false && !/secret|Bearer/.test(error.message))
})

test('network timeouts preserve a recoverable code without exposing provider details', async () => {
  const service = client({ cloud: { callFunction() { return Promise.reject({ errMsg: 'cloud.callFunction:fail timeout secret-token' }) } } })
  await assert.rejects(service.callAI('generation.create', {}), (error) => error.code === 'NETWORK_TIMEOUT' && error.retryable && !error.message.includes('secret-token'))
})

test('an unconfigured cloud client never creates simulated success', async () => {
  await assert.rejects(client({}).callAI('generation.create', {}), (error) => error.code === 'CLOUD_UNAVAILABLE')
})

test('image uploads use an owner-bound asset and confirm the uploaded cloud file', async () => {
  const calls = []
  const service = client({ cloud: {
    callFunction(options) {
      calls.push(options.data)
      return Promise.resolve({ result: { ok: true, data: options.data.action === 'assets.prepareUpload' ? { assetId: 'asset-1', cloudPath: 'private/asset-1.jpg' } : { assetId: 'asset-1', fileId: 'cloud://file-1' } } })
    },
    uploadFile(options) { calls.push({ upload: options }); return Promise.resolve({ fileID: 'cloud://file-1' }) }
  } })
  assert.deepEqual(await service.uploadImage('/tmp/photo.jpg'), { assetId: 'asset-1', fileId: 'cloud://file-1' })
  assert.equal(calls[0].action, 'assets.prepareUpload')
  assert.equal(calls[0].payload.purpose, 'identify')
  assert.equal(typeof calls[0].payload.clientRequestId, 'string')
  assert.equal(calls[1].upload.filePath, '/tmp/photo.jpg')
  assert.equal(calls[1].upload.cloudPath, 'private/asset-1.jpg')
  assert.deepEqual(calls[2].payload, { assetId: 'asset-1', fileId: 'cloud://file-1', purpose: 'identify' })
})

test('asset resolution returns temporary public URLs and rejects unusable cloud paths', async () => {
  let assets = [{ assetId: 'asset-1', fileId: 'cloud://file', url: 'https://cdn.example/image.jpg', expiresAt: 1234 }]
  const service = client({ cloud: { callFunction() { return Promise.resolve({ result: { ok: true, data: { assets } } }) } } })
  assert.deepEqual(await service.resolveAssets(['asset-1']), assets)
  assets = [{ assetId: 'asset-1', fileId: 'cloud://file', url: 'cloud://private-file' }]
  await assert.rejects(service.resolveAssets(['asset-1']), (error) => error.code === 'ASSET_URL_UNAVAILABLE')
})

test('request ids are nonempty and unique even with the same prefix', () => {
  client({})
  const { createRequestId } = require('../utils/cloud-service')
  assert.notEqual(createRequestId('generation'), createRequestId('generation'))
  assert.match(createRequestId('generation'), /^generation-/)
})

test('asset resolution rejects duplicate responses that omit a requested owner-bound asset', async () => {
  const asset = { assetId: 'asset-1', fileId: 'cloud://file', url: 'https://cdn.example/image.jpg' }
  const service = client({ cloud: { callFunction() { return Promise.resolve({ result: { ok: true, data: { assets: [asset, asset] } } }) } } })
  await assert.rejects(service.resolveAssets(['asset-1', 'asset-2']), (error) => error.code === 'ASSET_URL_UNAVAILABLE')
})
