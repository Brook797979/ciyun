const test = require('node:test')
const assert = require('node:assert/strict')
const { createModels } = require('../server/ai/providers')
const catalog = require('../data/ceramics')
const response = (content, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }), { status: 200 })
function setup(outputs, options = {}) {
  const requests = []; const durations = []; let now = 0
  const models = createModels({ env: { DEEPSEEK_API_KEY: 'test-only' }, clock: () => now,
    setTimeoutImpl(callback, duration) { durations.push(duration); return { unref() {} } }, clearTimeoutImpl() {},
    fetchImpl: async (url, config) => {
      requests.push(JSON.parse(config.body))
      if (options.advance) now += options.advance[requests.length - 1] || 0
      const output = outputs[Math.min(requests.length - 1, outputs.length - 1)]
      if (output instanceof Error) throw output
      return response(typeof output === 'string' ? output : output.content, output.finish || 'stop')
    }
  })
  return { models, requests, durations }
}
test('chat explicitly answers general ceramics outside the catalog and allows historical explanation', async () => {
  const s = setup(['{"answer":"骨瓷通过骨灰等配方形成细腻、透光的胎体。"}'])
  const result = await s.models.chat({ question: '英国骨瓷有什么特点？', catalog })
  assert.match(s.requests[0].messages[0].content, /不限于.*馆藏|不受.*馆藏.*限制/)
  assert.match(s.requests[0].messages[0].content, /发展|历史/)
  assert.match(s.requests[0].messages[0].content, /保养/)
  assert.match(result.answer, /骨瓷/); assert.deepEqual(result.sourceIds, [])
  assert.equal(s.requests[0].max_tokens, 2400); assert.equal(s.requests.length, 1)
})
test('optional invalid source metadata cannot reject an otherwise usable answer', async () => {
  const s = setup(['{"answer":"瓷器可按釉色和装饰工艺分类。","sourceIds":["not-in-catalog","ceramic-001","ceramic-001"]}'])
  const result = await s.models.chat({ question: '瓷器有哪几种？', catalog })
  assert.deepEqual(result.sourceIds, ['ceramic-001']); assert.equal(s.requests.length, 1)
})
test('complete plain text and fenced JSON are usable without a paid repair call', async () => {
  for (const text of ['陶瓷发展经历原始瓷、成熟青瓷及后来的彩瓷等阶段。', '```json\n{"answer":"汝窑以天青釉著称。","sourceIds":[]}\n```']) {
    const s = setup([text]); const result = await s.models.chat({ question: '介绍陶瓷', catalog: [] })
    assert.ok(result.answer.trim()); assert.deepEqual(result.sourceIds, []); assert.equal(s.requests.length, 1)
  }
})
test('chat repairs malformed JSON and missing answers once within a 45 second total budget', async () => {
  for (const invalid of ['{"answer":"尚未闭合', '{"sourceIds":[]}']) {
    const s = setup([invalid, '{"answer":"中国瓷器从早期青瓷逐步发展出多种釉色与彩饰工艺。","sourceIds":[]}'], { advance: [30000, 1000] })
    const result = await s.models.chat({ question: '介绍下中国瓷器的发展', history: [{ role: 'user', text: '你好' }, { role: 'assistant', text: '你好，可以问我陶瓷知识。' }], catalog })
    assert.match(result.answer, /中国瓷器/); assert.equal(s.requests.length, 2); assert.deepEqual(s.durations, [30000, 15000])
    assert.ok(s.requests[1].messages.some(message => message.content.includes('介绍下中国瓷器的发展')))
    assert.match(s.requests[1].messages.at(-1).content, /格式|完整/)
  }
})
test('truncated model output is repaired instead of presenting a partial answer', async () => {
  const s = setup([{ content: '{"answer":"发展史很长', finish: 'length' }, '{"answer":"中国瓷器在不同朝代形成各具特点的窑业与装饰工艺。","sourceIds":[]}'])
  assert.match((await s.models.chat({ question: '介绍瓷器发展史', catalog: [] })).answer, /中国瓷器/); assert.equal(s.requests.length, 2)
})
test('chat never repairs a second time after a failed format repair', async () => {
  const s = setup(['{"answer":', '{"answer":'])
  await assert.rejects(s.models.chat({ question: '瓷器是什么', catalog: [] }), { code: 'MODEL_INVALID_RESPONSE' }); assert.equal(s.requests.length, 2)
})
test('chat does not make a repair request when its format budget is exhausted', async () => {
  const s = setup(['{"answer":'], { advance: [45000] })
  await assert.rejects(s.models.chat({ question: '瓷器是什么', catalog: [] }), { code: 'MODEL_INVALID_RESPONSE' }); assert.equal(s.requests.length, 1)
})
test('uncertain transport errors are never automatically dispatched again', async () => {
  const s = setup([new Error('transport failed')])
  await assert.rejects(s.models.chat({ question: '瓷器是什么', catalog: [] }), cause => cause.code === 'MODEL_TIMEOUT' && cause.ambiguous === true)
  assert.equal(s.requests.length, 1)
})
test('uncertain transport during the single repair still propagates an unknown outcome', async () => {
  const s = setup(['{"answer":', new Error('repair connection lost')])
  await assert.rejects(s.models.chat({ question: '瓷器是什么', catalog: [] }), cause => cause.code === 'MODEL_TIMEOUT' && cause.ambiguous === true)
  assert.equal(s.requests.length, 2)
})
