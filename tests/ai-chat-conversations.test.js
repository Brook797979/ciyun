const assert = require('node:assert/strict')
const test = require('node:test')
const archive = require('../utils/ai-chat-conversations')
const round = index => [
  { role: 'user', text: `问题${index}`, id: `user-${index}`, createdAt: index * 2 },
  { role: 'assistant', text: `回答${index}`, id: `answer-${index}`, createdAt: index * 2 + 1 }
]

test('createConversation starts an empty named archive conversation at the supplied time', () => {
  assert.deepEqual(archive.createConversation('chat-001', 'ceramic-001', 1234), {
    id: 'chat-001', ceramicId: 'ceramic-001', title: '新的对话',
    createdAt: 1234, updatedAt: 1234, messages: [], input: '', active: null
  })
})

test('sanitizeMessages keeps completed display rounds beyond the four-round service history', () => {
  const messages = Array.from({ length: 42 }, (_, index) => round(index)).flat()
  const result = archive.sanitizeMessages(messages)
  assert.equal(result.length, 80)
  assert.equal(result[0].text, '问题2')
  assert.equal(result[79].text, '回答41')
  assert.deepEqual(result[0], messages[4])
})

test('sanitizeMessages rejects blank, malformed and unpaired messages without saving extra fields', () => {
  const result = archive.sanitizeMessages([
    null, { role: 'system', text: '系统规则' }, { role: 'assistant', text: '孤立回答' },
    { role: 'user', text: '被后问替代' }, { role: 'user', text: '有效问题', id: '../unsafe', url: 'https://invalid.example' },
    { role: 'assistant', text: '  ' }, { role: 'assistant', text: '有效回答', id: 'answer-safe', createdAt: -4, model: 'internal' },
    { role: 'user', text: '尚未回答' }
  ])
  assert.deepEqual(result, [
    { role: 'user', text: '有效问题', id: 'message_4', createdAt: 0 },
    { role: 'assistant', text: '有效回答', id: 'answer-safe', createdAt: 0 }
  ])
  assert.deepEqual(archive.sanitizeMessages({}), [])
})

test('sanitizeMessages limits question and answer text but saves only source identifiers', () => {
  const messages = [
    { role: 'user', text: '问'.repeat(600), sources: [{ id: 'ceramic-002' }] },
    { role: 'assistant', text: '答'.repeat(7000), sources: [
      { id: 'ceramic-001', name: '模型命名', image: 'https://untrusted.example/image.png' },
      { id: 'ceramic-001' }, { id: '../secret' }, { id: '' }, { id: 3 }, 'ceramic-002', null,
      { id: 'ceramic-002', url: 'https://untrusted.example' }
    ] }
  ]
  const original = structuredClone(messages)
  const result = archive.sanitizeMessages(messages)
  assert.equal(result[0].text.length, 500)
  assert.equal(result[1].text.length, 6000)
  assert.equal(result[0].sources, undefined)
  assert.deepEqual(result[1].sources, [{ id: 'ceramic-001' }, { id: 'ceramic-002' }])
  assert.deepEqual(messages, original)
})

test('sanitizeMessages repairs duplicate ids deterministically for individually keyed message rows', () => {
  const messages = [
    { role: 'user', text: '第一问', id: 'same' }, { role: 'assistant', text: '第一答', id: 'same' },
    { role: 'user', text: '第二问', id: 'message_1' }, { role: 'assistant', text: '第二答', id: 'message_1' }
  ]
  const result = archive.sanitizeMessages(messages)
  assert.equal(new Set(result.map(item => item.id)).size, 4)
  assert.ok(result.every(item => /^[A-Za-z0-9_-]{1,100}$/.test(item.id)))
  assert.deepEqual(archive.sanitizeMessages(messages), result)
  assert.deepEqual(archive.sanitizeMessages(result), result)
})

test('sanitizeArchive removes invalid records, keeps the latest duplicate, sorts and limits conversations', () => {
  const conversations = Array.from({ length: 14 }, (_, index) => ({
    ...archive.createConversation(`chat-${index}`, '', index), updatedAt: index
  }))
  const result = archive.sanitizeArchive({ version: 2, conversations: [
    ...conversations, { ...archive.createConversation('chat-1', '', 1), title: '较新版本', updatedAt: 100 },
    null, [], { id: '../invalid', updatedAt: 101 }, { id: 'x'.repeat(101) }
  ], private: 'drop' })
  assert.deepEqual(Object.keys(result), ['version', 'conversations'])
  assert.equal(result.version, 2)
  assert.equal(result.conversations.length, 12)
  assert.equal(result.conversations[0].id, 'chat-1')
  assert.equal(result.conversations[0].title, '较新版本')
  assert.equal(result.conversations[1].id, 'chat-13')
  assert.equal(result.conversations[11].id, 'chat-3')
  assert.equal(result.conversations.filter(item => item.id === 'chat-1').length, 1)
})

