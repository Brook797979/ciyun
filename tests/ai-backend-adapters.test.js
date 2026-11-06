const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const base = path.resolve(__dirname, '..')
function adapter(file, exported) {
  let loaded
  try { loaded = require(`../server/ai/${file}`) } catch (cause) { if (cause.code !== 'MODULE_NOT_FOUND') throw cause }
  assert.equal(typeof loaded?.[exported], 'function', `${exported} should exist`)
  return loaded[exported]
}
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex')
const identification = { status: 'uncertain', shape: '瓶', category: '瓷器', patterns: [], glazeDescription: '白釉', technique: '观察不足', observations: [], cultureIntro: '仅作文化观察' }
test('DeepSeek visual request sends actual image blocks and disables thinking', async () => {
  const createModels = adapter('providers', 'createModels')
  let sent
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return json({ choices: [{ message: { content: JSON.stringify(identification) } }] }) } })
  const r = await models.identify({ url: 'https://private.invalid/image.png', catalog: [] })
  assert.equal(r.status, 'uncertain')
  assert.equal(sent.url, 'https://api.deepseek.com/chat/completions')
  assert.equal(sent.body.model, 'deepseek-flash')
  assert.deepEqual(sent.body.thinking, { type: 'disabled' })
  assert.ok(sent.body.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'image_url')))
})
test('Seedream uses server model and a single URL image with supplier watermark', async () => {
  const createModels = adapter('providers', 'createModels')
  let body
  const models = createModels({ env: { ARK_API_KEY: 'test-key', IMAGE_MODEL: 'server-configured-model' }, fetchImpl: async (url, options) => { assert.equal(url, 'https://ark.cn-beijing.volces.com/api/v3/images/generations'); body = JSON.parse(options.body); return json({ data: [{ url: 'https://ark.tos-cn-beijing.volces.com/image.png' }] }) } })
  const generated = await models.generate({ userPrompt: '莲花', style: { name: '青花', generationPrompt: '钴蓝釉下绘' } })
  assert.ok(generated.url)
  assert.equal(body.model, 'server-configured-model')
  assert.equal(body.response_format, 'url')
  assert.equal(body.sequential_image_generation, 'disabled')
  assert.equal(body.watermark, true)
  assert.match(body.prompt, /钴蓝釉下绘/)
})
test('Seedream sends style priority for a conflicting powder-color prompt and antique style', async () => {
  const createModels = adapter('providers', 'createModels')
  let body
  const models = createModels({ env: { ARK_API_KEY: 'test-key', IMAGE_MODEL: 'configured' }, fetchImpl: async (url, options) => { body = JSON.parse(options.body); return json({ data: [{ url: 'https://ark.tos-cn-beijing.volces.com/image.png' }] }) } })
  await models.generate({ userPrompt: '粉彩牡丹赏瓶，粉红嫩绿设色', style: require('../data/ai-create').styles.find(style => style.id === 'antique') })
  assert.match(body.prompt, /风格优先规则/)
  assert.match(body.prompt, /器型.*主题.*构图/)
  assert.match(body.prompt, /antique/)
  assert.match(body.prompt, /工艺.*配色.*釉面/)
  assert.match(body.prompt, /冲突.*重新诠释/)
})
test('identification repairs JSON or schema once using the same immutable image within 45 seconds', async () => {
  const createModels = adapter('providers', 'createModels')
  for (const malformed of ['not-json', JSON.stringify({ status: 'recognized' })]) {
    let now = 0
    const requests = []
    const durations = []
    const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, clock: () => now,
      setTimeoutImpl(callback, duration) { durations.push(duration); return { unref() {} } }, clearTimeoutImpl() {},
      fetchImpl: async (url, options) => {
        requests.push(JSON.parse(options.body))
        if (requests.length === 1) now += 30000
        return json({ choices: [{ message: { content: requests.length === 1 ? malformed : JSON.stringify(identification) } }] })
      }
    })
    assert.deepEqual(await models.identify({ url: 'https://private.invalid/verified.png', catalog: [] }), identification)
    assert.equal(requests.length, 2)
    assert.deepEqual(durations, [30000, 15000])
    for (const request of requests) {
      const image = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).find(block => block.type === 'image_url')
      assert.equal(image.image_url.url, 'https://private.invalid/verified.png')
    }
  }
})
test('identification never repairs a second time after malformed repaired output', async () => {
  const createModels = adapter('providers', 'createModels')
  let calls = 0
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async () => { calls++; return json({ choices: [{ message: { content: 'invalid-json' } }] }) } })
  await assert.rejects(models.identify({ url: 'https://private.invalid/verified.png', catalog: [] }), { code: 'MODEL_INVALID_RESPONSE' })
  assert.equal(calls, 2)
})
test('chat asks for concise 80–150 character guide answers and supports requested expansion', async () => {
  const createModels = adapter('providers', 'createModels')
  let body
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async (url, options) => { body = JSON.parse(options.body); return json({ choices: [{ message: { content: '{"answer":"青花","sourceIds":[]}' } }] }) } })
  await models.chat({ question: '青花', catalog: [] })
  assert.match(body.messages[0].content, /80.*150/)
  assert.match(body.messages[0].content, /用户.*扩展/)
  assert.equal(body.max_tokens, 2400)
})
test('generation retains supplier request ID and explicit URL expiry', async () => {
  const createModels = adapter('providers', 'createModels')
  const models = createModels({ env: { ARK_API_KEY: 'test-key', IMAGE_MODEL: 'configured' }, fetchImpl: async () => new Response(JSON.stringify({ data: [{ url: 'https://ark.tos-cn-beijing.volces.com/image.png', expires_at: 1900000000 }] }), { status: 200, headers: { 'x-request-id': 'upstream-request-one' } }) })
  const result = await models.generate({ userPrompt: '青花', style: {} })
  assert.equal(result.requestId, 'upstream-request-one')
  assert.equal(result.expiresAt, 1900000000000)
})
test('download timeout is 30 seconds', () => {
  assert.equal(require('../server/ai/storage').DOWNLOAD_TIMEOUT_MS, 30000)
})
test('provider refuses absent credentials without making a network request', async () => {
  const createModels = adapter('providers', 'createModels')
  const models = createModels({ env: {}, fetchImpl: async () => { assert.fail('network must not run') } })
  assert.throws(() => models.assertConfigured('generation'), { code: 'MODEL_NOT_CONFIGURED' })
  assert.throws(() => models.assertConfigured('chat'), { code: 'MODEL_NOT_CONFIGURED' })
})
test('network interruptions after model dispatch are ambiguous and safe', async () => {
  const createModels = adapter('providers', 'createModels')
  const models = createModels({ env: { ARK_API_KEY: 'test-key', IMAGE_MODEL: 'configured' }, fetchImpl: async () => { throw new Error('sensitive upstream detail') } })
  await assert.rejects(models.generate({ userPrompt: '莲花', style: {} }), cause => cause.ambiguous === true && !cause.message.includes('sensitive'))
})
test('provider rejects malformed JSON and multiple generated outputs', async () => {
  const createModels = adapter('providers', 'createModels')
  const models = createModels({ env: { ARK_API_KEY: 'test-key', IMAGE_MODEL: 'configured' }, fetchImpl: async () => json({ data: [{ url: 'one' }, { url: 'two' }] }) })
  await assert.rejects(models.generate({ userPrompt: '莲花', style: {} }), { code: 'MODEL_INVALID_RESPONSE' })
})
test('generated image downloader rejects arbitrary destinations before networking', async () => {
  const downloadImage = adapter('storage', 'downloadImage')
  for (const url of ['http://ark.tos-cn-beijing.volces.com/image', 'https://127.0.0.1/image', 'https://evil.invalid/image', 'https://ark.tos-cn-beijing.volces.com:444/image', 'https://user:pass@ark.tos-cn-beijing.volces.com/image']) {
    await assert.rejects(downloadImage(url, { fetchImpl: async () => assert.fail('must not fetch') }), { code: 'INVALID_RESULT_URL' })
  }
})
test('generated image downloader revalidates every redirect host', async () => {
  const downloadImage = adapter('storage', 'downloadImage')
  let calls = 0
  await assert.rejects(downloadImage('https://ark.tos-cn-beijing.volces.com/image', { fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://evil.invalid/image' } }) } }), { code: 'INVALID_RESULT_URL' })
  assert.equal(calls, 1)
})
test('generated image downloader verifies magic bytes and bounded streaming size', async () => {
  const downloadImage = adapter('storage', 'downloadImage')
  assert.deepEqual(await downloadImage('https://ark.tos-cn-beijing.volces.com/image', { fetchImpl: async () => new Response(png) }), png)
  await assert.rejects(downloadImage('https://ark.tos-cn-beijing.volces.com/image', { fetchImpl: async () => new Response('html error') }), { code: 'INVALID_IMAGE' })
  await assert.rejects(downloadImage('https://ark.tos-cn-beijing.volces.com/image', { maxBytes: 4, fetchImpl: async () => new Response(png) }), { code: 'INVALID_IMAGE' })
})
test('cloud storage validates file environment and keeps URL mapping by fileID', async () => {
  const createStorage = adapter('storage', 'createStorage')
  const cloud = { async getTempFileURL() { return { fileList: [{ fileID: 'cloud://env.bucket/b', tempFileURL: 'https://signed/b' }, { fileID: 'cloud://env.bucket/a', tempFileURL: 'https://signed/a' }] } } }
  const storage = createStorage({ cloud, env: { TCB_ENV: 'env' }, clock: () => 100 })
  assert.equal(storage.validateFileId('cloud://env.bucket/a', 'a'), true)
  assert.equal(storage.validateFileId('cloud://other.bucket/a', 'a'), false)
  assert.equal(storage.validateFileId('cloud://env.bucket/private/a', 'a'), false)
  const signed = await storage.sign(['cloud://env.bucket/a', 'cloud://env.bucket/b'])
  assert.equal(signed[0].url, 'https://signed/a')
  assert.equal(signed[0].expiresAt, 300100)
})
test('verified image storage uploads the already-validated bytes to a server-only path', async () => {
  const createStorage = adapter('storage', 'createStorage')
  let uploaded
  const storage = createStorage({ cloud: { async uploadFile(request) { uploaded = request; return { fileID: `cloud://env.bucket/${request.cloudPath}` } } }, env: { TCB_ENV: 'env' } })
  assert.equal(typeof storage.saveVerified, 'function', 'verified storage operation should exist')
  const fileId = await storage.saveVerified(png, 'ai/verified/owner/asset.png')
  assert.equal(fileId, 'cloud://env.bucket/ai/verified/owner/asset.png')
  assert.deepEqual(uploaded.fileContent, png)
})
test('cloud repository transactions use document IDs and never where queries', async () => {
  const CloudRepository = adapter('cloud-repository', 'CloudRepository')
  const writes = []
  const tx = {
    collection(collection) {
      return {
        where() { assert.fail('transaction cannot use where') },
        doc(id) {
          return { async get() { return { data: { id, owner: 'owner' } } }, async set({ data }) { writes.push({ collection, id, data }) } }
        }
      }
    }
  }
  const repo = new CloudRepository({ async runTransaction(callback) { return callback(tx) } })
  await repo.transaction(async transaction => { const doc = await transaction.get('ai_tasks', 'task-one'); await transaction.set('ai_tasks', doc.id, { ...doc, status: 'queued' }) })
  assert.equal(writes[0].id, 'task-one')
})
test('worker runtime rejects client OPENID even with a forged timer event', async () => {
  const createRuntime = adapter('runtime', 'createRuntime')
  let processed = 0
  const runtime = createRuntime({ cloud: { getWXContext() { return { OPENID: 'user-a', APPID: 'app-a' } } }, service: { async workOne() { processed++; return { status: 'idle' } } }, env: {} })
  const r = await runtime.worker({ Type: 'Timer', Time: new Date().toISOString() })
  assert.equal(r.ok, false)
  assert.equal(processed, 0)
})
test('worker accepts timer shape only behind nonpublic platform deployment', async () => {
  const createRuntime = adapter('runtime', 'createRuntime')
  let processed = 0
  const runtime = createRuntime({ cloud: { getWXContext() { return {} } }, service: { async workOne() { processed++; return { status: 'idle' } } }, env: { TRIGGER_SRC: 'timer' } })
  assert.equal((await runtime.worker({ Type: 'Timer', Time: new Date().toISOString() })).ok, true)
  assert.equal((await runtime.worker({ Type: 'client' })).ok, false)
  assert.equal(processed, 1)
})
test('function builder ships self-contained source and catalog with pinned SDK', () => {
  const script = path.join(base, 'scripts/build-ai-functions.js')
  assert.equal(fs.existsSync(script), true, 'AI function builder should exist')
  execFileSync(process.execPath, [script], { cwd: base })
  for (const name of ['ciyun-ai', 'ciyun-image-worker']) {
    const root = path.join(base, 'cloudfunctions', name)
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies['wx-server-sdk'], '4.0.2')
    assert.equal(fs.existsSync(path.join(root, 'server/ai/runtime.js')), true)
    assert.deepEqual(require(path.join(root, 'data/ai-create')).styles, require('../data/ai-create').styles)
    assert.equal(typeof require(path.join(root, 'server/ai')).createService, 'function')
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false)
  }
})
