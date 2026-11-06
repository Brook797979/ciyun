const assert = require('node:assert/strict')
const test = require('node:test')

const storePath = require.resolve('../utils/craft-works')

function environment(t, initial) {
  const previousWx = global.wx
  const values = new Map()
  if (initial !== undefined) values.set('craftWorks', initial)
  const reads = []
  const writes = []
  global.wx = {
    getStorageSync(key) { reads.push(key); return values.has(key) ? values.get(key) : '' },
    setStorageSync(key, value) { writes.push({ key, value }); values.set(key, value) },
    cloud: {
      callFunction() { assert.fail('Deleting a local work must not touch cloud tasks') },
      deleteFile() { assert.fail('Deleting a local work must not delete cloud assets') }
    }
  }
  t.after(() => { global.wx = previousWx })
  return { values, reads, writes }
}

function removeWork(id) {
  const store = require(storePath)
  assert.equal(typeof store.removeWork, 'function', 'The shared work store must export removeWork(id)')
  return store.removeWork(id)
}

test('removal deletes every matching id and preserves other fields and their raw order', (t) => {
  const first = { id: 'keep-b', name: '保留乙', image: '/b.jpg', createdAt: '2026-01-01', custom: { notes: ['不改动'] } }
  const last = { id: 'keep-a', name: '保留甲', image: '/a.jpg', createdAt: '2026-10-01', assetId: 'other-asset', fileId: 'cloud://other' }
  const original = [first, { id: 'ai-task', name: '待删', image: 'https://example.com/image.jpg', taskId: 'task', assetId: 'private-asset', fileId: 'cloud://private' }, null, { legacy: true }, { id: 'ai-task', duplicate: true }, last]
  const before = structuredClone(original)
  const { values, writes } = environment(t, original)
  assert.equal(removeWork('ai-task'), true)
  assert.deepEqual(values.get('craftWorks'), [first, null, { legacy: true }, last])
  assert.deepEqual(original, before, 'The previously read array must remain intact')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].key, 'craftWorks')
})

test('invalid ids return false without reading or writing storage', (t) => {
  const { reads, writes } = environment(t, [{ id: 'keep' }])
  for (const id of ['', '   ', null, undefined, 0, false, {}, [], ['keep']]) assert.equal(removeWork(id), false)
  assert.deepEqual(reads, [])
  assert.deepEqual(writes, [])
})

test('an unmatched id returns false and never rewrites the collection', (t) => {
  const original = [{ id: 'keep', unknownField: true }]
  const { values, writes } = environment(t, original)
  assert.equal(removeWork('missing'), false)
  assert.equal(values.get('craftWorks'), original)
  assert.deepEqual(writes, [])
})

test('missing and empty collections return false without writing', (t) => {
  const { values, writes } = environment(t)
  assert.equal(removeWork('missing'), false)
  assert.equal(values.has('craftWorks'), false)
  values.set('craftWorks', [])
  assert.equal(removeWork('missing'), false)
  assert.deepEqual(writes, [])
})

test('damaged collections throw and are never replaced', (t) => {
  const { values, writes } = environment(t)
  for (const invalid of [null, {}, 'broken', 12, false]) {
    values.set('craftWorks', invalid)
    assert.throws(() => removeWork('target'), /作品记录暂时无法读取/)
    assert.equal(values.get('craftWorks'), invalid)
  }
  assert.deepEqual(writes, [])
})

test('storage read errors propagate without writing or losing the unread collection', (t) => {
  const original = [{ id: 'target', keep: true }]
  const { values, writes } = environment(t, original)
  const failure = new Error('read unavailable')
  global.wx.getStorageSync = () => { throw failure }
  assert.throws(() => removeWork('target'), (error) => error === failure)
  assert.equal(values.get('craftWorks'), original)
  assert.deepEqual(writes, [])
})

test('storage write errors propagate and do not mutate the original records', (t) => {
  const original = [{ id: 'target', nested: { keep: true } }, { id: 'other' }]
  const { values } = environment(t, original)
  const before = structuredClone(original)
  const failure = new Error('write unavailable')
  global.wx.setStorageSync = () => { throw failure }
  assert.throws(() => removeWork('target'), (error) => error === failure)
  assert.deepEqual(values.get('craftWorks'), before)
  assert.deepEqual(original, before)
})

test('a successful deletion survives module reloads and repeating it performs no additional write', (t) => {
  const kept = { id: 'kept', name: '保留', image: '/kept.jpg' }
  const { values, writes } = environment(t, [{ id: 'removed', name: '删除', image: '/removed.jpg' }, kept])
  assert.equal(removeWork('removed'), true)
  delete require.cache[storePath]
  const reloaded = require(storePath)
  assert.deepEqual(reloaded.getWorks(), [kept])
  assert.deepEqual(values.get('craftWorks'), [kept])
  assert.equal(reloaded.removeWork('removed'), false)
  assert.equal(writes.length, 1)
})