test('sanitizeArchive reconstructs a bounded serializable conversation without discarding long answers', () => {
  const conversation = {
    id: 'chat-long', ceramicId: 'c'.repeat(100), title: '  自定义标题  ',
    createdAt: 10, updatedAt: undefined, messages: [
      { role: 'user', text: '首问' }, { role: 'assistant', text: '答'.repeat(5000) }
    ], input: '问'.repeat(700), active: { payload: { question: '', clientRequestId: 'invalid' } }, model: 'private'
  }
  const original = structuredClone(conversation)
  const result = archive.sanitizeArchive({ version: 2, conversations: [conversation] }).conversations[0]
  assert.equal(result.ceramicId.length, 80)
  assert.equal(result.title, '自定义标题')
  assert.equal(result.updatedAt, 10)
  assert.equal(result.messages[1].text.length, 5000)
  assert.equal(result.input.length, 500)
  assert.equal(result.active, null)
  assert.deepEqual(Object.keys(result).sort(), ['id', 'ceramicId', 'title', 'createdAt', 'updatedAt', 'messages', 'input', 'active'].sort())
  assert.deepEqual(conversation, original)
})

test('sanitizeArchive validates active snapshots using the existing four-round service history contract', () => {
  const history = Array.from({ length: 6 }, (_, index) => round(index)).flat()
  history[11].text = '长'.repeat(5000)
  const conversation = { ...archive.createConversation('chat-pending', 'ceramic-001', 10), active: {
    status: 'unknown', payload: { question: '未确认的问题', clientRequestId: 'original-request-id', ceramicId: 'ceramic-001', history, modelUrl: 'https://invalid.example' }
  } }
  const result = archive.sanitizeArchive({ version: 2, conversations: [conversation] }).conversations[0]
  assert.equal(result.active.status, 'unknown')
  assert.equal(result.active.payload.clientRequestId, 'original-request-id')
  assert.equal(result.active.payload.question, '未确认的问题')
  assert.equal(result.active.payload.ceramicId, 'ceramic-001')
  assert.equal(result.active.payload.history.length, 8)
  assert.equal(result.active.payload.history[0].text, '问题2')
  assert.equal(result.active.payload.history[7].text.length, 1500)
  assert.equal(result.active.payload.modelUrl, undefined)
  conversation.active.payload.ceramicId = 'ceramic-002'
  assert.equal(archive.sanitizeArchive({ version: 2, conversations: [conversation] }).conversations[0].active, null)
})

test('sanitizeArchive supplies deterministic metadata for legacy messages and missing conversation fields', () => {
  const source = { version: 2, conversations: [
    { id: 'b', messages: [{ role: 'user', text: '青花的蓝色从哪里来？' }, { role: 'assistant', text: '钴料。' }] },
    { id: 'a' }
  ] }
  const result = archive.sanitizeArchive(source)
  assert.deepEqual(result.conversations.map(item => item.id), ['a', 'b'])
  assert.equal(result.conversations[0].title, '新的对话')
  assert.equal(result.conversations[1].title, '青花的蓝色从哪里来？')
  assert.equal(result.conversations[1].createdAt, 0)
  assert.equal(result.conversations[1].messages[0].createdAt, 0)
  assert.deepEqual(archive.sanitizeArchive(result), result)
  for (const invalid of [null, [], 'archive', {}, { version: 1, conversations: source.conversations }]) {
    assert.deepEqual(archive.sanitizeArchive(invalid), { version: 2, conversations: [] })
  }
})

test('createConversation rejects unsafe identifiers and bounds ceramic context and timestamps', () => {
  for (const id of ['', '../chat', 'chat space', 'x'.repeat(101), 123, null]) {
    assert.equal(archive.createConversation(id), null)
  }
  const result = archive.createConversation('safe_chat-1', '瓷'.repeat(90), -4)
  assert.equal(result.ceramicId.length, 80)
  assert.equal(result.createdAt, 0)
  assert.equal(result.updatedAt, 0)
  assert.equal(archive.createConversation('without-context', {}).ceramicId, '')
})

test('upsertConversation replaces matching conversations and returns a clean immutable archive', () => {
  const original = { version: 2, conversations: [
    archive.createConversation('a', '', 20), archive.createConversation('b', '', 10)
  ] }
  const snapshot = structuredClone(original)
  const replacement = { ...archive.createConversation('b', '', 30), input: '保留的草稿' }
  const result = archive.upsertConversation(original, replacement)
  assert.deepEqual(result.conversations.map(item => item.id), ['b', 'a'])
  assert.equal(result.conversations[0].input, '保留的草稿')
  assert.equal(result.conversations.length, 2)
  assert.deepEqual(original, snapshot)
  replacement.input = '随后修改'
  assert.equal(result.conversations[0].input, '保留的草稿')
  const earlier = archive.upsertConversation(result, { ...result.conversations[0], updatedAt: 1, input: '显式替换' })
  assert.equal(earlier.conversations.find(item => item.id === 'b').input, '显式替换')
})

test('upsertConversation creates a capped archive and ignores invalid replacement records', () => {
  let result = null
  for (let index = 0; index < 14; index++) result = archive.upsertConversation(result, archive.createConversation(`new-${index}`, '', index))
  assert.equal(result.version, 2)
  assert.equal(result.conversations.length, 12)
  assert.equal(result.conversations[0].id, 'new-13')
  assert.equal(result.conversations[11].id, 'new-2')
  assert.deepEqual(archive.upsertConversation(result, { id: '../unsafe' }), result)
  assert.equal(archive.ARCHIVE_KEY, 'aiChatConversationsV2')
  assert.equal(archive.MAX_CONVERSATIONS, 12)
  assert.equal(archive.MAX_MESSAGES, 80)
})
