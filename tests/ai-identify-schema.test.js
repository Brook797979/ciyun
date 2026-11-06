const test = require('node:test')
const assert = require('node:assert/strict')
const { validateIdentify } = require('../server/ai/validation')
const { createModels } = require('../server/ai/providers')

const legacy = { status: 'recognized', shape: '梅瓶', category: '瓷器', patterns: ['缠枝莲纹'], glazeDescription: '白釉蓝纹', technique: '釉下彩线索', observations: ['蓝白相映'], cultureIntro: '仅根据可见特征进行文化观察。' }
const json = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 })

test('identification keeps and trims optional observational name and visible tags', () => {
  const result = validateIdentify({ ...legacy, name: ' 青花莲纹梅瓶 ', tags: [' 青花 ', '莲纹'] }, [])
  assert.equal(result.name, '青花莲纹梅瓶')
  assert.deepEqual(result.tags, ['青花', '莲纹'])
})

test('legacy identification remains valid without name or tags for every status', () => {
  for (const status of ['recognized', 'uncertain', 'not_ceramic']) {
    const value = { ...legacy, status }
    assert.deepEqual(validateIdentify(value, []), value)
  }
})

test('name and tags are independently optional and allow empty unknown values', () => {
  assert.deepEqual(validateIdentify({ ...legacy, name: '' }, []), { ...legacy, name: '' })
  assert.deepEqual(validateIdentify({ ...legacy, tags: [] }, []), { ...legacy, tags: [] })
  assert.deepEqual(validateIdentify({ ...legacy, tags: [''] }, []), { ...legacy, tags: [''] })
})

test('identification accepts the exact name and tag size boundaries', () => {
  const value = { ...legacy, name: '瓷'.repeat(120), tags: Array.from({ length: 6 }, () => '蓝'.repeat(40)) }
  assert.deepEqual(validateIdentify(value, []), value)
})

test('identification rejects invalid optional name types and overlong names', () => {
  for (const name of [null, undefined, 3, [], {}, true, '瓷'.repeat(121)]) {
    assert.throws(() => validateIdentify({ ...legacy, name }, []), { code: 'MODEL_INVALID_RESPONSE' })
  }
})

test('identification rejects invalid tags types, item types and size limits', () => {
  for (const tags of [null, undefined, '青花', {}, [3], [null], [undefined], [{}], Array(7).fill('青花'), ['蓝'.repeat(41)]]) {
    assert.throws(() => validateIdentify({ ...legacy, tags }, []), { code: 'MODEL_INVALID_RESPONSE' })
  }
})

test('identification only returns documented observation fields', () => {
  const result = validateIdentify({ ...legacy, name: '青花梅瓶', tags: ['蓝白'], possibleEra: '明代', origin: '景德镇' }, [])
  assert.equal(result.name, '青花梅瓶')
  assert.equal(Object.hasOwn(result, 'possibleEra'), false)
  assert.equal(Object.hasOwn(result, 'origin'), false)
})

test('identification prompt requests bounded observational name and visible tags with existing safety rules', async () => {
  let sent
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async (url, options) => { sent = JSON.parse(options.body); return json(legacy) } })
  await models.identify({ url: 'https://private.invalid/verified.png', catalog: [] })
  const prompt = sent.messages[0].content
  assert.match(prompt, /name/)
  assert.match(prompt, /120/)
  assert.match(prompt, /观察性名称/)
  assert.match(prompt, /tags/)
  assert.match(prompt, /6/)
  assert.match(prompt, /40/)
  assert.match(prompt, /tags[^。]*可见特征/)
  assert.match(prompt, /不得断言年代、真伪、价值或来源/)
  assert.doesNotMatch(prompt, /possibleEra|origin/)
})

test('identification culture introduction describes the ceramic culture without appraisal caveats or catalog references', async () => {
  let sent
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async (url, options) => { sent = JSON.parse(options.body); return json(legacy) } })
  await models.identify({ url: 'https://private.invalid/verified.png', catalog: [] })
  const prompt = sent.messages[0].content
  assert.match(prompt, /cultureIntro[^。]*80[–-]150字/)
  assert.match(prompt, /器型、纹饰、工艺与文化寓意/)
  assert.match(prompt, /不含鉴定限制、馆藏编号或对照说明/)
  assert.match(prompt, /不确定时仅介绍可辨类别的一般文化/)
  assert.match(prompt, /不编造具体年代、产地或真伪结论/)
  assert.doesNotMatch(prompt, /cultureIntro应解释观察局限/)
})

test('invalid new identification fields receive one repair with the existing time budget and immutable image', async () => {
  let now = 0
  const requests = []
  const durations = []
  const repaired = { ...legacy, name: '青花梅瓶', tags: ['蓝白'] }
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, clock: () => now,
    setTimeoutImpl(callback, duration) { durations.push(duration); return { unref() {} } }, clearTimeoutImpl() {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body))
      if (requests.length === 1) now += 30000
      return json(requests.length === 1 ? { ...legacy, name: 123 } : repaired)
    }
  })
  assert.deepEqual(await models.identify({ url: 'https://private.invalid/verified.png', catalog: [] }), repaired)
  assert.equal(requests.length, 2)
  assert.deepEqual(durations, [30000, 15000])
  for (const request of requests) {
    const image = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).find(block => block.type === 'image_url')
    assert.equal(image.image_url.url, 'https://private.invalid/verified.png')
  }
})

test('invalid repaired name or tags never triggers another repair', async () => {
  let requests = 0
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl: async () => { requests++; return json({ ...legacy, tags: '青花' }) } })
  await assert.rejects(models.identify({ url: 'https://private.invalid/verified.png', catalog: [] }), { code: 'MODEL_INVALID_RESPONSE' })
  assert.equal(requests, 2)
})
